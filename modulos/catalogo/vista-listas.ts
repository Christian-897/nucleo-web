/**
 * CÓMO SE VEN EN LAS LISTAS LOS PRODUCTOS CON COLORES (v0.37). Uno para
 * toda la tienda; se cambia en el panel (Productos → Cómo se ven en la tienda).
 *
 *  - "producto": una tarjeta por producto, con sus colores a la vista
 *    (circulitos bajo la foto; al pasar el mouse o tocarlos, cambia la foto).
 *  - "color": una tarjeta por cada color ("Producto · Color"), que se puede
 *    agregar al carrito directo y lleva a la ficha con ese color elegido.
 *
 * Se elige por separado para las páginas de cada CATEGORÍA y para las
 * listas GENERALES (toda la tienda, destacados del inicio, relacionados).
 * Los productos sin colores se ven siempre igual.
 */
import type { EnvBase } from "../../core/tipos";

export const CLAVE_VISTA_LISTAS = "catalogo:vista-listas";
const CACHE_MS = 10_000;

export type VistaLista = "producto" | "color";
export const VISTAS_LISTA: readonly VistaLista[] = ["producto", "color"];

export interface VistaListas {
  /** Páginas de cada categoría (/tienda/<categoria>/). */
  categorias: VistaLista;
  /** Toda la tienda, destacados del inicio y "también te puede gustar". */
  general: VistaLista;
}

/** De fábrica: una tarjeta por producto en todas partes (como antes de v0.37). */
export const VISTA_LISTAS_POR_DEFECTO: VistaListas = { categorias: "producto", general: "producto" };

/** Lo que valga de `crudo`; lo demás, de `base` (lo que eligió el sitio) o de fábrica. */
export function limpiarVistaListas(crudo: unknown, base: Partial<VistaListas> = {}): VistaListas {
  const inicial = limpiarParcial(base, VISTA_LISTAS_POR_DEFECTO);
  return limpiarParcial(crudo, inicial);
}

function limpiarParcial(crudo: unknown, base: VistaListas): VistaListas {
  const o = (crudo && typeof crudo === "object" && !Array.isArray(crudo) ? crudo : {}) as Record<string, unknown>;
  const vale = (v: unknown): v is VistaLista => VISTAS_LISTA.includes(v as VistaLista);
  return {
    categorias: vale(o.categorias) ? o.categorias : base.categorias,
    general: vale(o.general) ? o.general : base.general,
  };
}

/** Qué vista rige para un filtro de lista ("categoria:<id>" → categorías; el resto → general). */
export function vistaDeFiltro(vista: VistaListas, filtro: string): VistaLista {
  return filtro.startsWith("categoria:") ? vista.categorias : vista.general;
}

const caches = new WeakMap<object, { crudo: unknown; hasta: number }>();
const SIN_KV = {};
const llave = (env: EnvBase) => (env.REVIEWS_KV as object | undefined) ?? SIN_KV;

/** Lo guardado en el panel encima de lo que eligió el sitio. Si KV falla, rige lo del sitio. */
export async function obtenerVistaListas(env: EnvBase, base: Partial<VistaListas> = {}): Promise<VistaListas> {
  const ahora = Date.now();
  const c = caches.get(llave(env));
  if (c && c.hasta > ahora) return limpiarVistaListas(c.crudo, base);
  let crudo: unknown = null;
  try {
    const texto = await env.REVIEWS_KV?.get(CLAVE_VISTA_LISTAS);
    if (texto) crudo = JSON.parse(texto);
  } catch (e) {
    console.error("[catalogo] la vista de las listas está ilegible; rige la del sitio", e);
  }
  caches.set(llave(env), { crudo, hasta: ahora + CACHE_MS });
  return limpiarVistaListas(crudo, base);
}

export async function guardarVistaListas(env: EnvBase, entrada: unknown, base: Partial<VistaListas> = {}): Promise<VistaListas> {
  const vista = limpiarVistaListas(entrada, base);
  if (!env.REVIEWS_KV) throw new Error("Sin KV");
  await env.REVIEWS_KV.put(CLAVE_VISTA_LISTAS, JSON.stringify(vista));
  caches.set(llave(env), { crudo: vista, hasta: Date.now() + CACHE_MS });
  return vista;
}
