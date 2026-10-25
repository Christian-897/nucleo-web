/**
 * PERMISO PARA ABRIR Y CERRAR LA TIENDA (v0.41).
 *
 * El dueño del panel abre y cierra la tienda sin clave. Para que una persona
 * invitada pueda hacerlo:
 *  1. El dueño crea en Seguridad un CÓDIGO DE UN SOLO USO que vence solo
 *     (1 hora, 1 día o 3 días), igual que los enlaces de invitación.
 *  2. La invitada lo escribe en Resumen y, en ese mismo paso, crea SU PROPIA
 *     clave (mínimo 8 caracteres). El código se borra al usarse.
 *  3. Desde ahí abre y cierra la tienda con su clave.
 * El dueño le quita el permiso cuando quiera (se borra su clave). Si ella la
 * olvida: el dueño le quita el permiso y le da un código nuevo.
 *
 * Guardado en KV (nunca en claro):
 *  - Clave de cada invitada: PBKDF2-SHA256 (100.000 vueltas, sal al azar)
 *    sellada con ADMIN_PEPPER.
 *  - Código: HMAC(ADMIN_PEPPER) del código; con TTL igual a su vigencia.
 *
 * REGISTRO: queda anotado quién creó cada código, a quién se le dio el
 * permiso (al usar el código), quién lo anuló o lo quitó y quién abrió o
 * cerró la tienda, con día y hora. Se guardan los últimos 200 movimientos.
 */
import { compararSeguro, hmacSha256Hex } from "../../core/cripto";
import { limpiarVariable } from "../../core/correo";
import type { EnvPanel } from "./config";

export const LARGO_MINIMO_CLAVE_CONSTRUCCION = 8;
export const LARGO_MAXIMO_CLAVE_CONSTRUCCION = 200;
const VUELTAS = 100_000;
const P_CLAVE = "panel:construccion-clave:";
const P_CODIGO = "panel:construccion-codigo:";
const K_CLAVE = (usuario: string) => P_CLAVE + usuario;
/** Sin letras que se confunden (0/O, 1/I/L). 12 caracteres ≈ 60 bits. */
const ALFABETO = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const LARGO_CODIGO = 12;

interface ClaveGuardada {
  sal: string;
  huella: string;
  /** Cuándo usó el código (= desde cuándo tiene el permiso). */
  creada: string;
  /** Quién creó el código con que se le dio el permiso. */
  codigoDe?: string;
  /** Cuándo se creó ese código. */
  codigoCreado?: string;
}

/** Desde cuándo y por quién tiene permiso una invitada. */
export interface PermisoTienda {
  desde: string;
  dadoPor?: string;
}

export type TipoRegistro =
  | "codigo-creado"
  | "codigo-anulado"
  | "permiso-dado"
  | "permiso-quitado"
  | "tienda-cerrada"
  | "tienda-abierta";

export interface EventoRegistro {
  tipo: TipoRegistro;
  /** ISO, con hora. */
  fecha: string;
  /** Quién lo hizo (o quién dio el permiso, en "permiso-dado"). */
  por: string;
  /** A quién se le dio o quitó el permiso. */
  para?: string;
  /** ISO: vencimiento del código ("codigo-creado") o cuándo se creó ("permiso-dado"). */
  vence?: string;
  codigoCreado?: string;
}

const K_REGISTRO = "panel:construccion-registro";
const MAXIMO_REGISTRO = 200;

export interface CodigoPendiente {
  id: string;
  creado: string;
  vence: string;
  por: string;
}

const hex = (b: ArrayBuffer | Uint8Array) =>
  [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");

function pimienta(env: EnvPanel): string {
  const p = limpiarVariable(env.ADMIN_PEPPER);
  if (!p) throw new Error("Falta ADMIN_PEPPER.");
  return p;
}

async function huellaClave(env: EnvPanel, clave: string, sal: string): Promise<string> {
  const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(clave), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: new TextEncoder().encode(sal), iterations: VUELTAS },
    base,
    256
  );
  return hmacSha256Hex(pimienta(env), hex(bits));
}

/** "abcd-efgh 1234" → "ABCDEFGH1234" (sin guiones ni espacios, en mayúsculas). */
export function normalizarCodigo(codigo: unknown): string {
  return typeof codigo === "string" ? codigo.toUpperCase().replace(/[\s-]/g, "") : "";
}

