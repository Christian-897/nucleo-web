/**
 * CATEGORÍAS EDITABLES: nombre, nombre corto y foto de cada categoría se
 * cambian desde el panel. Las categorías en sí (cuáles existen y su
 * dirección /tienda/<id>/) las define el sitio: crear una nueva necesita
 * su página, y eso se hace en el código.
 *
 * Lo editado se guarda aparte del catálogo (KV "catalogo:categorias") como
 * cambios por id, encima de las categorías del sitio.
 */
import { normalizeInput } from "../../core/validar";
import type { CategoriaCatalogo } from "./tipos";

export const CLAVE_CATEGORIAS = "catalogo:categorias";
export const LIMITES_CATEGORIA = { nombre: 60, corto: 40 } as const;

export interface CambioCategoria {
  nombre?: string;
  /** Vacío = igual al nombre. */
  corto?: string;
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
  if (nombre.length < 2) e.nombre = "Escribe al menos 2 caracteres.";
  else if (nombre.length > LIMITES_CATEGORIA.nombre) e.nombre = `Máximo ${LIMITES_CATEGORIA.nombre} caracteres.`;
  if (corto.length > LIMITES_CATEGORIA.corto) e.corto = `Máximo ${LIMITES_CATEGORIA.corto} caracteres.`;
  if (Object.keys(e).length) return { ok: false, errores: e };
  return { ok: true, datos: { nombre, corto } };
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
      ...(k.imagen ? { imagen: k.imagen } : {}),
    };
  });
}
