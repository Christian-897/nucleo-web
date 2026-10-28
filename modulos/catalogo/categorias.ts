/**
 * CATEGORÍAS EDITABLES desde el panel:
 *  - nombre, nombre corto, bajada, texto (descripcion, v0.44) y foto de cada una (KV "catalogo:categorias",
 *    cambios por id encima de las del sitio);
 *  - categorías NUEVAS y categorías del sitio BORRADAS (KV
 *    "catalogo:categorias-estructura"). Las nuevas no tienen página
 *    estática: el borde arma /tienda/<id>/ desde una plantilla y las agrega
 *    a los menús en los espacios que el sitio deja (ver borde.ts). Solo se
 *    borra una categoría sin productos.
 */
import { normalizeInput } from "../../core/validar";
import { ID_VALIDO } from "./catalogo";
import type { CategoriaCatalogo, Subcategoria } from "./tipos";

export const CLAVE_ESTRUCTURA = "catalogo:categorias-estructura";
/** Tope de categorías nuevas: el sitio deja este número de espacios en sus menús. */
export const MAXIMO_NUEVAS = 12;

export interface CategoriaNueva {
  id: string;
  /** Nombre con que se creó (lo editado después va en los cambios). */
  nombre: string;
  creada: string;
}
export interface EstructuraCategorias {
  nuevas: CategoriaNueva[];
  /** Ids de categorías DEL SITIO que se borraron desde el panel. */
  ocultas: string[];
}
export const ESTRUCTURA_VACIA: EstructuraCategorias = { nuevas: [], ocultas: [] };

/** Limpia lo guardado: ids válidos, sin chocar con las del sitio, sin repetir y con tope. */
export function limpiarEstructura(crudo: unknown, base: CategoriaCatalogo[]): EstructuraCategorias {
  const delSitio = new Set(base.map((c) => c.id));
  const o = (crudo && typeof crudo === "object" && !Array.isArray(crudo) ? crudo : {}) as Record<string, unknown>;
  const vistas = new Set<string>();
  const nuevas: CategoriaNueva[] = [];
  for (const n of Array.isArray(o.nuevas) ? o.nuevas : []) {
    if (!n || typeof n !== "object") continue;
    const v = n as Record<string, unknown>;
    const id = typeof v.id === "string" ? v.id : "";
    const nombre = typeof v.nombre === "string" ? normalizeInput(v.nombre).trim().slice(0, LIMITES_CATEGORIA.nombre) : "";
    if (!ID_VALIDO.test(id) || delSitio.has(id) || vistas.has(id) || nombre.length < 2) continue;
    vistas.add(id);
    nuevas.push({ id, nombre, creada: typeof v.creada === "string" ? v.creada : "" });
    if (nuevas.length >= MAXIMO_NUEVAS) break;
  }
  const ocultas = [...new Set((Array.isArray(o.ocultas) ? o.ocultas : []).filter((x): x is string => typeof x === "string" && delSitio.has(x)))];
  return { nuevas, ocultas };
}

/** Las categorías que rigen: las del sitio (sin las borradas) + las nuevas, con los cambios encima. */
export function categoriasVigentes(base: CategoriaCatalogo[], estructura: EstructuraCategorias, cambios: CambiosCategorias): CategoriaCatalogo[] {
  const ocultas = new Set(estructura.ocultas);
  const lista: CategoriaCatalogo[] = [
    ...base.filter((c) => !ocultas.has(c.id)),
    ...estructura.nuevas.map((n) => ({ id: n.id, nombre: n.nombre, corto: n.nombre, nueva: true })),
  ];
  return aplicarCambios(lista, cambios);
}

export const CLAVE_CATEGORIAS = "catalogo:categorias";
export const LIMITES_CATEGORIA = { nombre: 60, corto: 40, bajada: 40, subcategoria: 40, descripcion: 2000 } as const;

/** Texto largo (v0.44): con saltos de línea, sin líneas en blanco de más. */
export function limpiarTextoLargo(v: string, max: number): string {
  return normalizeInput(v, { allowNewlines: true })
    .replace(/\r\n?/g, "\n")
    .replace(/\t/g, " ")
    .replace(/[ ]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, max)
    .trim();
}
/** Subcategorías por categoría (v0.39). */
export const MAXIMO_SUBCATEGORIAS = 12;