/** Para mostrar: ABCD-EFGH-JKMN. */
export const codigoLegible = (codigo: string) => codigo.match(/.{1,4}/g)?.join("-") ?? codigo;

const resumenCodigo = (env: EnvPanel, codigo: string) => hmacSha256Hex(pimienta(env), "codigo-construccion:" + codigo);

// ───────────── registro ─────────────

export async function leerRegistroConstruccion(env: EnvPanel, cantidad = MAXIMO_REGISTRO): Promise<EventoRegistro[]> {
  const crudo = await env.REVIEWS_KV?.get(K_REGISTRO);
  if (!crudo) return [];
  try {
    const lista = JSON.parse(crudo) as EventoRegistro[];
    return Array.isArray(lista) ? lista.slice(0, cantidad) : [];
  } catch {
    return [];
  }
}

/** Anota un movimiento (el más nuevo primero). Si falla, no frena la acción. */
export async function anotarRegistroConstruccion(env: EnvPanel, evento: Omit<EventoRegistro, "fecha">): Promise<void> {
  try {
    if (!env.REVIEWS_KV) return;
    const lista = await leerRegistroConstruccion(env);
    lista.unshift({ ...evento, por: evento.por.slice(0, 64), fecha: new Date().toISOString() });
    await env.REVIEWS_KV.put(K_REGISTRO, JSON.stringify(lista.slice(0, MAXIMO_REGISTRO)));
  } catch (e) {
    console.error("[construccion] no se pudo anotar en el registro", e);
  }
}

// ───────────── clave de cada invitada ─────────────

/** Mensaje de error si la clave no sirve; null si sirve. */
export function problemaClaveConstruccion(clave: unknown): string | null {
  if (typeof clave !== "string" || clave.trim().length < LARGO_MINIMO_CLAVE_CONSTRUCCION) {
    return `La clave debe tener al menos ${LARGO_MINIMO_CLAVE_CONSTRUCCION} caracteres.`;
  }
  if (clave.trim().length > LARGO_MAXIMO_CLAVE_CONSTRUCCION) return "La clave es demasiado larga.";
  return null;
}

async function leerClave(env: EnvPanel, usuario: string): Promise<ClaveGuardada | null> {
  const crudo = await env.REVIEWS_KV?.get(K_CLAVE(usuario));
  if (!crudo) return null;
  try {
    const g = JSON.parse(crudo) as ClaveGuardada;
    return typeof g?.sal === "string" && typeof g?.huella === "string" ? g : null;
  } catch {
    return null;
  }
}

export async function tieneClaveConstruccion(env: EnvPanel, usuario: string): Promise<boolean> {
  return (await leerClave(env, usuario)) !== null;
}

/** Desde cuándo y por quién tiene permiso; null si no lo tiene. */
export async function permisoTiendaDe(env: EnvPanel, usuario: string): Promise<PermisoTienda | null> {
  const g = await leerClave(env, usuario);
  return g ? { desde: g.creada, ...(g.codigoDe ? { dadoPor: g.codigoDe } : {}) } : null;
}

async function guardarClave(env: EnvPanel, usuario: string, clave: string, codigo: CodigoPendiente): Promise<void> {
  if (!env.REVIEWS_KV) throw new Error("Sin KV");
  const sal = hex(crypto.getRandomValues(new Uint8Array(16)));
  const g: ClaveGuardada = {
    sal,
    huella: await huellaClave(env, clave.trim(), sal),
    creada: new Date().toISOString(),
    codigoDe: codigo.por,
    codigoCreado: codigo.creado,
  };
  await env.REVIEWS_KV.put(K_CLAVE(usuario), JSON.stringify(g));
}

export async function claveConstruccionCorrecta(env: EnvPanel, usuario: string, clave: unknown): Promise<boolean> {
  if (typeof clave !== "string") return false;
  const limpia = clave.trim();
  if (!limpia || limpia.length > LARGO_MAXIMO_CLAVE_CONSTRUCCION) return false;
  const g = await leerClave(env, usuario);
  if (!g) return false;
  return compararSeguro(await huellaClave(env, limpia, g.sal), g.huella);
}

/** El dueño le quita el permiso (se borra su clave). También al quitarle el acceso al panel. */
export async function quitarClaveConstruccion(env: EnvPanel, usuario: string, por: string): Promise<boolean> {
  if (!(await tieneClaveConstruccion(env, usuario))) return false;
  await env.REVIEWS_KV?.delete(K_CLAVE(usuario));
  await anotarRegistroConstruccion(env, { tipo: "permiso-quitado", por, para: usuario });
  return true;
}

