/**
 * CATEGORÍAS EDITABLES desde el panel:
 *  - nombre, nombre corto, bajada y foto de cada una (KV "catalogo:categorias",
 *    cambios por id encima de las del sitio);
 *  - categorías NUEVAS y categorías del sitio BORRADAS (KV
 *    "catalogo:categorias-estructura"). Las nuevas no tienen página
 *    estática: el borde arma /tienda/<id>/ desde una plantilla y las agrega
 *    a los menús en los espacios que el sitio deja (ver borde.ts). Solo se
 *    borra una categoría sin productos.
 */
import { normalizeInput } from "../../core/validar";
import { ID_VALIDO } from "./catalogo";
import type { CategoriaCatalogo } from "./tipos";

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
export const LIMITES_CATEGORIA = { nombre: 60, corto: 40, bajada: 40 } as const;

export interface CambioCategoria {
  nombre?: string;
  /** Vacío = igual al nombre. */
  corto?: string;
  /** Línea chica bajo el nombre en las tarjetas ("Colección satín"). Vacío = sin bajada. */
  bajada?: string;
  imagen?: string;
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
  if (nombre.length < 2) e.nombre = "Escribe al menos 2 caracteres.";
  else if (nombre.length > LIMITES_CATEGORIA.nombre) e.nombre = `Máximo ${LIMITES_CATEGORIA.nombre} caracteres.`;
  if (corto.length > LIMITES_CATEGORIA.corto) e.corto = `Máximo ${LIMITES_CATEGORIA.corto} caracteres.`;
  if (bajada.length > LIMITES_CATEGORIA.bajada) e.bajada = `Máximo ${LIMITES_CATEGORIA.bajada} caracteres.`;
  if (Object.keys(e).length) return { ok: false, errores: e };
  return { ok: true, datos: { nombre, corto, bajada } };
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
    };
  });
}
