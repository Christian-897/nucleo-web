/**
 * CATÁLOGO EN EL BORDE: muestra lo editado en el panel sin reconstruir.
 *
 * Las páginas del sitio son estáticas. Este middleware las modifica
 * MIENTRAS viajan al visitante (HTMLRewriter de Cloudflare, por trozos,
 * microsegundos), igual que el panel de Muebles Crea:
 *
 *  - LISTAS: un contenedor `data-cat-lista="filtro"` trae N "espacios"
 *    (`data-cat-slot`). Se llenan en orden con los productos que pasan el
 *    filtro y los que sobran se quitan. Los campos van marcados con
 *    `data-cat="campo"`.
 *  - FICHA: `/producto/<id>/` se arma desde UNA plantilla, llenando los
 *    `data-ficha="campo"`. Así un producto creado hoy ya tiene página.
 *    `data-ficha="galeria"` (una <ul>) recibe las miniaturas de todas las
 *    fotos (y del video, si tiene, al final); con una sola foto y sin
 *    video se oculta. Ver `galeria.ts` (navegador).
 *  - CATEGORÍAS: si se cambió el nombre o la foto de una categoría en el
 *    panel, todo elemento `data-categoria="<id>"` se pone al día según
 *    `data-categoria-campo` (uno o varios, separados por espacio):
 *      nombre · corto · bajada · imagen (src) · alt · texto · content
 *    "texto" y "content" (atributo de <meta>) usan la plantilla de
 *    `data-categoria-plantilla`, con {nombre} y {corto}.
 *  - CATEGORÍAS CREADAS O BORRADAS en el panel: en cada lista de categorías
 *    del sitio (menú, pie, filtros, tarjetas de portada), un contenedor
 *    `data-cats-lista` trae un elemento `data-cats-item="<id>"` por cada
 *    categoría del sitio (se quita si se borró) y N espacios ocultos
 *    `data-cats-slot` que se llenan, en orden, con las categorías nuevas.
 *    Dentro del espacio, `data-cats="campo"`: enlace (href) · nombre ·
 *    corto · bajada · imagen (src) · alt. En /tienda/<id>/, el enlace de esa
 *    categoría recibe aria-current="page".
 *  - PÁGINA DE CATEGORÍA NUEVA: `crearPaginaCategoria` arma /tienda/<id>/
 *    desde la plantilla estática (por defecto /tienda/plantilla/).
 *
 * Seguridad: TODO texto se inserta con `html: false` (las etiquetas se ven
 * escritas, no se ejecutan) o con setAttribute (escapa en atributo). Las
 * direcciones de imagen salen de una lista cerrada (/media/ o /img/). El
 * JSON-LD escapa "<". Nada de lo que guarda el panel se vuelve marcado.
 *
 * Si nadie ha editado el catálogo, las listas pasan sin tocar: lo estático
 * ya es correcto.
 */
import type { EnvBase } from "../../core/tipos";
import { formatearPrecio } from "../carrito/formato";
import { type CatalogoODinamico, esDinamico, resolverCatalogo } from "./almacen";
import { ID_VALIDO } from "./catalogo";
import type { Catalogo, CategoriaCatalogo, ProductoCatalogo } from "./tipos";
import { ID_VIDEO, miniaturaVideo } from "./video";
import { idConColor, imagenPrincipal, tieneColores } from "./colores";
import { AJUSTES_FICHA_POR_DEFECTO, type AjustesFicha, obtenerAjustesFicha } from "./ficha";

// ─────────────────── tipos mínimos de HTMLRewriter (sin workers-types) ───────────────────
interface ElementoHtml {
  getAttribute(nombre: string): string | null;
  setAttribute(nombre: string, valor: string): void;
  removeAttribute(nombre: string): void;
  setInnerContent(contenido: string, opciones?: { html?: boolean }): void;
  remove(): void;
}
interface Reescritor {
  on(selector: string, manejador: { element(el: ElementoHtml): void }): Reescritor;
  transform(r: Response): Response;
}
declare const HTMLRewriter: { new (): Reescritor };

export interface EnvBorde extends EnvBase {
  /** Lo inyecta Cloudflare Pages: sirve los archivos estáticos sin pasar por Functions. */
  ASSETS?: { fetch(input: Request | string): Promise<Response> };
}

