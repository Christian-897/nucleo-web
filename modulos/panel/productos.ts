/**
 * PRODUCTOS DESDE EL PANEL: crear, editar, eliminar y manejar sus fotos
 * (hasta MAXIMO_FOTOS; la primera es la principal).
 *
 * Todo lo que llega se valida y se limpia aquí (nunca se confía en la
 * pantalla). El id del producto se crea una vez desde el nombre y no
 * cambia más: es la dirección pública /producto/<id>/.
 *
 * Stock: la pantalla muestra y edita lo DISPONIBLE. Si cambia, ese número
 * pasa a ser el stock y se reinicia el contador de vendidos; si no se
 * toca, las ventas siguen descontando normal.
 */
import { normalizeInput } from "../../core/validar";
import type { FuenteCatalogo } from "../catalogo/almacen";
import { ID_VALIDO, MAXIMO_FOTOS } from "../catalogo/catalogo";
import { productoDisponible, reponerStock, unidadesVendidas } from "../catalogo/stock";
import { type ColorProducto, idColorDesdeNombre, idCompuesto, idConColor, MAXIMO_COLORES, tieneColores } from "../catalogo/colores";
import { colorEnOpcion, idOpcionDesdeNombre, LARGO_TITULO_OPCIONES, MAXIMO_OPCIONES, type OpcionProducto, tieneOpciones } from "../catalogo/opciones";
import { guardarAjustesFicha, obtenerAjustesFicha } from "../catalogo/ficha";
import { guardarVistaListas, obtenerVistaListas } from "../catalogo/vista-listas";
import type { ProductoCatalogo } from "../catalogo/tipos";
import { idVideoYoutube } from "../catalogo/video";
import { MAXIMO_BYTES_FOTO, type ConfigPanel } from "./config";
import { type Ctx, exigirSesion, jsonResponse, leerJson } from "./http";
import { borrarFoto, direccionMediaValida, guardarFoto, medidasAceptables, nuevoIdentificador, tipoRealDeImagen } from "./imagenes";

/** Solo direcciones de fotos del propio sitio (las que trae su JSON), no subidas. */
const FOTO_SITIO = /^\/img\/[a-zA-Z0-9/_.-]{1,150}$/;
const subida = (f?: string) => typeof f === "string" && f.startsWith("/media/");

/**
 * FOTOS DE COLORES DEL SITIO (v0.38). Cuando la tienda ya se editó en el
 * panel, lo guardado manda y las fotos nuevas que trae el sitio (su JSON) no
 * se ven. Esto copia, color por color (mismo id), la foto y la miniatura del
 * sitio al producto guardado. Nunca toca una foto SUBIDA en el panel
 * (/media/), ni unidades, nombres, orden, precio u otros datos. Puro.
 */
export function aplicarFotosDelSitio(
  actual: ProductoCatalogo,
  delSitio: ProductoCatalogo | undefined
): { producto: ProductoCatalogo; cambios: number } {
  if (!actual.colores?.length || !delSitio?.colores?.length) return { producto: actual, cambios: 0 };
  let cambios = 0;
  const colores = actual.colores.map((c) => {
    const s = delSitio.colores!.find((x) => x.id === c.id);
    if (!s) return c;
    const nuevo = { ...c };
    let cambio = false;
    for (const k of ["foto", "mini"] as const) {
      const delSitioK = s[k];
      if (delSitioK && FOTO_SITIO.test(delSitioK) && !delSitioK.includes("..") && nuevo[k] !== delSitioK && !subida(nuevo[k])) {
        nuevo[k] = delSitioK;
        cambio = true;
      }
    }
    if (cambio) cambios++;
    return nuevo;
  });
  return cambios ? { producto: { ...actual, colores }, cambios } : { producto: actual, cambios: 0 };
}

/**
 * PRODUCTOS NUEVOS PREPARADOS EN EL SITIO (v0.42). Cuando la clienta ya
 * editó el catálogo en el panel, manda lo guardado en KV y los productos que
 * se agregan después al JSON del sitio no aparecen solos. El panel los
 * ofrece en un aviso: "Agregar" los suma tal cual vienen del sitio (al final
 * de la lista) y "No agregar" los descarta para que el aviso no vuelva.
 * Nunca toca los productos que ya tiene: solo suma los que faltan.
 */
export const CLAVE_PRODUCTOS_DESCARTADOS = "catalogo:productos-sitio-descartados";

export function productosNuevosDelSitio(
  vigentes: ProductoCatalogo[],
  delSitio: ProductoCatalogo[],
  categorias: string[],
  descartados: string[]
): ProductoCatalogo[] {
  const ya = new Set(vigentes.map((p) => p.id));
  const fuera = new Set(descartados);
  const cats = new Set(categorias);
  return delSitio.filter((p) => !ya.has(p.id) && !fuera.has(p.id) && cats.has(p.categoria));
}

const PRECIO_MAXIMO = 100_000_000;
const STOCK_MAXIMO = 100_000;

/** "Gatito de Peluche (grande)" → "gatito-de-peluche-grande" */
export function idDesdeNombre(nombre: string, usados: Set<string>): string {
  const base =
    nombre
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 50)
      .replace(/-+$/g, "") || "producto";
  let id = base;
  for (let n = 2; usados.has(id); n++) id = `${base}-${n}`;
  return id;
}

/** Imagen aceptable: una foto subida al panel o una del propio sitio. */
function imagenValida(v: unknown): v is string {
  return direccionMediaValida(v) || (typeof v === "string" && /^\/img\/[a-zA-Z0-9/_.-]{1,150}$/.test(v) && !v.includes(".."));
}

/** Todas las fotos de un producto, la principal primero. */
export function fotosDe(p: Pick<ProductoCatalogo, "imagen" | "fotos">): string[] {
  return [...(p.imagen ? [p.imagen] : []), ...(p.fotos ?? [])];
}

