/**
 * Interruptor del aviso desde el panel.
 *
 * El aviso se enciende si la variable CONSTRUCCION="1" está en Cloudflare
 * (forzado: el panel no lo puede apagar) O si alguien lo encendió desde el
 * panel (queda en KV, con quién y cuándo).
 *
 * Vista previa sin clave: quien tiene sesión en el panel recibe la misma
 * cookie firmada que da `?previa=CLAVE`. La clave efectiva es ACCESO_PREVIA
 * o, si no existe, una derivada de ADMIN_PEPPER (nunca se muestra a nadie).
 *
 * Caché en memoria de 10 s por copia del worker, como el despacho: el
 * middleware corre en cada visita y KV gratis da 100.000 lecturas al día.
 */
import { hmacSha256Hex } from "../../core/cripto";
import { limpiarVariable } from "../../core/correo";
import { type EnvConstruccion, LARGO_MINIMO_CLAVE_PREVIA, NOMBRE_COOKIE } from "./config";

export const CLAVE_ESTADO_CONSTRUCCION = "construccion:panel";
const CACHE_MS = 10_000;

export interface EstadoGuardado {
  activo: boolean;
  /** Usuario del panel que hizo el último cambio. */
  por: string;
  /** ISO de ese cambio. */
  fecha: string;
}

export interface EstadoConstruccion extends Partial<EstadoGuardado> {
  /** El aviso se está mostrando (por la variable o por el panel). */
  activo: boolean;
  /** La variable CONSTRUCCION de Cloudflare lo tiene encendido: el panel no puede apagarlo. */
  forzado: boolean;
  /** Hay clave para dar vista previa a quien tiene sesión. */
  previa: boolean;
}

export function forzadoPorVariable(env: EnvConstruccion): boolean {
  const v = limpiarVariable(env.CONSTRUCCION).toLowerCase();
  return ["1", "true", "si", "sí", "on"].includes(v);
}

const caches = new WeakMap<object, { estado: EstadoGuardado | null; hasta: number }>();
const SIN_KV = {};
const llave = (env: EnvConstruccion) => (env.REVIEWS_KV as object | undefined) ?? SIN_KV;

function leerGuardado(crudo: string | null): EstadoGuardado | null {
  if (!crudo) return null;
  try {
    const d = JSON.parse(crudo);
    if (typeof d?.activo !== "boolean") return null;
    return { activo: d.activo, por: String(d.por ?? "").slice(0, 64), fecha: String(d.fecha ?? "").slice(0, 40) };
  } catch {
    return null;
  }
}

/** Lo que dejó el panel (con caché). Si KV falla, cuenta como apagado: el sitio sigue vendiendo. */
export async function estadoDelPanel(env: EnvConstruccion): Promise<EstadoGuardado | null> {
  if (!env.REVIEWS_KV) return null;
  const ahora = Date.now();
  const c = caches.get(llave(env));
  if (c && c.hasta > ahora) return c.estado;
  let estado: EstadoGuardado | null = null;
  try {
    estado = leerGuardado(await env.REVIEWS_KV.get(CLAVE_ESTADO_CONSTRUCCION));
  } catch (e) {
    console.error("[construccion] no se pudo leer el estado del panel", e);
  }
  caches.set(llave(env), { estado, hasta: ahora + CACHE_MS });
  return estado;
}

/** ¿Se muestra el aviso? Variable de Cloudflare O interruptor del panel. */
export async function avisoEncendido(env: EnvConstruccion): Promise<boolean> {
  if (forzadoPorVariable(env)) return true;
  return (await estadoDelPanel(env))?.activo === true;
}

/** Clave con que se firma la vista previa. null = nadie puede entrar (falla cerrado). */
export async function claveEfectiva(env: EnvConstruccion & { ADMIN_PEPPER?: string }): Promise<string | null> {
  const c = limpiarVariable(env.ACCESO_PREVIA);
  if (c.length >= LARGO_MINIMO_CLAVE_PREVIA) return c;
  const p = limpiarVariable(env.ADMIN_PEPPER);
  if (p.length >= LARGO_MINIMO_CLAVE_PREVIA) return hmacSha256Hex(p, "previa-desde-panel:v1");
  return null;
}

export async function obtenerEstado(env: EnvConstruccion & { ADMIN_PEPPER?: string }): Promise<EstadoConstruccion> {
  const forzado = forzadoPorVariable(env);
  const guardado = await estadoDelPanel(env);
  return {
    ...(guardado ?? {}),
    activo: forzado || guardado?.activo === true,
    forzado,
    previa: (await claveEfectiva(env)) !== null,
  };
}

export async function cambiarEstado(env: EnvConstruccion, activo: boolean, por: string): Promise<EstadoGuardado> {
  if (!env.REVIEWS_KV) throw new Error("Sin KV no se puede guardar el estado");
  const estado: EstadoGuardado = { activo, por: por.slice(0, 64), fecha: new Date().toISOString() };
  await env.REVIEWS_KV.put(CLAVE_ESTADO_CONSTRUCCION, JSON.stringify(estado));
  caches.set(llave(env), { estado, hasta: Date.now() + CACHE_MS });
  return estado;
}

/** Lo que se guarda en la cookie: una firma, no la clave. */
export function firmaAcceso(clave: string): Promise<string> {
  return hmacSha256Hex(clave, "acceso-previa:v1");
}

/** Cookie de vista previa para quien tiene sesión en el panel. null si no hay clave. */
export async function cookieVistaPrevia(env: EnvConstruccion & { ADMIN_PEPPER?: string }, dias = 30): Promise<string | null> {
  const clave = await claveEfectiva(env);
  if (!clave) return null;
  return `${NOMBRE_COOKIE}=${await firmaAcceso(clave)}; Path=/; Max-Age=${dias * 86400}; HttpOnly; Secure; SameSite=Lax`;
}

/** Solo para pruebas: olvida la caché. */
export function _olvidarCache(env: EnvConstruccion): void {
  caches.delete(llave(env));
}