export interface OpcionesBorde {
  /** Imagen si el producto no tiene foto. */
  imagenPorDefecto: string;
  /** Plantilla estática de la ficha. Por defecto "/producto/plantilla/". */
  plantillaFicha?: string;
  /** Plantilla estática de la página de una categoría nueva. Por defecto "/tienda/plantilla/". */
  plantillaCategoria?: string;
  /** Id de categoría con que se construyó esa plantilla. Por defecto "plantilla". */
  idPlantillaCategoria?: string;
  /** Página 404 estática. Por defecto "/404.html". */
  pagina404?: string;
  /** Datos para el título, el JSON-LD y las direcciones absolutas. */
  sitio: { nombre: string; dominio: string };
}

// ───────────────────────────── filtros de listas (puros, probados) ─────────────────────────────

/**
 * Productos de una lista según su filtro:
 *   "todos" · "destacados" · "categoria:<id>" · "relacionados:<categoria>:<excluirId>"
 * El largo lo pone la cantidad de espacios que trae la página.
 */
export function productosDeLista(catalogo: Catalogo, filtro: string): ProductoCatalogo[] {
  const [tipo, a = "", b = ""] = filtro.split(":");
  switch (tipo) {
    case "todos":
      return catalogo.productos;
    case "destacados":
      // Los más nuevos primero: lo recién destacado en el panel se ve.
      return [...catalogo.destacados()].reverse();
    case "categoria":
      return catalogo.deCategoria(a);
    case "relacionados":
      return catalogo.deCategoria(a).filter((p) => p.id !== b);
    default:
      return [];
  }
}

/** Solo imágenes propias: subidas al panel (/media/) o del sitio (/img/). */
export function imagenSegura(valor: unknown, porDefecto: string): string {
  return typeof valor === "string" && /^\/(media|img)\/[a-zA-Z0-9/_.-]{1,150}$/.test(valor) && !valor.includes("..")
    ? valor
    : porDefecto;
}

/** Todas las fotos válidas del producto, la principal primero (sin repetir). */
export function fotosSeguras(p: Pick<ProductoCatalogo, "imagen" | "fotos">): string[] {
  const todas = [p.imagen, ...(p.fotos ?? [])].map((f) => imagenSegura(f, "")).filter(Boolean);
  return [...new Set(todas)];
}

/**
 * Miniaturas de la galería. Las direcciones ya pasaron por `imagenSegura`
 * (solo letras, números, / _ . -), así que no pueden cerrar el atributo ni
 * meter marcado. El video es solo su código de YouTube (letras, números,
 * - y _), revisado aquí de nuevo.
 */
export function htmlGaleria(fotos: string[], video?: string): string {
  const conVideo = typeof video === "string" && ID_VIDEO.test(video);
  const total = fotos.length + (conVideo ? 1 : 0);
  const minis = fotos.map(
    (f, i) =>
      `<li><button type="button" class="galeria__mini" data-galeria-foto="${f}" aria-label="Ver foto ${i + 1} de ${total}"${
        i === 0 ? ' aria-current="true"' : ""
      }><img src="${f}" alt="" width="72" height="72" loading="lazy" decoding="async"></button></li>`
  );
  if (conVideo) {
    minis.push(
      `<li><button type="button" class="galeria__mini galeria__mini--video" data-galeria-video="${video}" aria-label="Ver el video del producto"><img src="${miniaturaVideo(video!)}" alt="" width="72" height="72" loading="lazy" decoding="async" referrerpolicy="no-referrer"><span class="galeria__play" aria-hidden="true">▶</span></button></li>`
    );
  }
  return minis.join("");
}