/** Fotos de los colores (grandes y miniaturas). */
export function fotosDeColores(p: Pick<ProductoCatalogo, "colores">): string[] {
  return (p.colores ?? []).flatMap((c) => [c.foto, c.mini].filter((f): f is string => typeof f === "string"));
}

/** Prefijo con que se guardan las fotos de colores de un producto (para reconocer las recién subidas). */
export function prefijoFotoColor(id: string): string {
  return nuevoIdentificador(`color-${id}`).replace(/-[0-9a-f]{12}$/, "-");
}

export interface EntradaColor {
  id?: string;
  nombre: string;
  /** null = sin límite. */
  disponible: number | null;
  foto: string;
  mini: string;
}

/**
 * Valida la lista de colores que manda la pantalla. Las fotos solo pueden
 * ser las que el producto YA tenía o recién subidas para ESTE producto
 * (prefijo color-<id>): nadie puede apuntar un color a una foto ajena.
 */
export function validarColores(
  crudo: unknown,
  actual: ProductoCatalogo
): { ok: true; colores: EntradaColor[]; titulo: "Color" | "Modelo"; enfoque: { x: number; y: number } } | { ok: false; motivo: string } {
  const o = (crudo && typeof crudo === "object" ? crudo : {}) as Record<string, unknown>;
  const lista = o.colores;
  if (!Array.isArray(lista)) return { ok: false, motivo: "La lista de colores no es válida." };
  if (lista.length > MAXIMO_COLORES) return { ok: false, motivo: `Cada producto puede tener hasta ${MAXIMO_COLORES} colores.` };
  const titulo = o.titulo === "Modelo" ? "Modelo" : "Color";
  const e = (o.enfoque && typeof o.enfoque === "object" ? o.enfoque : {}) as Record<string, unknown>;
  const pct = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? Math.min(100, Math.max(0, Math.round(v))) : 50);
  const enfoque = { x: pct(e.x), y: pct(e.y) };
  const propias = new Set(fotosDeColores(actual));
  const prefijo = `/media/${prefijoFotoColor(actual.id)}`;
  // Recién subida para ESTE producto: prefijo exacto + los 12 caracteres al azar (ni uno más).
  const recienSubida = (f: string) => direccionMediaValida(f) && f.startsWith(prefijo) && /^[0-9a-f]{12}$/.test(f.slice(prefijo.length));
  const fotoValida = (f: unknown): f is string => typeof f === "string" && (propias.has(f) || recienSubida(f));
  const idsActuales = new Set((actual.colores ?? []).map((c) => c.id));
  const salida: EntradaColor[] = [];
  const nombres = new Set<string>();
  for (const [i, x] of lista.entries()) {
    const c = (x && typeof x === "object" ? x : {}) as Record<string, unknown>;
    const nombre = typeof c.nombre === "string" ? normalizeInput(c.nombre) : "";
    if (!nombre) return { ok: false, motivo: `Escribe el nombre del color ${i + 1}.` };
    if (nombre.length > 40) return { ok: false, motivo: `El nombre «${nombre.slice(0, 20)}…» es muy largo (máximo 40).` };
    if (nombres.has(nombre.toLowerCase())) return { ok: false, motivo: `Hay dos colores llamados «${nombre}».` };
    nombres.add(nombre.toLowerCase());
    let disponible: number | null = null;
    if (c.disponible !== null && c.disponible !== undefined && c.disponible !== "") {
      const d = typeof c.disponible === "string" ? Number(c.disponible) : c.disponible;
      if (typeof d !== "number" || !Number.isInteger(d) || d < 0 || d > STOCK_MAXIMO) {
        return { ok: false, motivo: `Revisa las unidades de «${nombre}»: un número entero, o vacío para sin límite.` };
      }
      disponible = d;
    }
    if (!fotoValida(c.foto) || !fotoValida(c.mini)) return { ok: false, motivo: `La foto de «${nombre}» no es válida. Vuelve a subirla.` };
    const id = typeof c.id === "string" && idsActuales.has(c.id) ? c.id : undefined;
    salida.push({ id, nombre, disponible, foto: c.foto, mini: c.mini });
  }
  return { ok: true, colores: salida, titulo, enfoque };
}

/** Lo que manda la pantalla por cada opción (v0.40): unidades DISPONIBLES, como en los colores. */
export interface EntradaOpcion {
  id?: string;
  nombre: string;
  precio: number | null;
  /** Sin colores: unidades de la opción (null = sin límite). */
  disponible: number | null;
  /** Con colores: por cada color, unidades (null = sin límite) o "no" (no viene en esta opción). */
  colores: Record<string, number | null | "no">;
}

const unidades = (v: unknown): number | null | false => {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "string" ? Number(v) : v;
  return typeof n === "number" && Number.isInteger(n) && n >= 0 && n <= STOCK_MAXIMO ? n : false;
};