/** "Microfibra (premium)" → "microfibra-premium", sin repetir los ya usados. */
export function idSubcategoria(nombre: string, usados: Set<string>): string {
  const base =
    normalizeInput(nombre)
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "sub";
  let id = base;
  for (let n = 2; usados.has(id); n++) id = `${base.slice(0, 36)}-${n}`;
  return id;
}

/**
 * Lista limpia de subcategorías: nombres de 2 a 40 caracteres, sin repetir
 * nombre ni id, hasta MAXIMO_SUBCATEGORIAS. Un id válido que ya venía se
 * conserva (es la dirección pública); a los nuevos se les crea desde el nombre.
 */
export function limpiarSubcategorias(crudo: unknown): Subcategoria[] {
  if (!Array.isArray(crudo)) return [];
  const usados = new Set<string>();
  const nombres = new Set<string>();
  const salida: Subcategoria[] = [];
  // Primero se reservan los ids que ya venían, para que un nombre nuevo no los tome.
  for (const x of crudo) {
    const id = x && typeof x === "object" ? (x as Record<string, unknown>).id : undefined;
    if (typeof id === "string" && ID_VALIDO.test(id)) usados.add(id);
  }
  const reservados = new Set<string>();
  for (const x of crudo) {
    if (!x || typeof x !== "object") continue;
    const o = x as Record<string, unknown>;
    const nombre = typeof o.nombre === "string" ? normalizeInput(o.nombre).trim().slice(0, LIMITES_CATEGORIA.subcategoria) : "";
    if (nombre.length < 2 || nombres.has(nombre.toLowerCase())) continue;
    let id = typeof o.id === "string" && ID_VALIDO.test(o.id) && !reservados.has(o.id) ? o.id : "";
    if (!id) {
      id = idSubcategoria(nombre, new Set([...usados, ...reservados]));
    }
    reservados.add(id);
    nombres.add(nombre.toLowerCase());
    salida.push({ id, nombre });
    if (salida.length >= MAXIMO_SUBCATEGORIAS) break;
  }
  return salida;
}

/** Errores de la lista que manda el panel (para mostrarlos antes de guardar). */
export function erroresSubcategorias(crudo: unknown): string | null {
  if (crudo === undefined) return null;
  if (!Array.isArray(crudo)) return "La lista de subcategorías no es válida.";
  if (crudo.length > MAXIMO_SUBCATEGORIAS) return `Máximo ${MAXIMO_SUBCATEGORIAS} subcategorías por categoría.`;
  const vistos = new Set<string>();
  for (const x of crudo) {
    const n = x && typeof x === "object" && typeof (x as Record<string, unknown>).nombre === "string" ? normalizeInput((x as Record<string, string>).nombre).trim() : "";
    if (n.length < 2) return "Cada subcategoría necesita un nombre de al menos 2 caracteres.";
    if (n.length > LIMITES_CATEGORIA.subcategoria) return `El nombre de una subcategoría puede tener hasta ${LIMITES_CATEGORIA.subcategoria} caracteres.`;
    if (vistos.has(n.toLowerCase())) return `La subcategoría «${n}» está repetida.`;
    vistos.add(n.toLowerCase());
  }
  return null;
}

/** La subcategoría de un producto, si existe hoy en su categoría. */
export function subcategoriaDe(c: Pick<CategoriaCatalogo, "subcategorias"> | undefined, id: unknown): Subcategoria | undefined {
  return typeof id === "string" && id ? c?.subcategorias?.find((s) => s.id === id) : undefined;
}

export interface CambioCategoria {
  nombre?: string;
  /** Vacío = igual al nombre. */
  corto?: string;
  /** Línea chica bajo el nombre en las tarjetas ("Colección satín"). Vacío = sin bajada. */
  bajada?: string;
  imagen?: string;
  /** Lista completa de subcategorías (v0.39). Sin el campo = las del sitio; [] = sin subcategorías. */
  subcategorias?: Subcategoria[];
  /** Texto de la página de la categoría (v0.44). Vacío = sin texto. Google lo usa para describirla. */
  descripcion?: string;
}
export type CambiosCategorias = Record<string, CambioCategoria>;

/** Solo fotos propias: del sitio (/img/) o subidas al panel (/media/). */
export function imagenCategoriaValida(v: unknown): v is string {
  return typeof v === "string" && /^\/(media|img)\/[a-zA-Z0-9/_.-]{1,150}$/.test(v) && !v.includes("..");
}

