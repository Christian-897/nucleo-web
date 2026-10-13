/**
 * TARIFAS EDITABLES: viven en KV y se cambian desde el panel (Pedidos →
 * Despacho). Mientras nadie las edite rigen las del sitio.
 *
 * Caché en memoria de 10 s por copia del worker, como el carrusel: el
 * carrito y la ficha las piden seguido y KV gratis da 100.000 lecturas al día.
 */
import type { EnvBase } from "../../core/tipos";
import { type TarifasDespacho, type TextosDespacho, textosDespacho, validarTarifas, ZONAS_EXTREMAS_POR_DEFECTO } from "./calculo";

export const CLAVE_DESPACHO = "despacho:tarifas";
const CACHE_MS = 10_000;

export interface OpcionesDespacho {
  /** Lo que rige mientras nadie edite. Por defecto: por pagar. */
  inicial?: Partial<TarifasDespacho>;
  /** Texto del modo "por pagar" (el que el sitio ya tenía). */
  detallePorPagar: string;
  /** Regiones de la zona extrema. Por defecto Arica y Parinacota, Aysén y Magallanes. */
  zonasExtremas?: readonly string[];
  clave?: string;
}

export interface FuenteDespacho {
  readonly clave: string;
  readonly inicial: TarifasDespacho;
  readonly zonasExtremas: readonly string[];
  readonly detallePorPagar: string;
  obtener(env: EnvBase): Promise<TarifasDespacho>;
  textos(tarifas: TarifasDespacho): TextosDespacho;
  guardar(env: EnvBase, entrada: unknown): Promise<{ ok: true; tarifas: TarifasDespacho } | { ok: false; motivo: string; errores?: Record<string, string> }>;
}

export class ErrorDespacho extends Error {}

export function crearDespachoEditable(opciones: OpcionesDespacho): FuenteDespacho {
  const v = validarTarifas({ modo: "por-pagar", rm: 0, regiones: 0, extremas: 0, gratisDesde: null, ...opciones.inicial });
  if (!v.ok) throw new ErrorDespacho(`Las tarifas iniciales no son válidas: ${JSON.stringify(v.errores)}`);
  const base = v.datos;
  const clave = opciones.clave ?? CLAVE_DESPACHO;
  const zonasExtremas = opciones.zonasExtremas ?? ZONAS_EXTREMAS_POR_DEFECTO;
  const caches = new WeakMap<object, { tarifas: TarifasDespacho; hasta: number }>();
  const SIN_KV = {};
  const llave = (env: EnvBase) => (env.REVIEWS_KV as object | undefined) ?? SIN_KV;

  return {
    clave,
    inicial: base,
    zonasExtremas,
    detallePorPagar: opciones.detallePorPagar,
    textos: (t) => textosDespacho(t, opciones.detallePorPagar, zonasExtremas),
    async obtener(env) {
      const ahora = Date.now();
      const c = caches.get(llave(env));
      if (c && c.hasta > ahora) return c.tarifas;
      let tarifas = base;
      const crudo = await env.REVIEWS_KV?.get(clave);
      if (crudo) {
        try {
          const r = validarTarifas(JSON.parse(crudo));
          if (!r.ok) throw new Error(JSON.stringify(r.errores));
          tarifas = r.datos;
        } catch (e) {
          console.error("[despacho] lo guardado en KV no es válido; rigen las tarifas del sitio", e);
        }
      }
      caches.set(llave(env), { tarifas, hasta: ahora + CACHE_MS });
      return tarifas;
    },
    async guardar(env, entrada) {
      const r = validarTarifas(entrada);
      if (!r.ok) return { ok: false, motivo: r.mensaje, errores: r.errores };
      if (!env.REVIEWS_KV) return { ok: false, motivo: "Falta el almacenamiento (KV) en Cloudflare." };
      try {
        await env.REVIEWS_KV.put(clave, JSON.stringify(r.datos));
      } catch {
        return { ok: false, motivo: "No se pudo guardar. Intenta de nuevo." };
      }
      caches.delete(llave(env));
      return { ok: true, tarifas: r.datos };
    },
  };
}
