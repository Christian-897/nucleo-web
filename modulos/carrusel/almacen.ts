/**
 * CARRUSEL EDITABLE: vive en KV y se edita desde el panel.
 *
 * Mientras nadie lo edite rige el del sitio (su configuración). La primera
 * vez que el panel guarda, el carrusel completo pasa a KV y desde ahí manda
 * KV. "Restablecer" borra la clave y vuelve el del sitio.
 *
 * Caché en memoria de 10 s por copia del worker (igual que el catálogo):
 * la portada es la página más visitada y KV gratis da 100.000 lecturas al día.
 */
import type { EnvBase } from "../../core/tipos";
import { validarCarrusel } from "./validar";
import type { EstadoCarrusel } from "./tipos";

export const CLAVE_CARRUSEL = "carrusel:portada";
const CACHE_MS = 10_000;

export interface FuenteCarrusel {
  readonly clave: string;
  /** El carrusel del sitio (lo que rige mientras nadie edite). */
  readonly inicial: EstadoCarrusel;
  obtener(env: EnvBase): Promise<EstadoCarrusel>;
  /** ¿Se editó desde el panel? */
  editado(env: EnvBase): Promise<boolean>;
  guardar(env: EnvBase, estado: unknown): Promise<{ ok: true; estado: EstadoCarrusel } | { ok: false; motivo: string; errores?: Record<string, string> }>;
  /** Vuelve al carrusel del sitio. */
  restablecer(env: EnvBase): Promise<{ ok: boolean }>;
}

export class ErrorCarrusel extends Error {}

export function crearCarruselEditable(inicial: Partial<EstadoCarrusel> & Pick<EstadoCarrusel, "diapositivas">, opciones: { clave?: string } = {}): FuenteCarrusel {
  const v = validarCarrusel(inicial);
  if (!v.ok) {
    // Error del sitio (código), no del panel: se avisa claro al construir.
    throw new ErrorCarrusel(`El carrusel inicial no es válido: ${JSON.stringify(v.errores)}`);
  }
  const base = v.datos;
  const clave = opciones.clave ?? CLAVE_CARRUSEL;
  const caches = new WeakMap<object, { estado: EstadoCarrusel; editado: boolean; hasta: number }>();
  const SIN_KV = {};
  const llave = (env: EnvBase) => (env.REVIEWS_KV as object | undefined) ?? SIN_KV;

  async function leer(env: EnvBase) {
    const ahora = Date.now();
    const cache = caches.get(llave(env));
    if (cache && cache.hasta > ahora) return cache;
    let estado = base;
    let editado = false;
    const crudo = await env.REVIEWS_KV?.get(clave);
    if (crudo) {
      try {
        const r = validarCarrusel(JSON.parse(crudo));
        if (!r.ok) throw new Error(JSON.stringify(r.errores));
        estado = r.datos;
        editado = true;
      } catch (e) {
        console.error("[carrusel] lo guardado en KV no es válido; se usa el del sitio", e);
      }
    }
    const nuevo = { estado, editado, hasta: ahora + CACHE_MS };
    caches.set(llave(env), nuevo);
    return nuevo;
  }

  return {
    clave,
    inicial: base,
    obtener: async (env) => (await leer(env)).estado,
    editado: async (env) => (await leer(env)).editado,
    async guardar(env, crudo) {
      const r = validarCarrusel(crudo);
      if (!r.ok) return { ok: false, motivo: r.mensaje, errores: r.errores };
      if (!env.REVIEWS_KV) return { ok: false, motivo: "Falta el almacenamiento (KV) en Cloudflare." };
      try {
        await env.REVIEWS_KV.put(clave, JSON.stringify(r.datos));
      } catch {
        return { ok: false, motivo: "No se pudo guardar. Intenta de nuevo." };
      }
      caches.delete(llave(env));
      return { ok: true, estado: r.datos };
    },
    async restablecer(env) {
      try {
        await env.REVIEWS_KV?.delete(clave);
      } catch {
        return { ok: false };
      }
      caches.delete(llave(env));
      return { ok: true };
    },
  };
}