/** Texto seguro dentro de HTML (nombres de colores). */
function escaparHtml(t: string): string {
  return t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/**
 * Miniaturas de los colores (botones). Los ids y direcciones ya están
 * validados (solo letras, números, - ~ / _ .); los nombres van escapados.
 * El primero queda elegido; el navegador marca los agotados con el stock real.
 */
export function htmlColores(p: ProductoCatalogo, imagenPorDefecto: string): string {
  return (p.colores ?? [])
    .map((c, i) => {
      const id = idConColor(p.id, c.id);
      const foto = imagenSegura(c.foto ?? p.imagen, imagenPorDefecto);
      const mini = imagenSegura(c.mini ?? c.foto ?? p.imagen, imagenPorDefecto);
      const nombre = escaparHtml(c.nombre);
      return `<li><button type="button" class="colores__mini" data-color="${id}" data-color-nombre="${nombre}" data-color-foto="${foto}" data-color-mini="${mini}" aria-label="${nombre}" aria-pressed="${i === 0}" title="${nombre}"><img src="${mini}" alt="" width="76" height="76" loading="lazy" decoding="async"></button></li>`;
    })
    .join("");
}

function plural(titulo: string, n: number): string {
  const t = titulo.toLowerCase();
  return n === 1 ? `1 ${t}` : `${n} ${t === "color" ? "colores" : `${t}s`}`;
}

// ───────────────────────────── relleno de campos ─────────────────────────────

function llenarCampo(el: ElementoHtml, campo: string, p: ProductoCatalogo, op: OpcionesBorde) {
  const url = `/producto/${p.id}/`;
  const imagen = imagenSegura(imagenPrincipal(p), op.imagenPorDefecto);
  switch (campo) {
    case "enlace":
      el.setAttribute("href", url);
      break;
    case "nombre":
      el.setInnerContent(p.nombre, { html: false });
      break;
    case "precio":
      el.setInnerContent(formatearPrecio(p.precio), { html: false });
      break;
    case "imagen":
      el.setAttribute("src", imagen);
      break;
    case "imagen-alt":
      el.setAttribute("src", imagen);
      el.setAttribute("alt", p.nombre);
      break;
    case "digital":
      if (p.tipo === "digital") el.removeAttribute("hidden");
      else el.setAttribute("hidden", "");
      break;
    case "agregar":
      if (tieneColores(p)) {
        // Con colores no se agrega desde la lista: el botón lleva a la ficha para elegir.
        el.setAttribute("data-elegir", url);
        el.setAttribute("data-id", p.id);
        el.setAttribute("aria-label", `Elegir ${(p.tituloColores ?? "Color").toLowerCase()} de ${p.nombre}`);
        break;
      }
      el.removeAttribute("data-elegir");
      el.setAttribute("data-id", p.id);
      el.setAttribute("data-nombre", p.nombre);
      el.setAttribute("data-precio", String(p.precio));
      el.setAttribute("data-imagen", imagen);
      el.setAttribute("aria-label", `Agregar ${p.nombre} al carrito`);
      if (p.stock !== undefined) el.setAttribute("max", String(p.stock));
      break;
    case "descripcion":
      el.setInnerContent(p.descripcion ?? "", { html: false });
      break;
    case "tipo-fisico":
      if (p.tipo === "fisico") el.removeAttribute("hidden");
      else el.setAttribute("hidden", "");
      break;
    case "tipo-digital":
      if (p.tipo === "digital") el.removeAttribute("hidden");
      else el.setAttribute("hidden", "");
      break;
  }
}

/** Agrega al reescritor el llenado de listas (estado secuencial, en orden del documento). */
function conListas(r: Reescritor, catalogo: Catalogo, op: OpcionesBorde, filtroExtra?: (f: string) => string): Reescritor {
  let lista: ProductoCatalogo[] = [];
  let indice = -1;
  let actual: ProductoCatalogo | null = null;
  return r
    .on("[data-cat-lista]", {
      element(el) {
        const filtro = el.getAttribute("data-cat-lista") ?? "";
        lista = productosDeLista(catalogo, filtroExtra ? filtroExtra(filtro) : filtro);
        indice = -1;
        actual = null;
        if (lista.length === 0) el.setAttribute("data-vacia", "");
        else el.removeAttribute("data-vacia");
      },
    })
    .on("[data-cat-slot]", {
      element(el) {
        indice++;
        actual = lista[indice] ?? null;
        if (!actual) {
          el.remove();
          return;
        }
        el.removeAttribute("hidden");
        el.setAttribute("data-producto", actual.id);
        el.setAttribute("data-nombre", actual.nombre.toLowerCase());
      },
    })
    .on("[data-cat-slot] [data-cat]", {
      element(el) {
        if (!actual) return;
        for (const campo of (el.getAttribute("data-cat") ?? "").split(/\s+/)) llenarCampo(el, campo, actual, op);
      },
    });
}

function esHtml(r: Response) {
  return (r.headers.get("content-type") || "").includes("text/html");
}

// ───────────────────────────── categorías ─────────────────────────────

/** Rellena "{nombre} hechos a mano" con los datos de la categoría. */
export function rellenarPlantilla(plantilla: string, c: { nombre: string; corto?: string }): string {
  return plantilla.split("{nombre}").join(c.nombre).split("{corto}").join(c.corto || c.nombre);
}

/** Categorías creadas en el panel (no son del sitio), en orden. */
function nuevasDe(catalogo: Catalogo): CategoriaCatalogo[] {
  return catalogo.categorias.filter((c) => c.nueva === true);
}

/** `/tienda/lanas/` → "lanas" (o null). */
export function categoriaDeRuta(ruta: string): string | null {
  const m = ruta.match(/^\/tienda\/([^/]+)\/?$/);
  return m && ID_VALIDO.test(m[1]) ? m[1] : null;
}

function conListasCategorias(r: Reescritor, catalogo: Catalogo, rutaActual: string): Reescritor {
  const vigentes = new Set(catalogo.categorias.map((c) => c.id));
  const nuevas = nuevasDe(catalogo);
  const actualId = categoriaDeRuta(rutaActual);
  let indice = -1;
  let actual: CategoriaCatalogo | null = null;
  return r
    .on("[data-cats-lista]", {
      element() {
        indice = -1;
        actual = null;
      },
    })
    .on("[data-cats-item]", {
      element(el) {
        if (!vigentes.has(el.getAttribute("data-cats-item") ?? "")) el.remove();
      },
    })
    .on("[data-cats-slot]", {
      element(el) {
        indice++;
        actual = nuevas[indice] ?? null;
        if (!actual) {
          el.remove();
          return;
        }
        el.removeAttribute("hidden");
        el.setAttribute("data-cats-slot", actual.id);
      },
    })
    .on("[data-cats-slot] [data-cats]", {
      element(el) {
        const c = actual;
        if (!c) return;
        for (const campo of (el.getAttribute("data-cats") ?? "").split(/\s+/)) {
          switch (campo) {
            case "enlace":
              el.setAttribute("href", `/tienda/${c.id}/`);
              if (c.id === actualId) el.setAttribute("aria-current", "page");
              break;
            case "nombre":
              el.setInnerContent(c.nombre, { html: false });
              break;
            case "corto":
              el.setInnerContent(c.corto || c.nombre, { html: false });
              break;
            case "bajada":
              el.setInnerContent(typeof c.bajada === "string" ? c.bajada : "", { html: false });
              break;
            case "imagen":
              if (typeof c.imagen === "string" && imagenSegura(c.imagen, "") === c.imagen) el.setAttribute("src", c.imagen);
              break;
            case "alt":
              el.setAttribute("alt", c.nombre);
              break;
          }
        }
      },
    });
}

function conCategorias(r: Reescritor, catalogo: Catalogo): Reescritor {
  return r.on("[data-categoria]", {
    element(el) {
      const c = catalogo.categoria(el.getAttribute("data-categoria") ?? "");
      if (!c) return;
      const plantilla = el.getAttribute("data-categoria-plantilla") ?? "{nombre}";
      for (const campo of (el.getAttribute("data-categoria-campo") ?? "nombre").split(/\s+/)) {
        switch (campo) {
          case "nombre":
            el.setInnerContent(c.nombre, { html: false });
            break;
          case "corto":
            el.setInnerContent(c.corto || c.nombre, { html: false });
            break;
          case "bajada":
            // Vacía = el elemento queda vacío (el sitio lo esconde con :empty).
            el.setInnerContent(typeof c.bajada === "string" ? c.bajada : "", { html: false });
            break;
          case "imagen":
            if (typeof c.imagen === "string" && imagenSegura(c.imagen, "") === c.imagen) el.setAttribute("src", c.imagen);
            break;
          case "alt":
            el.setAttribute("alt", c.nombre);
            break;
          case "texto":
            el.setInnerContent(rellenarPlantilla(plantilla, c), { html: false });
            break;
          case "content":
            el.setAttribute("content", rellenarPlantilla(plantilla, c));
            break;
        }
      }
    },
  });
}

// ───────────────────────────── middleware de listas ─────────────────────────────

export function crearBordeCatalogo(fuente: CatalogoODinamico, opciones: OpcionesBorde) {
  return {
    onRequest: async ({ request, env, next }: { request: Request; env: EnvBorde; next: () => Promise<Response> }) => {
      const ruta = new URL(request.url).pathname;
      if (ruta.startsWith("/api/") || ruta.startsWith("/admin") || ruta.startsWith("/media/")) return next();
      const respuesta = await next();
      if (!esHtml(respuesta) || !esDinamico(fuente)) return respuesta;
      let catalogo: Catalogo;
      let productos: boolean;
      let categorias: boolean;
      try {
        productos = await fuente.editado(env);
        categorias = await fuente.categoriasEditadas(env);
        if (!productos && !categorias) return respuesta; // lo estático ya es correcto
        catalogo = await fuente.obtener(env);
      } catch {
        return respuesta; // si KV falla, se sirve lo estático: nunca un error al visitante
      }
      let r = new HTMLRewriter();
      if (productos) r = conListas(r, catalogo, opciones);
      if (categorias) r = conListasCategorias(conCategorias(r, catalogo), catalogo, ruta);
      return r.transform(respuesta);
    },
  };
}

// ───────────────────────────── ficha de producto ─────────────────────────────

/** `/producto/gatito/` → "gatito" (o null si la dirección no es válida). */
export function idDeRuta(ruta: string): string | null {
  const m = ruta.match(/^\/producto\/([^/]+)\/?$/);
  return m && ID_VALIDO.test(m[1]) ? m[1] : null;
}

export function crearFichaProducto(fuente: CatalogoODinamico, opciones: OpcionesBorde) {
  const plantilla = opciones.plantillaFicha ?? "/producto/plantilla/";

  async function noEncontrado(request: Request, env: EnvBorde): Promise<Response> {
    const pagina = env.ASSETS ? await env.ASSETS.fetch(new URL(opciones.pagina404 ?? "/404.html", request.url).toString()) : null;
    return new Response(pagina?.ok ? pagina.body : "No encontrado", {
      status: 404,
      headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
    });
  }

  return {
    onRequestGet: async ({ request, env }: { request: Request; env: EnvBorde }) => {
      const url = new URL(request.url);
      const id = idDeRuta(url.pathname);
      if (id && !url.pathname.endsWith("/")) {
        return Response.redirect(`${url.origin}/producto/${id}/${url.search}`, 301);
      }
      const catalogo = await resolverCatalogo(fuente, env);
      const p = id ? catalogo.buscar(id) : undefined;
      if (!p || !env.ASSETS) return noEncontrado(request, env);

      const base = await env.ASSETS.fetch(new URL(plantilla, request.url).toString());
      if (!base.ok) return noEncontrado(request, env);
      const respuesta = new Response(base.body, base);
      respuesta.headers.set("Cache-Control", "public, max-age=0, must-revalidate");

      const cat = catalogo.categoria(p.categoria);
      const canonica = new URL(`/producto/${p.id}/`, opciones.sitio.dominio).href;
      let ajustes: AjustesFicha = AJUSTES_FICHA_POR_DEFECTO;
      try {
        ajustes = await obtenerAjustesFicha(env);
      } catch {
        /* si KV falla, rigen los de fábrica */
      }
      const colores = tieneColores(p) ? p.colores! : [];
      const primero = colores[0];
      const titulo = p.tituloColores ?? "Color";
      const imagen = imagenSegura(primero?.foto ?? p.imagen, opciones.imagenPorDefecto);
      const imagenAbs = new URL(imagen, opciones.sitio.dominio).href;
      const galeria = fotosSeguras(p);
      const descripcion = (p.descripcion || p.nombre).slice(0, 300);
      const jsonLd = {
        "@context": "https://schema.org",
        "@type": "Product",
        name: p.nombre,
        description: descripcion,
        image: galeria.length > 1 ? galeria.map((f) => new URL(f, opciones.sitio.dominio).href) : imagenAbs,
        sku: p.id,
        brand: { "@type": "Brand", name: opciones.sitio.nombre },
        offers: {
          "@type": "Offer",
          price: p.precio,
          priceCurrency: "CLP",
          availability: p.stock === 0 ? "https://schema.org/OutOfStock" : "https://schema.org/InStock",
          url: canonica,
        },
      };

      const parteApagada = (parte: string | null) =>
        (parte === "categoria" && !ajustes.categoria) ||
        (parte === "disponible" && !ajustes.disponible) ||
        (parte === "lupa" && !ajustes.lupa) ||
        (parte === "confianza" && !ajustes.confianza) ||
        (parte === "cuenta" && (!ajustes.cuentaColores || colores.length < 2));

      let r = new HTMLRewriter()
        .on("title", { element: (el) => el.setInnerContent(`${p.nombre} | ${opciones.sitio.nombre}`, { html: false }) })
        .on('meta[name="description"]', { element: (el) => el.setAttribute("content", descripcion) })
        .on('meta[property="og:title"]', { element: (el) => el.setAttribute("content", `${p.nombre} | ${opciones.sitio.nombre}`) })
        .on('meta[property="og:description"]', { element: (el) => el.setAttribute("content", descripcion) })
        .on('meta[property="og:url"]', { element: (el) => el.setAttribute("content", canonica) })
        .on('meta[property="og:image"]', { element: (el) => el.setAttribute("content", imagenAbs) })
        .on('link[rel="canonical"]', { element: (el) => el.setAttribute("href", canonica) })
        // La plantilla no se indexa por sí misma; la ficha sí.
        .on('meta[name="robots"][data-plantilla]', { element: (el) => el.remove() })
        // Partes opcionales apagadas en el panel: fuera del HTML.
        .on("[data-ficha-opcional]", {
          element(el) {
            if (parteApagada(el.getAttribute("data-ficha-opcional"))) el.remove();
          },
        })
        .on("script[data-ficha-jsonld]", {
          element: (el) => el.setInnerContent(JSON.stringify(jsonLd).replace(/</g, "\\u003c"), { html: true }),
        })
        .on("[data-ficha]", {
          element(el) {
            // Ya quitada por apagada: escribirle contenido la haría reaparecer como texto suelto.
            if (parteApagada(el.getAttribute("data-ficha-opcional"))) return;
            for (const campo of (el.getAttribute("data-ficha") ?? "").split(/\s+/)) {
              if (campo === "producto") {
                el.setAttribute("data-producto", p.id);
                el.setAttribute("data-nombre", p.nombre.toLowerCase());
              } else if (campo === "categoria-enlace") {
                el.setAttribute("href", `/tienda/${p.categoria}/`);
              } else if (campo === "categoria-nombre") {
                el.setInnerContent(cat?.nombre ?? "", { html: false });
              } else if (campo === "galeria") {
                const video = p.video && ID_VIDEO.test(p.video) ? p.video : undefined;
                // Con video y sin fotos, la primera miniatura es la foto por defecto.
                const fotos = video && !galeria.length ? [imagen] : galeria;
                if (fotos.length + (video ? 1 : 0) < 2) el.setAttribute("hidden", "");
                else {
                  el.removeAttribute("hidden");
                  el.setInnerContent(htmlGaleria(fotos, video), { html: true });
                }
              } else if (campo === "colores-bloque") {
                if (!colores.length) el.setAttribute("hidden", "");
                else {
                  el.removeAttribute("hidden");
                  el.setAttribute("data-miniatura", ajustes.miniatura);
                  const e = p.enfoqueColores ?? { x: 50, y: 50 };
                  el.setAttribute("style", `--enfoque-x:${Math.round(e.x)}%;--enfoque-y:${Math.round(e.y)}%`);
                }
              } else if (campo === "colores") {
                el.setInnerContent(htmlColores(p, opciones.imagenPorDefecto), { html: true });
                el.setAttribute("data-colores-total", String(colores.length));
                el.setAttribute("data-plural", plural(titulo, 2).slice(2));
              } else if (campo === "colores-titulo") {
                el.setInnerContent(`Elige tu ${titulo.toLowerCase()}`, { html: false });
              } else if (campo === "colores-etiqueta") {
                el.setInnerContent(`${titulo}:`, { html: false });
              } else if (campo === "colores-elegido") {
                el.setInnerContent(primero?.nombre ?? "", { html: false });
              } else if (campo === "colores-cuenta") {
                el.setInnerContent(plural(titulo, colores.length), { html: false });
                el.removeAttribute("hidden");
              } else if (campo === "imagen-alt" && primero) {
                el.setAttribute("src", imagen);
                el.setAttribute("alt", `${p.nombre} · ${primero.nombre}`);
              } else if (campo === "agregar" && primero) {
                const mini = imagenSegura(primero.mini ?? primero.foto ?? p.imagen, opciones.imagenPorDefecto);
                el.setAttribute("data-id", idConColor(p.id, primero.id));
                el.setAttribute("data-nombre", `${p.nombre} · ${primero.nombre}`);
                el.setAttribute("data-precio", String(p.precio));
                el.setAttribute("data-imagen", mini);
                el.setAttribute("data-producto-base", p.id);
                el.removeAttribute("data-elegir");
              } else if (campo === "cantidad") {
                el.setAttribute("max", p.stock === undefined ? "99" : String(Math.max(1, p.stock)));
              } else {
                llenarCampo(el, campo, p, opciones);
              }
            }
          },
        });
      // Relacionados: misma categoría, sin el propio producto. El filtro queda
      // escrito en la página: el borde de listas (middleware) vuelve a pasar
      // por esta respuesta y, con "relacionados" a secas, la vaciaba.
      const filtroRelacionados = `relacionados:${p.categoria}:${p.id}`;
      r = r.on('[data-cat-lista="relacionados"]', { element: (el) => el.setAttribute("data-cat-lista", filtroRelacionados) });
      r = conListas(r, catalogo, opciones, (f) => (f === "relacionados" ? filtroRelacionados : f));
      return r.transform(respuesta);
    },
  };
}

// ───────────────────────────── página de categoría ─────────────────────────────

/**
 * /tienda/<id>/ para TODAS las categorías:
 *  - del sitio (no borrada): su página estática, tal cual;
 *  - creada en el panel: la plantilla estática con sus datos;
 *  - borrada o inexistente: 404.
 *
 * La plantilla se construye como una categoría más con el id
 * `idPlantillaCategoria` ("plantilla") y `<meta name="robots" data-plantilla>`.
 */
export function crearPaginaCategoria(fuente: CatalogoODinamico, opciones: OpcionesBorde) {
  const plantilla = opciones.plantillaCategoria ?? "/tienda/plantilla/";
  const idPlantilla = opciones.idPlantillaCategoria ?? "plantilla";

  async function noEncontrado(request: Request, env: EnvBorde): Promise<Response> {
    const pagina = env.ASSETS ? await env.ASSETS.fetch(new URL(opciones.pagina404 ?? "/404.html", request.url).toString()) : null;
    return new Response(pagina?.ok ? pagina.body : "No encontrado", {
      status: 404,
      headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
    });
  }

  return {
    onRequestGet: async ({ request, env }: { request: Request; env: EnvBorde }) => {
      const url = new URL(request.url);
      const id = categoriaDeRuta(url.pathname);
      if (id && !url.pathname.endsWith("/")) {
        return Response.redirect(`${url.origin}/tienda/${id}/${url.search}`, 301);
      }
      if (!id || !env.ASSETS) return noEncontrado(request, env);
      const catalogo = await resolverCatalogo(fuente, env);
      const c = catalogo.categoria(id);
      if (!c) return noEncontrado(request, env);
      if (c.nueva !== true) return env.ASSETS.fetch(request);

      const base = await env.ASSETS.fetch(new URL(plantilla, request.url).toString());
      if (!base.ok) return noEncontrado(request, env);
      const respuesta = new Response(base.body, base);
      respuesta.headers.set("Cache-Control", "public, max-age=0, must-revalidate");
      const canonica = new URL(`/tienda/${c.id}/`, opciones.sitio.dominio).href;
      const titulo = `${c.nombre} | ${opciones.sitio.nombre}`;
      let r = new HTMLRewriter()
        .on("title", { element: (el) => el.setInnerContent(titulo, { html: false }) })
        .on('meta[property="og:title"]', { element: (el) => el.setAttribute("content", titulo) })
        .on('meta[property="og:url"]', { element: (el) => el.setAttribute("content", canonica) })
        .on('link[rel="canonical"]', { element: (el) => el.setAttribute("href", canonica) })
        .on('meta[name="robots"][data-plantilla]', { element: (el) => el.remove() })
        // Los textos con el nombre los llena el borde de categorías (data-categoria + campo).
        .on(`[data-categoria="${idPlantilla}"]`, { element: (el) => el.setAttribute("data-categoria", c.id) })
        .on("[data-cat-lista]", {
          element(el) {
            const f = el.getAttribute("data-cat-lista") ?? "";
            if (f === `categoria:${idPlantilla}`) el.setAttribute("data-cat-lista", `categoria:${c.id}`);
          },
        });
      r = conListas(r, catalogo, opciones, (f) => (f === `categoria:${idPlantilla}` ? `categoria:${c.id}` : f));
      r = conListasCategorias(conCategorias(r, catalogo), catalogo, url.pathname);
      return r.transform(respuesta);
    },
  };
}
