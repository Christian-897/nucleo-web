/**
 * CONTENIDO EDITABLE: vive en KV y se edita desde el panel.
 *
 * Los valores iniciales son los del propio sitio (su configuración). En KV
 * se guardan SOLO los que alguien cambió; al leer se mezclan. Así un sitio
 * nuevo funciona sin instalar nada, y "restablecer" es simplemente borrar
 * esa clave del guardado.
 *
 * Caché en memoria de 10 s por copia del worker (igual que el catálogo).
 */
import type { EnvBase } from "../../core/tipos";
import { cssTema, variablesTema } from "./tema";
import { revisarContraste, type ParContraste } from "./color";
import { cssDeFuente, fuentePorId } from "./fuentes";
import type { Esquema, Valores } from "./tipos";
import { validarCambios } from "./validar";

export const CLAVE_CONTENIDO = "contenido:valores";
const CACHE_MS = 10_000;

export interface OpcionesContenido {
  /** Variables de color calculadas a partir de las elegidas (versión oscura del acento, etc.). */
  derivar?: (valores: Valores) => Record<string, string>;
  /** Pares de contraste que el panel revisa y avisa. */
  contraste?: ParContraste[];
}

export interface EstadoContenido {
  valores: Valores;
  /** Solo lo cambiado respecto a lo inicial. */
  cambios: Valores;
  editado: boolean;
  /** ¿Cambió algún color o tipografía? (Solo entonces el sitio carga el tema.) */
  temaEditado: boolean;
  /** Huella corta del tema (para que el navegador no use uno viejo). */
  version: string;
  /** Hojas de las tipografías elegidas que no son las del sitio (/fuentes/<id>/fuente.css). */
  fuentesExtra: string[];
}

export interface FuenteContenido {
  readonly esquema: Esquema;
  readonly iniciales: Valores;
  readonly opciones: OpcionesContenido;
  obtener(env: EnvBase): Promise<EstadoContenido>;
  guardar(env: EnvBase, entrada: unknown): Promise<{ ok: boolean; errores?: Record<string, string>; motivo?: string }>;
  /** Vuelve claves a su valor inicial. Sin claves: todo. */
  restablecer(env: EnvBase, claves?: string[]): Promise<{ ok: boolean; anteriores: Valores }>;
  css(estado: EstadoContenido): string;
  /** Avisos de contraste (no bloquean: se puede guardar igual). */
  avisos(valores: Valores): ReturnType<typeof revisarContraste>;
}

/** Huella corta y estable (FNV-1a), suficiente para versionar el CSS. */
export function huella(texto: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < texto.length; i++) {
    h ^= texto.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

export function crearContenidoEditable(esquema: Esquema, iniciales: Valores, opciones: OpcionesContenido = {}): FuenteContenido {
  // Los iniciales también se validan: un error en la configuración del sitio
  // se ve al construir, no en producción.
  const revision = validarCambios(esquema, iniciales);
  if (!revision.ok) {
    throw new Error(`Contenido inicial inválido: ${JSON.stringify(revision.errores)}`);
  }
  const claves = new Set(esquema.campos.map((c) => c.clave));
  const deTema = new Set(esquema.campos.filter((c) => c.tipo === "color" || c.tipo === "fuente").map((c) => c.clave));
  const camposFuente = esquema.campos.filter((c) => c.tipo === "fuente");
  const caches = new WeakMap<object, { estado: EstadoContenido; hasta: number }>();
  const SIN_KV = {};

  function armar(cambios: Valores): EstadoContenido {
    const limpios: Valores = {};
    for (const [k, v] of Object.entries(cambios)) if (claves.has(k) && typeof v === "string" && v !== iniciales[k]) limpios[k] = v;
    const tema = Object.keys(limpios).filter((k) => deTema.has(k)).sort().map((k) => [k, limpios[k]]);
    const valores = { ...iniciales, ...limpios };
    const fuentesExtra = [
      ...new Set(
        camposFuente
          .map((c) => valores[c.clave])
          // Las tipografías iniciales ya vienen en el CSS del sitio.
          .filter((id) => id && fuentePorId(id) && !camposFuente.some((c) => iniciales[c.clave] === id))
          .map(cssDeFuente)
      ),
    ];
    return {
      valores,
      cambios: limpios,
      editado: Object.keys(limpios).length > 0,
      temaEditado: tema.length > 0,
      version: huella(JSON.stringify(tema)),
      fuentesExtra,
    };
  }

  async function obtener(env: EnvBase): Promise<EstadoContenido> {
    const ahora = Date.now();
    const llave = (env.REVIEWS_KV as object | undefined) ?? SIN_KV;
    const c = caches.get(llave);
    if (c && c.hasta > ahora) return c.estado;
    let cambios: Valores = {};
    const crudo = await env.REVIEWS_KV?.get(CLAVE_CONTENIDO);
    if (crudo) {
      try {
        // Se revalida al leer: un valor que dejó de ser válido no llega al sitio.
        const r = validarCambios(esquema, JSON.parse(crudo));
        cambios = r.valores;
      } catch (e) {
        console.error("[contenido] lo guardado en KV no es válido; se usa el del sitio", e);
        cambios = {};
      }
    }
    const estado = armar(cambios);
    caches.set(llave, { estado, hasta: ahora + CACHE_MS });
    return estado;
  }

  async function escribir(env: EnvBase, cambios: Valores): Promise<boolean> {
    const estado = armar(cambios);
    try {
      if (estado.editado) await env.REVIEWS_KV!.put(CLAVE_CONTENIDO, JSON.stringify(estado.cambios));
      else await env.REVIEWS_KV!.delete(CLAVE_CONTENIDO);
    } catch {
      return false;
    }
    caches.delete(env.REVIEWS_KV as object);
    return true;
  }

  return {
    esquema,
    iniciales,
    opciones,
    obtener,
    async guardar(env, entrada) {
      if (!env.REVIEWS_KV) return { ok: false, motivo: "Falta el almacenamiento (KV) en Cloudflare." };
      const r = validarCambios(esquema, entrada);
      if (!r.ok) return { ok: false, errores: r.errores };
      const actual = await obtener(env);
      if (!(await escribir(env, { ...actual.cambios, ...r.valores }))) return { ok: false, motivo: "No se pudo guardar. Intenta de nuevo." };
      return { ok: true };
    },
    async restablecer(env, lista) {
      if (!env.REVIEWS_KV) return { ok: false, anteriores: {} };
      const actual = await obtener(env);
      const quitar = new Set(lista ?? Object.keys(actual.cambios));
      const anteriores: Valores = {};
      const quedan: Valores = {};
      for (const [k, v] of Object.entries(actual.cambios)) {
        if (quitar.has(k)) anteriores[k] = v;
        else quedan[k] = v;
      }
      if (!(await escribir(env, quedan))) return { ok: false, anteriores: {} };
      return { ok: true, anteriores };
    },
    css(estado) {
      return cssTema(variablesTema(esquema, estado.valores, opciones.derivar));
    },
    avisos(valores) {
      // Los pares pueden nombrar un campo ("colores.acento") o un derivado ("--c-acento-oscuro").
      const todos = { ...iniciales, ...valores };
      return revisarContraste(opciones.contraste ?? [], { ...todos, ...(opciones.derivar?.(todos) ?? {}) });
    },
  };
}
