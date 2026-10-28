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
 *      nombre · corto · bajada · imagen (src) · alt · texto · content ·
 *      descripcion · descripcion-meta
 *    "texto" y "content" (atributo de <meta>) usan la plantilla de
 *    `data-categoria-plantilla`, con {nombre} y {corto}.
 *    "descripcion" (v0.44) pone el texto de la categoría (vacío = elemento
 *    vacío; el sitio lo esconde con :empty). "descripcion-meta" pone en
 *    `content` el resumen para Google de ese texto, o la plantilla si no hay.
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
import { type ColorProducto, idCompuesto, idConColor, imagenPrincipal, tieneColores } from "./colores";
import { colorEnOpcion, precioDeOpcion, rangoDePrecios, tieneOpciones } from "./opciones";
import { type VistaLista, type VistaListas, obtenerVistaListas, vistaDeFiltro, VISTA_LISTAS_POR_DEFECTO } from "./vista-listas";
import { AJUSTES_FICHA_POR_DEFECTO, type AjustesFicha, obtenerAjustesFicha } from "./ficha";
import { resumenParaGoogle, textoPlano } from "./resumen";

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
  /**
   * Cómo se ven en las listas los productos con colores, mientras no se
   * cambie en el panel (v0.37). Por defecto, una tarjeta por producto.
   */
  vistaListas?: Partial<VistaListas>;
  /** Cuántos colores se muestran bajo la foto de una tarjeta (el resto va como "+N"). Por defecto 6. */
  coloresEnTarjeta?: number;
}

/** Un elemento de lista: un producto, o un color de un producto (vista "una tarjeta por color"). */
export interface ItemLista {
  p: ProductoCatalogo;
  color?: ColorProducto;
}

/**
 * Elementos de una lista según su filtro y la vista: con "color", cada
 * producto con colores se abre en un elemento por color (en su orden).
 */
export function itemsDeLista(catalogo: Catalogo, filtro: string, vista: VistaLista): ItemLista[] {
  const productos = productosDeLista(catalogo, filtro);
  if (vista !== "color") return productos.map((p) => ({ p }));
  return productos.flatMap((p) => (tieneColores(p) ? (p.colores ?? []).map((color) => ({ p, color })) : [{ p }]));
}