// ───────────── códigos de un solo uso ─────────────

/** El dueño crea un código. Devuelve el código en claro: se muestra una sola vez. */
export async function crearCodigoConstruccion(env: EnvPanel, por: string, horas: number): Promise<{ codigo: string; vence: string }> {
  const kv = env.REVIEWS_KV;
  if (!kv) throw new Error("Sin KV");
  const azar = crypto.getRandomValues(new Uint8Array(LARGO_CODIGO));
  const codigo = [...azar].map((b) => ALFABETO[b % ALFABETO.length]).join("");
  const resumen = await resumenCodigo(env, codigo);
  const ahora = Date.now();
  const datos: CodigoPendiente = {
    id: resumen.slice(0, 16),
    creado: new Date(ahora).toISOString(),
    vence: new Date(ahora + horas * 3600_000).toISOString(),
    por,
  };
  await kv.put(P_CODIGO + resumen, JSON.stringify(datos), { expirationTtl: Math.max(60, horas * 3600) });
  await anotarRegistroConstruccion(env, { tipo: "codigo-creado", por, vence: datos.vence });
  return { codigo: codigoLegible(codigo), vence: datos.vence };
}

export async function listarCodigosConstruccion(env: EnvPanel): Promise<CodigoPendiente[]> {
  const kv = env.REVIEWS_KV;
  if (!kv) return [];
  const { keys } = await kv.list({ prefix: P_CODIGO, limit: 100 });
  const lista: CodigoPendiente[] = [];
  for (const { name } of keys) {
    const crudo = await kv.get(name);
    if (!crudo) continue;
    try {
      const d = JSON.parse(crudo) as CodigoPendiente;
      if (Date.parse(d.vence) > Date.now()) lista.push(d);
    } catch {
      /* ilegible: se ignora */
    }
  }
  return lista.sort((a, b) => a.creado.localeCompare(b.creado));
}

export async function anularCodigoConstruccion(env: EnvPanel, id: string, por: string): Promise<boolean> {
  const kv = env.REVIEWS_KV;
  if (!kv || !/^[0-9a-f]{16}$/.test(id)) return false;
  const { keys } = await kv.list({ prefix: P_CODIGO + id, limit: 10 });
  if (!keys.length) return false;
  let creado: string | undefined;
  for (const { name } of keys) {
    try {
      creado ??= (JSON.parse((await kv.get(name)) || "{}") as CodigoPendiente).creado;
    } catch {
      /* da igual */
    }
    await kv.delete(name);
  }
  await anotarRegistroConstruccion(env, { tipo: "codigo-anulado", por, ...(creado ? { codigoCreado: creado } : {}) });
  return true;
}

/**
 * La invitada usa el código: si es válido y vigente, se borra (un solo uso)
 * y queda guardada su clave nueva.
 */
export async function activarConCodigo(
  env: EnvPanel,
  usuario: string,
  codigo: unknown,
  claveNueva: unknown
): Promise<{ ok: true } | { ok: false; motivo: string; codigoMalo?: boolean }> {
  const problema = problemaClaveConstruccion(claveNueva);
  if (problema) return { ok: false, motivo: problema };
  const limpio = normalizarCodigo(codigo);
  const MALO = { ok: false as const, motivo: "El código no es correcto, ya se usó o venció. Pide uno nuevo al dueño del panel.", codigoMalo: true };
  if (limpio.length !== LARGO_CODIGO || ![...limpio].every((c) => ALFABETO.includes(c))) return MALO;
  const kv = env.REVIEWS_KV;
  if (!kv) return { ok: false, motivo: "El almacén del sitio no está disponible." };
  const llave = P_CODIGO + (await resumenCodigo(env, limpio));
  const crudo = await kv.get(llave);
  if (!crudo) return MALO;
  let datos: CodigoPendiente;
  try {
    datos = JSON.parse(crudo) as CodigoPendiente;
    if (Date.parse(datos.vence) <= Date.now()) return MALO;
  } catch {
    return MALO;
  }
  await kv.delete(llave);
  await guardarClave(env, usuario, String(claveNueva), datos);
  await anotarRegistroConstruccion(env, { tipo: "permiso-dado", por: datos.por, para: usuario, codigoCreado: datos.creado });
  return { ok: true };
}
