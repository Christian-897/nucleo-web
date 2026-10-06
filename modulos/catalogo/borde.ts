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
 *  - CATEGORÍAS: si se cambió el nombre o la foto de una categoría en el
 *    panel, todo elemento `data-categoria="<id>"` se pone al día según
 *    `data-categoria-campo` (uno o varios, separados por espacio):
 *      nombre · corto · imagen (src) · alt · texto · content
 *    "texto" y "content" (atributo de <meta>) usan la plantilla de
 *    `data-categoria-plantilla`, con {nombre} y {corto}.
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
import type { Catalogo, ProductoCatalogo } from "./tipos";

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

// ───────────────────────────── relleno de campos ─────────────────────────────

function llenarCampo(el: ElementoHtml, campo: string, p: ProductoCatalogo, op: OpcionesBorde) {
  const url = `/producto/${p.id}/`;
  const imagen = imagenSegura(p.imagen, op.imagenPorDefecto);
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
      if (categorias) r = conCategorias(r, catalogo);
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
      const imagen = imagenSegura(p.imagen, opciones.imagenPorDefecto);
      const imagenAbs = new URL(imagen, opciones.sitio.dominio).href;
      const descripcion = (p.descripcion || p.nombre).slice(0, 300);
      const jsonLd = {
        "@context": "https://schema.org",
        "@type": "Product",
        name: p.nombre,
        description: descripcion,
        image: imagenAbs,
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
        .on("script[data-ficha-jsonld]", {
          element: (el) => el.setInnerContent(JSON.stringify(jsonLd).replace(/</g, "\\u003c"), { html: true }),
        })
        .on("[data-ficha]", {
          element(el) {
            for (const campo of (el.getAttribute("data-ficha") ?? "").split(/\s+/)) {
              if (campo === "producto") {
                el.setAttribute("data-producto", p.id);
                el.setAttribute("data-nombre", p.nombre.toLowerCase());
              } else if (campo === "categoria-enlace") {
                el.setAttribute("href", `/tienda/${p.categoria}/`);
              } else if (campo === "categoria-nombre") {
                el.setInnerContent(cat?.nombre ?? "", { html: false });
              } else if (campo === "cantidad") {
                el.setAttribute("max", p.stock === undefined ? "99" : String(Math.max(1, p.stock)));
              } else {
                llenarCampo(el, campo, p, opciones);
              }
            }
          },
        });
      // Relacionados: misma categoría, sin el propio producto.
      r = conListas(r, catalogo, opciones, (f) => (f === "relacionados" ? `relacionados:${p.categoria}:${p.id}` : f));
      return r.transform(respuesta);
    },
  };
}