/** Valida las opciones que manda el panel contra el producto guardado (sus colores reales). */
export function validarOpciones(
  crudo: unknown,
  actual: ProductoCatalogo
): { ok: true; opciones: EntradaOpcion[]; titulo: string } | { ok: false; motivo: string } {
  const o = (crudo && typeof crudo === "object" ? crudo : {}) as Record<string, unknown>;
  const lista = o.opciones;
  if (!Array.isArray(lista)) return { ok: false, motivo: "La lista de opciones no es válida." };
  if (lista.length > MAXIMO_OPCIONES) return { ok: false, motivo: `Cada producto puede tener hasta ${MAXIMO_OPCIONES} opciones.` };
  const titulo = (typeof o.titulo === "string" ? normalizeInput(o.titulo).trim() : "").slice(0, LARGO_TITULO_OPCIONES) || "Tamaño";
  const colores = new Set((actual.colores ?? []).map((c) => c.id));
  const idsActuales = new Set((actual.opciones ?? []).map((x) => x.id));
  const nombres = new Set<string>();
  const salida: EntradaOpcion[] = [];
  for (const [i, x] of lista.entries()) {
    const c = (x && typeof x === "object" ? x : {}) as Record<string, unknown>;
    const nombre = typeof c.nombre === "string" ? normalizeInput(c.nombre).trim() : "";
    if (!nombre) return { ok: false, motivo: `Escribe el nombre de la opción ${i + 1}.` };
    if (nombre.length > 40) return { ok: false, motivo: `El nombre «${nombre.slice(0, 20)}…» es muy largo (máximo 40).` };
    if (nombres.has(nombre.toLowerCase())) return { ok: false, motivo: `Hay dos opciones llamadas «${nombre}».` };
    nombres.add(nombre.toLowerCase());
    let precio: number | null = null;
    if (c.precio !== null && c.precio !== undefined && c.precio !== "") {
      const n = typeof c.precio === "string" ? Number(c.precio.replace(/[.\s$]/g, "")) : c.precio;
      if (typeof n !== "number" || !Number.isInteger(n) || n < 1 || n > PRECIO_MAXIMO) return { ok: false, motivo: `Revisa el precio de «${nombre}»: en pesos, sin decimales, o vacío para usar el del producto.` };
      precio = n;
    }
    const disponible = unidades(c.disponible);
    if (disponible === false) return { ok: false, motivo: `Revisa las unidades de «${nombre}»: un número entero, o vacío para sin límite.` };
    const porColor: Record<string, number | null | "no"> = {};
    const crudoColores = (c.colores && typeof c.colores === "object" ? c.colores : {}) as Record<string, unknown>;
    for (const id of colores) {
      const v = crudoColores[id];
      if (v === "no") porColor[id] = "no";
      else {
        const u = unidades(v);
        if (u === false) return { ok: false, motivo: `Revisa las unidades de «${nombre}» en el color «${actual.colores!.find((k) => k.id === id)?.nombre}».` };
        porColor[id] = u;
      }
    }
    if (colores.size && Object.values(porColor).every((v) => v === "no")) return { ok: false, motivo: `«${nombre}» tiene que venir en al menos un color.` };
    salida.push({ id: typeof c.id === "string" && idsActuales.has(c.id) ? c.id : undefined, nombre, precio, disponible, colores: porColor });
  }
  return { ok: true, opciones: salida, titulo };
}

/**
 * Quita de las opciones los colores que el producto ya no tiene (al borrar un
 * color). Una opción que solo venía en colores borrados ya no se puede vender
 * en ninguno: se quita (antes que dejarla «en todos los colores» sin querer).
 */
export function limpiarOpcionesDeColores(p: ProductoCatalogo): void {
  if (!p.opciones) return;
  const colores = new Set((p.colores ?? []).map((c) => c.id));
  const salida: OpcionProducto[] = [];
  for (const o of p.opciones) {
    const n: OpcionProducto = { ...o };
    if (n.colores) {
      n.colores = n.colores.filter((c) => colores.has(c));
      if (!n.colores.length) {
        if (colores.size) continue;
        delete n.colores;
      }
    }
    if (n.stockColores) {
      n.stockColores = Object.fromEntries(Object.entries(n.stockColores).filter(([c]) => colores.has(c)));
      if (!Object.keys(n.stockColores).length) delete n.stockColores;
    }
    salida.push(n);
  }
  if (salida.length) p.opciones = salida;
  else {
    delete p.opciones;
    delete p.tituloOpciones;
  }
}

/** Deja `fotos` como galería: la primera pasa a ser la principal. */
function ponerFotos(p: ProductoCatalogo, todas: string[]) {
  if (todas.length) p.imagen = todas[0];
  else delete p.imagen;
  if (todas.length > 1) p.fotos = todas.slice(1);
  else delete p.fotos;
}

export interface EntradaProducto {
  id?: string;
  nombre: string;
  precio: number;
  /** null = sin límite. */
  disponible: number | null;
  categoria: string;
  tipo: "fisico" | "digital";
  descripcion: string;
  destacado: boolean;
  /** Código del video de YouTube, o null si no tiene. */
  video: string | null;
  /** Subcategoría (v0.39), o null si no tiene. */
  subcategoria: string | null;
}