/** Texto seguro dentro de un atributo o de HTML (nombres de colores). */
function escaparTexto(t: string): string {
  return t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/**
 * Muestras de colores bajo la foto de una tarjeta (vista "producto"). Cada
 * una lleva la foto grande de su color (la tarjeta la muestra al pasar el
 * mouse o tocarla) y su id, para abrir la ficha con ese color.
 */
export function htmlMuestras(p: ProductoCatalogo, imagenPorDefecto: string, maximo = 6): string {
  const colores = p.colores ?? [];
  const tope = Math.max(1, Math.min(maximo, colores.length));
  const visibles = colores.slice(0, colores.length > tope ? tope : colores.length);
  const muestras = visibles
    .map((c) => {
      const foto = imagenSegura(c.foto ?? c.mini, imagenPorDefecto);
      const mini = imagenSegura(c.mini ?? c.foto, imagenPorDefecto);
      const nombre = escaparTexto(c.nombre);
      return `<button type="button" class="muestra" data-muestra data-muestra-color="${c.id}" data-muestra-foto="${foto}" aria-label="${nombre}" title="${nombre}"><img src="${mini}" alt="" width="40" height="40" loading="lazy" decoding="async"></button>`;
    })
    .join("");
  const resto = colores.length - visibles.length;
  return muestras + (resto > 0 ? `<span class="muestras__mas">+${resto}</span>` : "");
}

/**
 * Botones de las opciones de la ficha (v0.40), p. ej. Mini · Mediano · XL.
 * Cada uno lleva su precio y los colores en que viene (vacío = todos). El
 * primero queda elegido; el navegador marca las combinaciones agotadas.
 */
export function htmlOpciones(p: ProductoCatalogo): string {
  const { min, max } = rangoDePrecios(p);
  return (p.opciones ?? [])
    .map((o, i) => {
      const nombre = escaparTexto(o.nombre);
      const precio = precioDeOpcion(p, o);
      const colores = (o.colores ?? []).filter((c) => /^[a-z0-9-]+$/.test(c)).join(",");
      const extra = min < max ? `<span class="opciones__precio">${escaparTexto(formatearPrecio(precio))}</span>` : "";
      return `<li><button type="button" class="opciones__boton" data-opcion="${o.id}" data-opcion-nombre="${nombre}" data-opcion-precio="${precio}" data-opcion-colores="${colores}" aria-pressed="${i === 0}"><span class="opciones__nombre">${nombre}</span>${extra}</button></li>`;
    })
    .join("");
}

function pluralColores(p: ProductoCatalogo, n: number): string {
  const t = (p.tituloColores ?? "Color").toLowerCase();
  return n === 1 ? `1 ${t}` : `${n} ${t === "color" ? "colores" : `${t}s`}`;
}

// ───────────────────────────── filtros de listas (puros, probados) ─────────────────────────────

/**
 * Productos de una lista según su filtro:
 *   "todos" · "destacados" · "categoria:<id>" · "categoria:<id>:<sub>" · "relacionados:<categoria>:<excluirId>"
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
      // "categoria:<id>:<sub>" = solo esa subcategoría (v0.39).
      return b ? catalogo.deCategoria(a).filter((p) => p.subcategoria === b) : catalogo.deCategoria(a);
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

function llenarCampo(el: ElementoHtml, campo: string, p: ProductoCatalogo, op: OpcionesBorde, color?: ColorProducto) {
  if (color) return llenarCampoColor(el, campo, p, color, op);
  const url = `/producto/${p.id}/`;
  const imagen = imagenSegura(imagenPrincipal(p), op.imagenPorDefecto);
  switch (campo) {
    case "colores":
      // Muestras de colores bajo la foto (solo productos con colores).
      if (!tieneColores(p)) {
        el.setInnerContent("", { html: false });
        el.setAttribute("hidden", "");
      } else {
        el.setInnerContent(htmlMuestras(p, op.imagenPorDefecto, op.coloresEnTarjeta ?? 6), { html: true });
        el.removeAttribute("hidden");
        const e = p.enfoqueColores ?? { x: 50, y: 50 };
        el.setAttribute("style", `--enfoque-x:${Math.round(e.x)}%;--enfoque-y:${Math.round(e.y)}%`);
      }
      break;
    case "colores-cuenta":
      if (!tieneColores(p)) el.setAttribute("hidden", "");
      else {
        el.setInnerContent(pluralColores(p, p.colores!.length), { html: false });
        el.removeAttribute("hidden");
      }
      break;
    case "enlace":
      el.setAttribute("href", url);
      break;
    case "nombre":
      el.setInnerContent(p.nombre, { html: false });
      break;
    case "precio": {
      // Con opciones de distinto precio: «Desde $X» (v0.40).
      const { min, max } = rangoDePrecios(p);
      el.setInnerContent(min < max ? `Desde ${formatearPrecio(min)}` : formatearPrecio(min), { html: false });
      break;
    }
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
      if (tieneColores(p) || tieneOpciones(p)) {
        // Con colores u opciones no se agrega desde la lista: el botón lleva a la ficha para elegir.
        el.setAttribute("data-elegir", url);
        el.setAttribute("data-id", p.id);
        const que = tieneOpciones(p) ? (p.tituloOpciones ?? "Tamaño") : (p.tituloColores ?? "Color");
        el.setAttribute("aria-label", `Elegir ${que.toLowerCase()} de ${p.nombre}`);
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

/** Tarjeta de UN color (vista "una tarjeta por color"): se agrega directo y abre la ficha con ese color. */
function llenarCampoColor(el: ElementoHtml, campo: string, p: ProductoCatalogo, c: ColorProducto, op: OpcionesBorde) {
  const url = `/producto/${p.id}/?color=${c.id}`;
  const foto = imagenSegura(c.foto ?? c.mini ?? p.imagen, op.imagenPorDefecto);
  const mini = imagenSegura(c.mini ?? c.foto ?? p.imagen, op.imagenPorDefecto);
  const nombre = `${p.nombre} · ${c.nombre}`;
  switch (campo) {
    case "enlace":
      el.setAttribute("href", url);
      break;
    case "nombre":
      el.setInnerContent(nombre, { html: false });
      break;
    case "imagen":
      el.setAttribute("src", foto);
      break;
    case "imagen-alt":
      el.setAttribute("src", foto);
      el.setAttribute("alt", nombre);
      break;
    case "colores":
    case "colores-cuenta":
      el.setInnerContent("", { html: false });
      el.setAttribute("hidden", "");
      break;
    case "precio":
      llenarCampo(el, campo, p, op);
      break;
    case "agregar":
      if (tieneOpciones(p)) {
        // Falta elegir la opción (p. ej. el tamaño): lleva a la ficha con el color ya elegido.
        el.setAttribute("data-elegir", url);
        el.setAttribute("data-id", idConColor(p.id, c.id));
        el.setAttribute("aria-label", `Elegir ${(p.tituloOpciones ?? "Tamaño").toLowerCase()} de ${nombre}`);
        break;
      }
      el.removeAttribute("data-elegir");
      el.setAttribute("data-id", idConColor(p.id, c.id));
      el.setAttribute("data-nombre", nombre);
      el.setAttribute("data-precio", String(p.precio));
      el.setAttribute("data-imagen", mini);
      el.setAttribute("aria-label", `Agregar ${nombre} al carrito`);
      if (c.stock !== undefined) el.setAttribute("max", String(c.stock));
      else el.removeAttribute("max");
      break;
    default:
      llenarCampo(el, campo, p, op);
  }
}

/** Agrega al reescritor el llenado de listas (estado secuencial, en orden del documento). */
function conListas(
  r: Reescritor,
  catalogo: Catalogo,
  op: OpcionesBorde,
  vista: VistaListas = VISTA_LISTAS_POR_DEFECTO,
  filtroExtra?: (f: string) => string
): Reescritor {
  let lista: ItemLista[] = [];
  let indice = -1;
  let actual: ItemLista | null = null;
  return r
    .on("[data-cat-lista]", {
      element(el) {
        const filtroBase = el.getAttribute("data-cat-lista") ?? "";
        const filtro = filtroExtra ? filtroExtra(filtroBase) : filtroBase;
        const modo = vistaDeFiltro(vista, filtro);
        lista = itemsDeLista(catalogo, filtro, modo);
        indice = -1;
        actual = null;
        el.setAttribute("data-vista", modo);
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
        const { p, color } = actual;
        el.removeAttribute("hidden");
        el.setAttribute("data-producto", color ? idConColor(p.id, color.id) : p.id);
        el.setAttribute("data-nombre", (color ? `${p.nombre} ${color.nombre}` : p.nombre).toLowerCase());
      },
    })
    .on("[data-cat-slot] [data-cat]", {
      element(el) {
        if (!actual) return;
        for (const campo of (el.getAttribute("data-cat") ?? "").split(/\s+/)) llenarCampo(el, campo, actual.p, op, actual.color);
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

/** `/tienda/toallas/microfibra/` → { categoria: "toallas", sub: "microfibra" } (o null). */
export function subcategoriaDeRuta(ruta: string): { categoria: string; sub: string } | null {
  const m = ruta.match(/^\/tienda\/([^/]+)\/([^/]+)\/?$/);
  return m && ID_VALIDO.test(m[1]) && ID_VALIDO.test(m[2]) ? { categoria: m[1], sub: m[2] } : null;
}

/**
 * Botones de subcategoría de una categoría (v0.39): «Todos» y uno por
 * subcategoría, como enlaces a /tienda/<cat>/ y /tienda/<cat>/<sub>/. El
 * elegido lleva aria-current="page". Sin subcategorías, vacío. Nombres
 * escapados; ids ya validados (letras, números y guiones).
 */
export function htmlSubcategorias(
  c: Pick<CategoriaCatalogo, "id" | "subcategorias">,
  actual?: string,
  clase = "chip",
  textoTodos = "Todos"
): string {
  const subs = (c.subcategorias ?? []).filter((x) => ID_VALIDO.test(x.id) && typeof x.nombre === "string");
  if (!subs.length || !ID_VALIDO.test(c.id)) return "";
  const k = escaparTexto(clase);
  const li = (href: string, texto: string, elegido: boolean) =>
    `<li><a class="${k}" href="${href}"${elegido ? ' aria-current="page"' : ""}>${escaparTexto(texto)}</a></li>`;
  return (
    li(`/tienda/${c.id}/`, textoTodos, !actual) + subs.map((x) => li(`/tienda/${c.id}/${x.id}/`, x.nombre, x.id === actual)).join("")
  );
}

/**
 * Llena los `[data-subcats="<categoria>"]` con sus botones; la subcategoría
 * elegida sale de la dirección. Lista vacía = se oculta (`hidden`).
 */
function conSubcategorias(r: Reescritor, catalogo: Catalogo, rutaActual: string, idPlantilla?: string, idReal?: string): Reescritor {
  const sub = subcategoriaDeRuta(rutaActual);
  return r
    .on("[data-subcats]", {
      element(el) {
        let id = el.getAttribute("data-subcats") ?? "";
        if (idPlantilla && idReal && id === idPlantilla) {
          id = idReal;
          el.setAttribute("data-subcats", id);
        }
        const c = catalogo.categoria(id);
        const html = c ? htmlSubcategorias(c, sub && sub.categoria === id ? sub.sub : undefined, el.getAttribute("data-subcats-clase") || "chip") : "";
        el.setInnerContent(html, { html: true });
        if (html) el.removeAttribute("hidden");
        else el.setAttribute("hidden", "");
      },
    });
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
          case "descripcion":
            el.setInnerContent(typeof c.descripcion === "string" ? c.descripcion : "", { html: false });
            break;
          case "descripcion-meta": {
            const resumen = resumenParaGoogle(typeof c.descripcion === "string" ? c.descripcion : "");
            el.setAttribute("content", resumen || rellenarPlantilla(plantilla, c));
            break;
          }
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
      let conColores = false;
      let vista: VistaListas = VISTA_LISTAS_POR_DEFECTO;
      try {
        productos = await fuente.editado(env);
        categorias = await fuente.categoriasEditadas(env);
        // Con colores, las listas dependen de la vista elegida en el panel: siempre pasan por el borde.
        conColores = fuente.inicial.productos.some(tieneColores);
        if (!productos && !categorias && !conColores) return respuesta; // lo estático ya es correcto
        catalogo = await fuente.obtener(env);
        vista = await obtenerVistaListas(env, opciones.vistaListas);
      } catch {
        return respuesta; // si KV falla, se sirve lo estático: nunca un error al visitante
      }
      let r = new HTMLRewriter();
      if (productos || conColores || catalogo.productos.some(tieneColores)) r = conListas(r, catalogo, opciones, vista);
      if (categorias) r = conSubcategorias(conListasCategorias(conCategorias(r, catalogo), catalogo, ruta), catalogo, ruta);
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
      const opcionesP = tieneOpciones(p) ? p.opciones! : [];
      const opcion0 = opcionesP[0];
      const colores = tieneColores(p) ? p.colores! : [];
      // Con opciones, el color elegido al abrir es el primero que viene en la primera opción.
      const primero = opcion0 ? colores.find((c) => colorEnOpcion(opcion0, c.id)) : colores[0];
      const titulo = p.tituloColores ?? "Color";
      const tituloOp = p.tituloOpciones ?? "Tamaño";
      const precioInicial = precioDeOpcion(p, opcion0);
      const rango = rangoDePrecios(p);
      const imagen = imagenSegura(primero?.foto ?? p.imagen, opciones.imagenPorDefecto);
      const imagenAbs = new URL(imagen, opciones.sitio.dominio).href;
      const galeria = fotosSeguras(p);
      // Google muestra unos 155 caracteres: sin emojis ni saltos, cortado en una palabra (v0.44).
      const descripcion = resumenParaGoogle(p.descripcion) || p.nombre;
      const descripcionLarga = textoPlano(p.descripcion || p.nombre).slice(0, 500);
      const jsonLd = {
        "@context": "https://schema.org",
        "@type": "Product",
        name: p.nombre,
        description: descripcionLarga,
        image: galeria.length > 1 ? galeria.map((f) => new URL(f, opciones.sitio.dominio).href) : imagenAbs,
        sku: p.id,
        brand: { "@type": "Brand", name: opciones.sitio.nombre },
        offers: {
          ...(rango.min < rango.max ? { "@type": "AggregateOffer", lowPrice: rango.min, highPrice: rango.max } : { "@type": "Offer", price: rango.min }),
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
              } else if (campo === "opciones-bloque") {
                if (!opcionesP.length) el.setAttribute("hidden", "");
                else el.removeAttribute("hidden");
              } else if (campo === "opciones") {
                el.setInnerContent(htmlOpciones(p), { html: true });
              } else if (campo === "opciones-titulo") {
                el.setInnerContent(`Elige tu ${tituloOp.toLowerCase()}`, { html: false });
              } else if (campo === "opciones-etiqueta") {
                el.setInnerContent(`${tituloOp}:`, { html: false });
              } else if (campo === "opciones-elegido") {
                el.setInnerContent(opcion0?.nombre ?? "", { html: false });
              } else if (campo === "precio" && opcion0) {
                el.setInnerContent(formatearPrecio(precioInicial), { html: false });
              } else if (campo === "agregar" && opcion0) {
                const mini = imagenSegura(primero?.mini ?? primero?.foto ?? p.imagen, opciones.imagenPorDefecto);
                el.setAttribute("data-id", idCompuesto(p.id, primero?.id, opcion0.id));
                el.setAttribute("data-nombre", primero ? `${p.nombre} · ${opcion0.nombre} · ${primero.nombre}` : `${p.nombre} · ${opcion0.nombre}`);
                el.setAttribute("data-precio", String(precioInicial));
                el.setAttribute("data-imagen", mini);
                el.setAttribute("data-producto-base", p.id);
                el.removeAttribute("data-elegir");
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
      const vistaRel = await obtenerVistaListas(env, opciones.vistaListas).catch(() => VISTA_LISTAS_POR_DEFECTO);
      r = conListas(r, catalogo, opciones, vistaRel, (f) => (f === "relacionados" ? filtroRelacionados : f));
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
      const ruta = subcategoriaDeRuta(url.pathname);
      const id = ruta?.categoria ?? categoriaDeRuta(url.pathname);
      if (id && !url.pathname.endsWith("/")) {
        return Response.redirect(`${url.origin}${url.pathname}/${url.search}`, 301);
      }
      if (!id || !env.ASSETS) return noEncontrado(request, env);
      const catalogo = await resolverCatalogo(fuente, env);
      const c = catalogo.categoria(id);
      if (!c) return noEncontrado(request, env);
      const sub = ruta ? c.subcategorias?.find((x) => x.id === ruta.sub) : undefined;
      if (ruta && !sub) return noEncontrado(request, env);
      const nueva = c.nueva === true;
      // Categoría del sitio y sin subcategoría: la página estática tal cual.
      if (!nueva && !sub) return env.ASSETS.fetch(request);

      const base = await env.ASSETS.fetch(new URL(nueva ? plantilla : `/tienda/${c.id}/`, request.url).toString());
      if (!base.ok) return noEncontrado(request, env);
      const respuesta = new Response(base.body, base);
      respuesta.headers.set("Cache-Control", "public, max-age=0, must-revalidate");
      const camino = sub ? `/tienda/${c.id}/${sub.id}/` : `/tienda/${c.id}/`;
      const canonica = new URL(camino, opciones.sitio.dominio).href;
      const titulo = sub ? `${sub.nombre} · ${c.nombre} | ${opciones.sitio.nombre}` : `${c.nombre} | ${opciones.sitio.nombre}`;
      // Plantilla de título que usa el borde de categorías (si después vuelve a pasar, respeta la subcategoría).
      const plantillaTitulo = sub ? `${sub.nombre} · {nombre} | ${opciones.sitio.nombre}` : null;
      const filtroReal = sub ? `categoria:${c.id}:${sub.id}` : `categoria:${c.id}`;
      let r = new HTMLRewriter();
      // Primero los nombres de la categoría (data-categoria), después lo propio de esta página.
      if (nueva) r = r.on(`[data-categoria="${idPlantilla}"]`, { element: (el) => el.setAttribute("data-categoria", c.id) });
      r = conCategorias(r, catalogo);
      r = r
        .on("title", {
          element: (el) => {
            el.setInnerContent(titulo, { html: false });
            if (plantillaTitulo && el.getAttribute("data-categoria-plantilla") !== null) el.setAttribute("data-categoria-plantilla", plantillaTitulo);
          },
        })
        .on('meta[property="og:title"]', {
          element: (el) => {
            el.setAttribute("content", titulo);
            if (plantillaTitulo && el.getAttribute("data-categoria-plantilla") !== null) el.setAttribute("data-categoria-plantilla", plantillaTitulo);
          },
        })
        .on('meta[property="og:url"]', { element: (el) => el.setAttribute("content", canonica) })
        .on('link[rel="canonical"]', { element: (el) => el.setAttribute("href", canonica) })
        .on('meta[name="robots"][data-plantilla]', { element: (el) => el.remove() })
        // Miga y nombre de la subcategoría (opcionales en el sitio).
        .on("[data-subcat-miga]", {
          element: (el) => {
            if (sub) el.removeAttribute("hidden");
            else el.setAttribute("hidden", "");
          },
        })
        .on("[data-subcat-nombre]", { element: (el) => el.setInnerContent(sub?.nombre ?? "", { html: false }) })
        .on("[data-subcat-enlace-categoria]", { element: (el) => el.setAttribute("href", `/tienda/${c.id}/`) })
        .on("[data-cat-lista]", {
          element(el) {
            const f = el.getAttribute("data-cat-lista") ?? "";
            if (f === `categoria:${idPlantilla}` || f === `categoria:${c.id}`) el.setAttribute("data-cat-lista", filtroReal);
          },
        });
      const vistaCat = await obtenerVistaListas(env, opciones.vistaListas).catch(() => VISTA_LISTAS_POR_DEFECTO);
      r = conListas(r, catalogo, opciones, vistaCat, (f) => (f === `categoria:${idPlantilla}` || f === `categoria:${c.id}` ? filtroReal : f));
      r = conListasCategorias(r, catalogo, url.pathname);
      r = conSubcategorias(r, catalogo, url.pathname, idPlantilla, c.id);
      return r.transform(respuesta);
    },
  };
}
