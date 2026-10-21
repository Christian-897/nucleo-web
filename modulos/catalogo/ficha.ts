/**
 * AJUSTES DE LA FICHA DE PRODUCTO (v0.35): qué partes opcionales se ven y
 * cómo se dibujan las miniaturas de colores. Uno para toda la tienda; se
 * cambia en el panel (Productos → Cómo se ve la ficha).
 *
 * El borde quita del HTML lo apagado (`data-ficha-opcional="<parte>"`), así
 * que no queda nada escondido que alguien pueda "encender" desde el navegador.
 */
import type { EnvBase } from "../../core/tipos";

export const CLAVE_AJUSTES_FICHA = "catalogo:ficha";
const CACHE_MS = 10_000;

export type EstiloMiniatura = "completa" | "acercamiento";

export interface AjustesFicha {
  /** "completa": la foto entera del color · "acercamiento": de cerca (la textura). */
  miniatura: EstiloMiniatura;
  /** Etiqueta con la categoría sobre el nombre. */
  categoria: boolean;
  /** "Disponible" / "¡Quedan 2!" / "Agotado" junto al precio. */
  disponible: boolean;
  /** "12 colores" sobre la foto y en el selector. */
  cuentaColores: boolean;
  /** Lupa para ver la foto en pantalla completa. */
  lupa: boolean;
  /** Recuadros de confianza (envío, pago seguro, atención). */
  confianza: boolean;
}

export const PARTES_OPCIONALES = ["categoria", "disponible", "cuentaColores", "lupa", "confianza"] as const;
export type ParteOpcional = (typeof PARTES_OPCIONALES)[number];

export const AJUSTES_FICHA_POR_DEFECTO: AjustesFicha = {
  miniatura: "completa",
  categoria: true,
  disponible: true,
  cuentaColores: true,
  lupa: true,
  confianza: true,
};

/** Toma lo que venga (KV o panel) y devuelve ajustes válidos, completando con los de fábrica. */
export function limpiarAjustesFicha(crudo: unknown): AjustesFicha {
  const o = (crudo && typeof crudo === "object" ? crudo : {}) as Record<string, unknown>;
  const salida: AjustesFicha = { ...AJUSTES_FICHA_POR_DEFECTO };
  if (o.miniatura === "completa" || o.miniatura === "acercamiento") salida.miniatura = o.miniatura;
  for (const parte of PARTES_OPCIONALES) if (typeof o[parte] === "boolean") salida[parte] = o[parte] as boolean;
  return salida;
}

const caches = new WeakMap<object, { ajustes: AjustesFicha; hasta: number }>();
const SIN_KV = {};
const llave = (env: EnvBase) => (env.REVIEWS_KV as object | undefined) ?? SIN_KV;

export async function obtenerAjustesFicha(env: EnvBase): Promise<AjustesFicha> {
  const ahora = Date.now();
  const c = caches.get(llave(env));
  if (c && c.hasta > ahora) return c.ajustes;
  let ajustes = AJUSTES_FICHA_POR_DEFECTO;
  try {
    const crudo = await env.REVIEWS_KV?.get(CLAVE_AJUSTES_FICHA);
    if (crudo) ajustes = limpiarAjustesFicha(JSON.parse(crudo));
  } catch (e) {
    console.error("[catalogo] ajustes de la ficha ilegibles; rigen los de fábrica", e);
  }
  caches.set(llave(env), { ajustes, hasta: ahora + CACHE_MS });
  return ajustes;
}

export async function guardarAjustesFicha(env: EnvBase, crudo: unknown): Promise<AjustesFicha> {
  const ajustes = limpiarAjustesFicha(crudo);
  if (!env.REVIEWS_KV) throw new Error("Sin KV");
  await env.REVIEWS_KV.put(CLAVE_AJUSTES_FICHA, JSON.stringify(ajustes));
  caches.set(llave(env), { ajustes, hasta: Date.now() + CACHE_MS });
  return ajustes;
}