/** Valida y limpia lo que mandó la pantalla. Devuelve errores por campo. */
export function validarEntrada(
  crudo: unknown,
  categorias: { id: string; subcategorias?: { id: string }[] }[]
): { ok: true; datos: EntradaProducto } | { ok: false; errores: Record<string, string> } {
  const e: Record<string, string> = {};
  const o = (crudo && typeof crudo === "object" ? crudo : {}) as Record<string, unknown>;
  const texto = (v: unknown, saltos = false) => (typeof v === "string" ? normalizeInput(v, { allowNewlines: saltos }) : "");

  const nombre = texto(o.nombre);
  if (nombre.length < 2) e.nombre = "Escribe al menos 2 caracteres.";
  else if (nombre.length > 80) e.nombre = "Máximo 80 caracteres.";

  const descripcion = texto(o.descripcion, true);
  if (descripcion.length > 1000) e.descripcion = "Máximo 1.000 caracteres.";

  const precio = typeof o.precio === "string" ? Number(o.precio.replace(/[.\s$]/g, "")) : o.precio;
  if (typeof precio !== "number" || !Number.isInteger(precio) || precio < 1 || precio > PRECIO_MAXIMO) {
    e.precio = "Escribe el precio en pesos, sin decimales (ej: 15000).";
  }

  let disponible: number | null = null;
  if (o.disponible !== null && o.disponible !== undefined && o.disponible !== "") {
    const d = typeof o.disponible === "string" ? Number(o.disponible) : o.disponible;
    if (typeof d !== "number" || !Number.isInteger(d) || d < 0 || d > STOCK_MAXIMO) {
      e.disponible = "Escribe un número entero, o déjalo vacío para que no tenga límite.";
    } else disponible = d;
  }

  const categoria = typeof o.categoria === "string" ? o.categoria : "";
  if (!categorias.some((c) => c.id === categoria)) e.categoria = "Elige una categoría.";

  // Subcategoría: vacía = ninguna; si viene, debe existir en ESA categoría.
  const subcategoria = typeof o.subcategoria === "string" && o.subcategoria ? o.subcategoria : null;
  if (subcategoria && !e.categoria && !categorias.find((c) => c.id === categoria)?.subcategorias?.some((x) => x.id === subcategoria)) {
    e.subcategoria = "Esa subcategoría no existe en la categoría elegida. Recarga la página.";
  }

  const tipo = o.tipo === "digital" ? "digital" : o.tipo === "fisico" ? "fisico" : null;
  if (!tipo) e.tipo = "Elige si es físico o digital.";

  let video: string | null = null;
  const textoVideo = typeof o.video === "string" ? o.video.trim() : "";
  if (textoVideo) {
    video = idVideoYoutube(textoVideo);
    if (!video) e.video = "Pega el enlace de un video de YouTube (ej: https://youtu.be/…), o déjalo vacío.";
  }

  const id = o.id === undefined || o.id === null || o.id === "" ? undefined : o.id;
  if (id !== undefined && (typeof id !== "string" || !ID_VALIDO.test(id))) e.id = "Producto inválido.";

  if (Object.keys(e).length) return { ok: false, errores: e };
  return {
    ok: true,
    datos: {
      id: id as string | undefined,
      nombre,
      descripcion,
      precio: precio as number,
      disponible,
      categoria,
      tipo: tipo as "fisico" | "digital",
      destacado: o.destacado === true,
      video,
      subcategoria,
    },
  };
}