/** Valida el cambio de UNA categoría (lo que manda el panel). */
export function validarCambioCategoria(
  crudo: unknown
): { ok: true; datos: CambioCategoria } | { ok: false; errores: Record<string, string> } {
  const o = (crudo && typeof crudo === "object" ? crudo : {}) as Record<string, unknown>;
  const texto = (v: unknown) => (typeof v === "string" ? normalizeInput(v).trim() : "");
  const e: Record<string, string> = {};
  const nombre = texto(o.nombre);
  const corto = texto(o.corto);
  const bajada = texto(o.bajada);
  const descripcionCruda = typeof o.descripcion === "string" ? limpiarTextoLargo(o.descripcion, LIMITES_CATEGORIA.descripcion + 1) : undefined;
  if (nombre.length < 2) e.nombre = "Escribe al menos 2 caracteres.";
  else if (nombre.length > LIMITES_CATEGORIA.nombre) e.nombre = `Máximo ${LIMITES_CATEGORIA.nombre} caracteres.`;
  if (corto.length > LIMITES_CATEGORIA.corto) e.corto = `Máximo ${LIMITES_CATEGORIA.corto} caracteres.`;
  if (bajada.length > LIMITES_CATEGORIA.bajada) e.bajada = `Máximo ${LIMITES_CATEGORIA.bajada} caracteres.`;
  if (descripcionCruda !== undefined && descripcionCruda.length > LIMITES_CATEGORIA.descripcion) e.descripcion = `Máximo ${LIMITES_CATEGORIA.descripcion} caracteres.`;
  const errSub = erroresSubcategorias(o.subcategorias);
  if (errSub) e.subcategorias = errSub;
  if (Object.keys(e).length) return { ok: false, errores: e };
  return {
    ok: true,
    datos: {
      nombre,
      corto,
      bajada,
      ...(o.subcategorias !== undefined ? { subcategorias: limpiarSubcategorias(o.subcategorias) } : {}),
      ...(descripcionCruda !== undefined ? { descripcion: descripcionCruda } : {}),
    },
  };
}

/** Limpia lo guardado en KV: ids que no existen o campos malos se descartan. */
export function limpiarCambios(crudo: unknown, base: CategoriaCatalogo[]): CambiosCategorias {
  const ids = new Set(base.map((c) => c.id));
  const salida: CambiosCategorias = {};
  if (!crudo || typeof crudo !== "object" || Array.isArray(crudo)) return salida;
  for (const [id, valor] of Object.entries(crudo as Record<string, unknown>)) {
    if (!ids.has(id) || !valor || typeof valor !== "object") continue;
    const v = valor as Record<string, unknown>;
    const c: CambioCategoria = {};
    if (typeof v.nombre === "string" && v.nombre.trim().length >= 2) c.nombre = normalizeInput(v.nombre).trim().slice(0, LIMITES_CATEGORIA.nombre);
    if (typeof v.corto === "string") c.corto = normalizeInput(v.corto).trim().slice(0, LIMITES_CATEGORIA.corto);
    if (typeof v.bajada === "string") c.bajada = normalizeInput(v.bajada).trim().slice(0, LIMITES_CATEGORIA.bajada);
    if (imagenCategoriaValida(v.imagen)) c.imagen = v.imagen;
    if (Array.isArray(v.subcategorias)) c.subcategorias = limpiarSubcategorias(v.subcategorias);
    if (typeof v.descripcion === "string") c.descripcion = limpiarTextoLargo(v.descripcion, LIMITES_CATEGORIA.descripcion);
    if (Object.keys(c).length) salida[id] = c;
  }
  return salida;
}

/** Categorías del sitio con los cambios del panel encima (mismo orden y mismos ids). */
export function aplicarCambios(base: CategoriaCatalogo[], cambios: CambiosCategorias): CategoriaCatalogo[] {
  return base.map((c) => {
    const k = cambios[c.id];
    if (!k) return c;
    const nombre = k.nombre ?? c.nombre;
    return {
      ...c,
      nombre,
      // Si se cambió el nombre y el corto quedó vacío, el corto es el nombre.
      corto: k.corto !== undefined ? k.corto || nombre : c.corto,
      // La bajada sí puede quedar vacía a propósito (= sin bajada).
      bajada: k.bajada !== undefined ? k.bajada : c.bajada,
      ...(k.imagen ? { imagen: k.imagen } : {}),
      ...(k.subcategorias !== undefined ? { subcategorias: k.subcategorias } : {}),
      // Igual que la bajada: sin tocarla queda la del sitio; vacía = sin texto.
      ...(k.descripcion !== undefined ? { descripcion: k.descripcion } : {}),
    };
  });
}