export function crearGestionProductos(catalogo: FuenteCatalogo, config: ConfigPanel) {
  async function listar(ctx: Ctx): Promise<Response> {
    const s = await exigirSesion(ctx, false);
    if (s instanceof Response) return s;
    const vigente = await catalogo.obtener(ctx.env);
    const productos = [];
    for (const p of vigente.productos) {
      const d = await productoDisponible(vigente, ctx.env, p.id);
      const colores = [];
      for (const c of p.colores ?? []) {
        const compuesto = idConColor(p.id, c.id);
        const dc = await productoDisponible(vigente, ctx.env, compuesto);
        colores.push({
          ...c,
          disponible: c.stock === undefined ? null : Number(dc?.stock ?? 0),
          vendidos: c.stock === undefined ? null : await unidadesVendidas(ctx.env, compuesto),
        });
      }
      const conColores = tieneColores(p);
      // Opciones (v0.40): lo DISPONIBLE de cada combinación ("no" = no viene en ese color).
      const opciones = [];
      for (const o of p.opciones ?? []) {
        const porColor: Record<string, { disponible: number | null; vendidos: number | null } | "no"> = {};
        for (const c of p.colores ?? []) {
          if (!colorEnOpcion(o, c.id)) {
            porColor[c.id] = "no";
            continue;
          }
          const k = idCompuesto(p.id, c.id, o.id);
          const declarado = o.stockColores?.[c.id];
          porColor[c.id] = declarado === undefined ? { disponible: null, vendidos: null } : { disponible: Number((await productoDisponible(vigente, ctx.env, k))?.stock ?? 0), vendidos: await unidadesVendidas(ctx.env, k) };
        }
        const k = idCompuesto(p.id, undefined, o.id);
        opciones.push({
          id: o.id,
          nombre: o.nombre,
          precio: o.precio ?? null,
          disponible: conColores || o.stock === undefined ? null : Number((await productoDisponible(vigente, ctx.env, k))?.stock ?? 0),
          vendidos: conColores || o.stock === undefined ? null : await unidadesVendidas(ctx.env, k),
          colores: porColor,
        });
      }
      productos.push({
        ...p,
        colores,
        opciones,
        // Cuántos colores pueden tomar las fotos que trae el sitio (botón del panel).
        fotosSitio: aplicarFotosDelSitio(p, catalogo.inicial.buscar(p.id)).cambios,
        disponible: conColores ? (d?.stock === undefined ? null : Number(d.stock)) : p.stock === undefined ? null : Number(d?.stock ?? 0),
        vendidos: conColores
          ? colores.reduce((n, c) => n + (c.vendidos ?? 0), 0)
          : p.stock === undefined
            ? null
            : await unidadesVendidas(ctx.env, p.id),
      });
    }
    // Los nombres de categoría vigentes (pueden haberse cambiado en el panel).
    const categorias = vigente.categorias.map((c) => ({ id: c.id, nombre: c.nombre, subcategorias: (c.subcategorias ?? []).map((x) => ({ id: x.id, nombre: x.nombre })) }));
    const editado = await catalogo.editado(ctx.env);
    const nuevos = editado
      ? productosNuevosDelSitio(vigente.productos, catalogo.inicial.productos, vigente.categorias.map((c) => c.id), await descartados(ctx))
      : [];
    return jsonResponse(200, {
      editado,
      categorias,
      productos,
      // Productos que trae el sitio y la clienta todavía no tiene (v0.42).
      productosSitio: nuevos.map((p) => ({ id: p.id, nombre: p.nombre, categoria: p.categoria })),
      ajustesFicha: await obtenerAjustesFicha(ctx.env),
      vistaListas: await obtenerVistaListas(ctx.env, config.vistaListas),
      maximoColores: MAXIMO_COLORES,
    });
  }

  async function guardar(ctx: Ctx, entrada: EntradaProducto): Promise<Response> {
    const vigente = await catalogo.obtener(ctx.env);
    const lista = vigente.productos.map((p) => ({ ...p }));
    let producto: ProductoCatalogo;
    let reponer = false;

    if (entrada.id) {
      const i = lista.findIndex((p) => p.id === entrada.id);
      if (i < 0) return jsonResponse(404, { message: "Ese producto ya no existe. Recarga la página." });
      const actual = lista[i];
      const disponibleAhora =
        actual.stock === undefined ? null : Number((await productoDisponible(vigente, ctx.env, actual.id))?.stock ?? 0);
      producto = {
        ...actual,
        nombre: entrada.nombre,
        precio: entrada.precio,
        categoria: entrada.categoria,
        tipo: entrada.tipo,
        descripcion: entrada.descripcion,
        destacado: entrada.destacado,
      };
      if (entrada.video) producto.video = entrada.video;
      else delete producto.video;
      if (entrada.subcategoria) producto.subcategoria = entrada.subcategoria;
      else delete producto.subcategoria;
      // Con colores u opciones, el stock vive en cada color o combinación (secciones Colores y Opciones).
      if (!tieneColores(actual) && !tieneOpciones(actual) && entrada.disponible !== disponibleAhora) {
        reponer = true;
        if (entrada.disponible === null) delete producto.stock;
        else producto.stock = entrada.disponible;
      }
      lista[i] = producto;
    } else {
      producto = {
        id: idDesdeNombre(entrada.nombre, new Set(lista.map((p) => p.id))),
        nombre: entrada.nombre,
        precio: entrada.precio,
        categoria: entrada.categoria,
        tipo: entrada.tipo,
        descripcion: entrada.descripcion,
        destacado: entrada.destacado,
        ...(entrada.video ? { video: entrada.video } : {}),
        ...(entrada.subcategoria ? { subcategoria: entrada.subcategoria } : {}),
        ...(entrada.disponible === null ? {} : { stock: entrada.disponible }),
      };
      reponer = true;
      lista.push(producto);
    }

    const r = await catalogo.guardar(ctx.env, lista);
    if (!r.ok) return jsonResponse(400, { message: r.motivo || "No se pudo guardar." });
    if (reponer) await reponerStock(ctx.env, producto.id);
    return jsonResponse(200, { ok: true, producto });
  }

  async function eliminar(ctx: Ctx, id: unknown): Promise<Response> {
    if (typeof id !== "string" || !ID_VALIDO.test(id)) return jsonResponse(400, { message: "Producto inválido." });
    const vigente = await catalogo.obtener(ctx.env);
    const quitado = vigente.productos.find((p) => p.id === id);
    if (!quitado) return jsonResponse(404, { message: "Ese producto ya no existe." });
    const r = await catalogo.guardar(ctx.env, vigente.productos.filter((p) => p.id !== id));
    if (!r.ok) return jsonResponse(400, { message: r.motivo || "No se pudo eliminar." });
    // Las fotos se borran DESPUÉS de sacar el producto: si algo falla a mitad,
    // nunca queda un producto apuntando a una foto que no existe.
    for (const f of [...fotosDe(quitado), ...fotosDeColores(quitado)]) await borrarFoto(ctx.env, f);
    await reponerStock(ctx.env, id);
    for (const c of quitado.colores ?? []) await reponerStock(ctx.env, idConColor(id, c.id));
    return jsonResponse(200, { ok: true });
  }

  async function post(ctx: Ctx): Promise<Response> {
    const s = await exigirSesion(ctx, true);
    if (s instanceof Response) return s;
    const cuerpo = await leerJson(ctx.request);
    if (!cuerpo) return jsonResponse(400, { message: "Solicitud inválida." });
    if (cuerpo.accion === "eliminar") return eliminar(ctx, cuerpo.id);
    if (cuerpo.accion === "fotos") return ordenarFotos(ctx, cuerpo.id, cuerpo.fotos);
    if (cuerpo.accion === "colores") return guardarColores(ctx, cuerpo);
    if (cuerpo.accion === "ajustes-ficha") {
      try {
        return jsonResponse(200, { ok: true, ajustesFicha: await guardarAjustesFicha(ctx.env, cuerpo.ajustes) });
      } catch {
        return jsonResponse(500, { message: "No se pudo guardar. Intenta de nuevo." });
      }
    }
    if (cuerpo.accion === "fotos-sitio") return fotosSitio(ctx, cuerpo.id);
    if (cuerpo.accion === "productos-sitio") return productosSitio(ctx, cuerpo.ids);
    if (cuerpo.accion === "descartar-productos-sitio") return descartarProductosSitio(ctx, cuerpo.ids);
    if (cuerpo.accion === "opciones") return guardarOpciones(ctx, cuerpo);
    if (cuerpo.accion === "vista-listas") {
      try {
        return jsonResponse(200, { ok: true, vistaListas: await guardarVistaListas(ctx.env, cuerpo.vista, config.vistaListas) });
      } catch {
        return jsonResponse(500, { message: "No se pudo guardar. Intenta de nuevo." });
      }
    }
    if (cuerpo.accion === "guardar") {
      const v = validarEntrada(cuerpo.producto, (await catalogo.obtener(ctx.env)).categorias);
      if (!v.ok) return jsonResponse(400, { message: "Revisa los campos marcados.", errores: v.errores });
      return guardar(ctx, v.datos);
    }
    return jsonResponse(400, { message: "Esa acción no existe." });
  }

  /**
   * Colores de un producto: la lista completa, en orden. Los que ya
   * existían mantienen su id (va en carritos y pedidos); los nuevos lo
   * sacan del nombre. Cambiar las unidades de un color reinicia su
   * contador de vendidos (como el stock de un producto). Las fotos de los
   * colores quitados se borran DESPUÉS de guardar.
   */
  async function guardarColores(ctx: Ctx, cuerpo: Record<string, unknown>): Promise<Response> {
    const id = cuerpo.id;
    if (typeof id !== "string" || !ID_VALIDO.test(id)) return jsonResponse(400, { message: "Producto inválido." });
    const vigente = await catalogo.obtener(ctx.env);
    const lista = vigente.productos.map((p) => ({ ...p }));
    const i = lista.findIndex((p) => p.id === id);
    if (i < 0) return jsonResponse(404, { message: "Ese producto ya no existe. Recarga la página." });
    const actual = lista[i];
    const v = validarColores(cuerpo, actual);
    if (!v.ok) return jsonResponse(400, { message: v.motivo });

    const usados = new Set(v.colores.filter((c) => c.id).map((c) => c.id!));
    const reponer: string[] = [];
    const nuevos: ColorProducto[] = [];
    for (const c of v.colores) {
      const previo = c.id ? actual.colores?.find((x) => x.id === c.id) : undefined;
      const idColor = c.id ?? idColorDesdeNombre(c.nombre, usados);
      usados.add(idColor);
      const color: ColorProducto = { id: idColor, nombre: c.nombre, foto: c.foto, mini: c.mini };
      const compuesto = idConColor(id, idColor);
      if (previo) {
        const ahora = previo.stock === undefined ? null : Number((await productoDisponible(vigente, ctx.env, compuesto))?.stock ?? 0);
        if (c.disponible !== ahora) {
          reponer.push(compuesto);
          if (c.disponible !== null) color.stock = c.disponible;
        } else if (previo.stock !== undefined) color.stock = previo.stock;
      } else {
        reponer.push(compuesto);
        if (c.disponible !== null) color.stock = c.disponible;
      }
      nuevos.push(color);
    }
    const quitados = (actual.colores ?? []).filter((c) => !nuevos.some((n) => n.id === c.id));
    const producto: ProductoCatalogo = { ...actual };
    if (nuevos.length) {
      producto.colores = nuevos;
      producto.tituloColores = v.titulo;
      producto.enfoqueColores = v.enfoque;
      // Con colores, el stock del producto es la suma de los colores.
      delete producto.stock;
    } else {
      delete producto.colores;
      delete producto.tituloColores;
      delete producto.enfoqueColores;
    }
    // Las opciones no pueden nombrar colores que ya no existen.
    limpiarOpcionesDeColores(producto);
    lista[i] = producto;
    const r = await catalogo.guardar(ctx.env, lista);
    if (!r.ok) return jsonResponse(400, { message: r.motivo || "No se pudieron guardar los colores." });
    for (const k of reponer) await reponerStock(ctx.env, k);
    const enUso = new Set(fotosDeColores(producto));
    for (const c of quitados) {
      await reponerStock(ctx.env, idConColor(id, c.id));
      for (const f of [c.foto, c.mini]) if (f && !enUso.has(f)) await borrarFoto(ctx.env, f);
    }
    // Fotos reemplazadas en colores que siguen (foto nueva para el mismo color).
    for (const c of actual.colores ?? []) {
      if (quitados.includes(c)) continue;
      for (const f of [c.foto, c.mini]) if (f && !enUso.has(f)) await borrarFoto(ctx.env, f);
    }
    return jsonResponse(200, { ok: true, producto });
  }

  /**
   * POST { accion: "opciones", id, titulo, opciones: EntradaOpcion[] } (v0.40).
   * Igual que los colores: si las unidades disponibles de una combinación
   * cambian, ese número pasa a ser su stock y se reinicia su contador de
   * vendidos; si no se tocan, las ventas siguen descontando.
   */
  async function guardarOpciones(ctx: Ctx, cuerpo: Record<string, unknown>): Promise<Response> {
    const id = cuerpo.id;
    if (typeof id !== "string" || !ID_VALIDO.test(id)) return jsonResponse(400, { message: "Producto inválido." });
    const vigente = await catalogo.obtener(ctx.env);
    const lista = vigente.productos.map((p) => ({ ...p }));
    const i = lista.findIndex((p) => p.id === id);
    if (i < 0) return jsonResponse(404, { message: "Ese producto ya no existe. Recarga la página." });
    const actual = lista[i];
    const v = validarOpciones(cuerpo, actual);
    if (!v.ok) return jsonResponse(400, { message: v.motivo });
    const conColores = tieneColores(actual);
    const usados = new Set(v.opciones.filter((o) => o.id).map((o) => o.id!));
    const reponer: string[] = [];
    const nuevas: OpcionProducto[] = [];
    const disponibleAhora = async (k: string, declarado: number | undefined) =>
      declarado === undefined ? null : Number((await productoDisponible(vigente, ctx.env, k))?.stock ?? 0);
    for (const e of v.opciones) {
      const previa = e.id ? actual.opciones?.find((x) => x.id === e.id) : undefined;
      const idOp = e.id ?? idOpcionDesdeNombre(e.nombre, usados);
      usados.add(idOp);
      const o: OpcionProducto = { id: idOp, nombre: e.nombre, ...(e.precio !== null ? { precio: e.precio } : {}) };
      if (conColores) {
        const vienen = Object.entries(e.colores).filter(([, u]) => u !== "no").map(([c]) => c);
        if (vienen.length < actual.colores!.length) o.colores = actual.colores!.map((c) => c.id).filter((c) => vienen.includes(c));
        const stockColores: Record<string, number> = {};
        for (const c of vienen) {
          const pedido = e.colores[c] as number | null;
          const k = idCompuesto(id, c, idOp);
          const declaradoPrevio = previa && colorEnOpcion(previa, c) ? previa.stockColores?.[c] : undefined;
          const ahora = previa && colorEnOpcion(previa, c) ? await disponibleAhora(k, declaradoPrevio) : undefined;
          if (ahora === undefined || pedido !== ahora) {
            reponer.push(k);
            if (pedido !== null) stockColores[c] = pedido;
          } else if (declaradoPrevio !== undefined) stockColores[c] = declaradoPrevio;
        }
        if (Object.keys(stockColores).length) o.stockColores = stockColores;
      } else {
        const k = idCompuesto(id, undefined, idOp);
        const ahora = previa ? await disponibleAhora(k, previa.stock) : undefined;
        if (ahora === undefined || e.disponible !== ahora) {
          reponer.push(k);
          if (e.disponible !== null) o.stock = e.disponible;
        } else if (previa?.stock !== undefined) o.stock = previa.stock;
      }
      nuevas.push(o);
    }
    const producto: ProductoCatalogo = { ...actual };
    if (nuevas.length) {
      producto.opciones = nuevas;
      producto.tituloOpciones = v.titulo;
      delete producto.stock;
    } else {
      delete producto.opciones;
      delete producto.tituloOpciones;
    }
    lista[i] = producto;
    const r = await catalogo.guardar(ctx.env, lista);
    if (!r.ok) return jsonResponse(400, { message: r.motivo || "No se pudieron guardar las opciones." });
    for (const k of reponer) await reponerStock(ctx.env, k);
    // Combinaciones que ya no existen: su contador se borra.
    for (const o of actual.opciones ?? []) {
      const sigue = nuevas.find((n) => n.id === o.id);
      for (const c of conColores ? actual.colores!.map((x) => x.id) : [undefined]) {
        if (!sigue || (c && !colorEnOpcion(sigue, c))) await reponerStock(ctx.env, idCompuesto(id, c, o.id));
      }
    }
    return jsonResponse(200, { ok: true, producto });
  }

  async function descartados(ctx: Ctx): Promise<string[]> {
    try {
      const v = JSON.parse((await ctx.env.REVIEWS_KV?.get(CLAVE_PRODUCTOS_DESCARTADOS)) || "[]");
      return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && ID_VALIDO.test(x)).slice(0, 500) : [];
    } catch {
      return [];
    }
  }

  function idsPedidos(ids: unknown): string[] | "todos" | null {
    if (ids === "todos") return "todos";
    if (!Array.isArray(ids) || !ids.length || ids.length > 100 || ids.some((x) => typeof x !== "string" || !ID_VALIDO.test(x))) return null;
    return [...new Set(ids as string[])];
  }

  /** POST { accion: "productos-sitio", ids: string[] | "todos" }: suma los productos nuevos del sitio (v0.42). */
  async function productosSitio(ctx: Ctx, ids: unknown): Promise<Response> {
    const pedidos = idsPedidos(ids);
    if (!pedidos) return jsonResponse(400, { message: "Lista de productos inválida." });
    const vigente = await catalogo.obtener(ctx.env);
    const nuevos = productosNuevosDelSitio(vigente.productos, catalogo.inicial.productos, vigente.categorias.map((c) => c.id), await descartados(ctx))
      .filter((p) => pedidos === "todos" || pedidos.includes(p.id));
    if (!nuevos.length) return jsonResponse(200, { ok: true, agregados: 0 });
    const lista = [...vigente.productos.map((p) => ({ ...p })), ...nuevos.map((p) => structuredClone(p))];
    const r = await catalogo.guardar(ctx.env, lista);
    if (!r.ok) return jsonResponse(400, { message: r.motivo || "No se pudieron agregar los productos." });
    return jsonResponse(200, { ok: true, agregados: nuevos.length });
  }

  /** POST { accion: "descartar-productos-sitio", ids: string[] }: no volver a ofrecerlos (v0.42). */
  async function descartarProductosSitio(ctx: Ctx, ids: unknown): Promise<Response> {
    const pedidos = idsPedidos(ids);
    if (!pedidos || pedidos === "todos") return jsonResponse(400, { message: "Lista de productos inválida." });
    if (!ctx.env.REVIEWS_KV) return jsonResponse(503, { message: "El almacén del sitio no está disponible." });
    const lista = [...new Set([...(await descartados(ctx)), ...pedidos])].slice(-500);
    await ctx.env.REVIEWS_KV.put(CLAVE_PRODUCTOS_DESCARTADOS, JSON.stringify(lista));
    return jsonResponse(200, { ok: true });
  }

  /** POST { accion: "fotos-sitio", id: "<producto>" | "todos" }: ver aplicarFotosDelSitio. */
  async function fotosSitio(ctx: Ctx, id: unknown): Promise<Response> {
    const todos = id === "todos";
    if (!todos && (typeof id !== "string" || !ID_VALIDO.test(id))) return jsonResponse(400, { message: "Producto inválido." });
    const vigente = await catalogo.obtener(ctx.env);
    let total = 0;
    let productosCambiados = 0;
    const lista = vigente.productos.map((p) => {
      if (!todos && p.id !== id) return p;
      const r = aplicarFotosDelSitio(p, catalogo.inicial.buscar(p.id));
      total += r.cambios;
      if (r.cambios) productosCambiados++;
      return r.producto;
    });
    if (!todos && !vigente.productos.some((p) => p.id === id)) return jsonResponse(404, { message: "Ese producto ya no existe. Recarga la página." });
    if (total === 0) return jsonResponse(200, { ok: true, cambios: 0, productos: 0 });
    const r = await catalogo.guardar(ctx.env, lista);
    if (!r.ok) return jsonResponse(400, { message: r.motivo || "No se pudieron poner las fotos." });
    return jsonResponse(200, { ok: true, cambios: total, productos: productosCambiados });
  }

  /**
   * Orden final de las fotos de un producto: la primera es la principal.
   * Solo se aceptan fotos que el producto YA tiene (reordenar o quitar);
   * las que se quitan se borran del almacén.
   */
  async function ordenarFotos(ctx: Ctx, id: unknown, fotos: unknown): Promise<Response> {
    if (typeof id !== "string" || !ID_VALIDO.test(id)) return jsonResponse(400, { message: "Producto inválido." });
    if (!Array.isArray(fotos) || fotos.length > MAXIMO_FOTOS || fotos.some((f) => typeof f !== "string")) {
      return jsonResponse(400, { message: "La lista de fotos no es válida." });
    }
    const vigente = await catalogo.obtener(ctx.env);
    const lista = vigente.productos.map((p) => ({ ...p }));
    const i = lista.findIndex((p) => p.id === id);
    if (i < 0) return jsonResponse(404, { message: "Ese producto ya no existe. Recarga la página." });
    const actuales = fotosDe(lista[i]);
    const nuevas = [...new Set(fotos as string[])];
    if (nuevas.some((f) => !actuales.includes(f))) {
      return jsonResponse(400, { message: "Las fotos cambiaron mientras editabas. Recarga la página." });
    }
    ponerFotos(lista[i], nuevas);
    const r = await catalogo.guardar(ctx.env, lista);
    if (!r.ok) return jsonResponse(400, { message: r.motivo || "No se pudieron guardar las fotos." });
    for (const f of actuales) if (!nuevas.includes(f)) await borrarFoto(ctx.env, f);
    return jsonResponse(200, { ok: true, imagen: lista[i].imagen ?? null, fotos: lista[i].fotos ?? [] });
  }

  /**
   * POST multipart: id + archivo (+ modo). La foto ya viene reducida desde el navegador.
   *   modo "agregar": se suma al final de la galería (hasta MAXIMO_FOTOS).
   *   sin modo: reemplaza la foto principal (como antes).
   */
  async function foto(ctx: Ctx): Promise<Response> {
    const s = await exigirSesion(ctx, true);
    if (s instanceof Response) return s;
    const maximo = config.maximoBytesFoto ?? MAXIMO_BYTES_FOTO;
    if (Number(ctx.request.headers.get("Content-Length") || "0") > maximo + 64 * 1024) {
      return jsonResponse(413, { message: "La foto pesa demasiado. Intenta con otra." });
    }
    let form: FormData;
    try {
      form = await ctx.request.formData();
    } catch {
      return jsonResponse(400, { message: "Solicitud inválida." });
    }
    const id = form.get("id");
    const archivo = form.get("archivo");
    const agregar = form.get("modo") === "agregar";
    const paraColor = form.get("modo") === "color";
    if (typeof id !== "string" || !ID_VALIDO.test(id)) return jsonResponse(400, { message: "Producto inválido." });
    if (!archivo || typeof archivo === "string") return jsonResponse(400, { message: "No llegó ninguna foto." });
    if (archivo.size === 0) return jsonResponse(400, { message: "El archivo está vacío." });
    if (archivo.size > maximo) return jsonResponse(413, { message: "La foto pesa demasiado. Intenta con otra." });

    const datos = await archivo.arrayBuffer();
    const bytes = new Uint8Array(datos);
    const tipo = tipoRealDeImagen(bytes);
    if (!tipo) return jsonResponse(400, { message: "El archivo no es una foto válida. Usa JPG, PNG o WebP." });
    const medidas = medidasAceptables(bytes, config.maximoLadoFoto);
    if (!medidas.ok) return jsonResponse(400, { message: medidas.motivo || "Esa foto no se puede usar." });

    const vigente = await catalogo.obtener(ctx.env);
    const lista = vigente.productos.map((p) => ({ ...p }));
    const i = lista.findIndex((p) => p.id === id);
    if (i < 0) return jsonResponse(404, { message: "Ese producto ya no existe. Recarga la página." });
    if (paraColor) {
      // Foto de un color: se guarda y se devuelve; queda puesta al guardar los colores.
      if (fotosDeColores(lista[i]).length >= MAXIMO_COLORES * 2 + 40) {
        return jsonResponse(400, { message: "Este producto ya tiene demasiadas fotos de colores." });
      }
      const g = await guardarFoto(ctx.env, `color-${id}`, datos, tipo);
      if (!g.ok || !g.direccion) return jsonResponse(500, { message: "No se pudo guardar la foto." });
      return jsonResponse(200, { ok: true, imagen: g.direccion });
    }
    if (agregar && fotosDe(lista[i]).length >= MAXIMO_FOTOS) {
      return jsonResponse(400, { message: `Cada producto puede tener hasta ${MAXIMO_FOTOS} fotos.` });
    }

    const guardada = await guardarFoto(ctx.env, `producto-${id}`, datos, tipo);
    if (!guardada.ok || !guardada.direccion) return jsonResponse(500, { message: "No se pudo guardar la foto." });
    const anterior = agregar ? undefined : lista[i].imagen;
    if (agregar) ponerFotos(lista[i], [...fotosDe(lista[i]), guardada.direccion]);
    else lista[i].imagen = guardada.direccion;
    const r = await catalogo.guardar(ctx.env, lista);
    if (!r.ok) {
      await borrarFoto(ctx.env, guardada.direccion);
      return jsonResponse(500, { message: r.motivo || "No se pudo guardar la foto." });
    }
    if (anterior && anterior !== guardada.direccion) await borrarFoto(ctx.env, anterior);
    return jsonResponse(200, { ok: true, imagen: guardada.direccion, fotos: fotosDe(lista[i]) });
  }

  return { listar, post, foto, imagenValida };
}
