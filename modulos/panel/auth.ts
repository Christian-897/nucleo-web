/**
 * ACCESO AL PANEL. Trasladado desde Muebles Crea, donde ya está probado.
 *
 * POR QUÉ EL CÁLCULO PESADO LO HACE EL NAVEGADOR
 *
 * Guardar bien una contraseña exige una función deliberadamente lenta
 * (OWASP: 600.000 repeticiones de PBKDF2-SHA256, ~90 ms de CPU). El plan
 * gratuito de Cloudflare corta a los 10 ms por petición. Entonces:
 *
 *   NAVEGADOR   derivado = PBKDF2(contraseña, sal:usuario, 600.000)
 *   SERVIDOR    guardado = HMAC-SHA256(ADMIN_PEPPER, derivado)
 *
 * No debilita nada: adivinar la contraseña desde lo guardado sigue
 * costando las 600.000 repeticiones por intento, y sin ADMIN_PEPPER (que
 * vive en Cloudflare, no en la base de datos) ni siquiera se puede
 * empezar. Robar la base de datos no permite entrar.
 *
 * COMPATIBILIDAD: las claves de KV, las cookies y el sellado son los
 * mismos de Muebles Crea, para que ese sitio pueda usar este módulo sin
 * reinstalar el panel.
 */
import { compararSeguro, hmacSha256Hex } from "../../core/cripto";
import { getCookie } from "../../core/seguridad";
import { limpiarVariable } from "../../core/correo";
import type { EnvPanel } from "./config";

/** Repeticiones que aplica el NAVEGADOR. Se le sirve desde /parametros. */
export const REPETICIONES = 600_000;

/** Plazo de fábrica por inactividad (30 min). El dueño elige 15, 30 o 60. */
export const DURACION_SESION = 30 * 60;
export const OPCIONES_INACTIVIDAD = [15, 30, 60] as const;

/** Como mucho una escritura cada 5 min por sesión (el plan gratis da 1.000/día). */
const MARGEN_RENOVACION = 5 * 60;

export const COOKIE_SESION = "mc_sesion";
export const COOKIE_PASO2 = "mc_paso2";
const K_USUARIO = "admin:usuario";
const K_SAL = "admin:sal-publica";
const K_SESION = (id: string) => `admin:sesion:${id}`;
const K_PASO2 = (id: string) => `admin:paso2:${id}`;
/** Cinco minutos para escribir el código del doble factor. */
export const DURACION_PASO2 = 5 * 60;

export interface DosFactores {
  /** Secreto TOTP cifrado con AES-GCM (ver totp.ts). */
  secreto: string;
  /** Último período aceptado: un código no sirve dos veces. */
  ultimoPeriodo: number;
  /** Resúmenes de los códigos de respaldo sin usar. */
  respaldos: string[];
  activado: string;
}

export interface UsuarioAdmin {
  usuario: string;
  /** HMAC-SHA256(ADMIN_PEPPER, derivado), hex. */
  guardado: string;
  creado: string;
  dosFactores?: DosFactores;
  /** Secreto propuesto mientras se configura el doble factor. */
  propuesta?: { secreto: string; creada: string };
  inactividadMinutos?: number;
}

export interface Sesion {
  usuario: string;
  creada: string;
  renovada: string;
}

const pepper = (env: EnvPanel) => limpiarVariable(env.ADMIN_PEPPER);

function idAleatorio(): string {
  return [...crypto.getRandomValues(new Uint8Array(32))]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function inactividadValida(valor: unknown): valor is number {
  return typeof valor === "number" && (OPCIONES_INACTIVIDAD as readonly number[]).includes(valor);
}

export async function duracionSesion(env: EnvPanel): Promise<number> {
  const minutos = (await obtenerUsuario(env))?.inactividadMinutos;
  return inactividadValida(minutos) ? minutos * 60 : DURACION_SESION;
}

/** El `derivado` son exactamente 64 hex (256 bits). Otra cosa = cliente manipulado. */
export function derivadoValido(valor: unknown): valor is string {
  return typeof valor === "string" && /^[0-9a-f]{64}$/.test(valor);
}

const sellar = (derivado: string, clave: string) => hmacSha256Hex(clave, derivado);

/** Sal pública del sitio, igual para cualquier usuario (no revela cuáles existen). */
export async function obtenerSalPublica(env: EnvPanel): Promise<string> {
  const kv = env.REVIEWS_KV;
  if (!kv) throw new Error("Falta la base de datos (REVIEWS_KV).");
  const guardada = await kv.get(K_SAL);
  if (guardada) return guardada;
  const nueva = idAleatorio();
  await kv.put(K_SAL, nueva);
  return nueva;
}

export async function obtenerUsuario(env: EnvPanel): Promise<UsuarioAdmin | null> {
  const crudo = await env.REVIEWS_KV?.get(K_USUARIO);
  if (!crudo) return null;
  try {
    return JSON.parse(crudo) as UsuarioAdmin;
  } catch {
    return null;
  }
}

export async function hayUsuario(env: EnvPanel): Promise<boolean> {
  return (await obtenerUsuario(env)) !== null;
}

/** Crea el único administrador. Nunca sobrescribe uno existente. */
export async function crearUsuario(env: EnvPanel, usuario: string, derivado: string): Promise<boolean> {
  const kv = env.REVIEWS_KV;
  const p = pepper(env);
  if (!kv || !p) return false;
  if (await hayUsuario(env)) return false;
  const registro: UsuarioAdmin = {
    usuario,
    guardado: await sellar(derivado, p),
    creado: new Date().toISOString(),
  };
  await kv.put(K_USUARIO, JSON.stringify(registro));
  return true;
}

export async function guardarUsuario(env: EnvPanel, registro: UsuarioAdmin): Promise<boolean> {
  try {
    await env.REVIEWS_KV?.put(K_USUARIO, JSON.stringify(registro));
    return Boolean(env.REVIEWS_KV);
  } catch {
    return false;
  }
}

/** ¿Es esta la contraseña del dueño? (sin mirar el nombre: ya hay sesión). */
export async function claveCorrecta(env: EnvPanel, derivado: string): Promise<boolean> {
  const p = pepper(env);
  if (!p) return false;
  const registro = await obtenerUsuario(env);
  const calculado = await sellar(derivado, p);
  if (!registro) {
    compararSeguro(calculado, "0".repeat(64));
    return false;
  }
  return compararSeguro(calculado, registro.guardado);
}

/** Cambia la contraseña. Pide la actual: si no, una sesión abierta ajena se adueña del panel. */
export async function cambiarClave(
  env: EnvPanel,
  derivadoActual: string,
  derivadoNuevo: string
): Promise<{ ok: boolean; motivo?: string }> {
  const p = pepper(env);
  if (!p) return { ok: false, motivo: "Falta configuración en el servidor." };
  const registro = await obtenerUsuario(env);
  if (!registro) return { ok: false, motivo: "No hay usuario configurado." };
  if (!compararSeguro(await sellar(derivadoActual, p), registro.guardado)) {
    return { ok: false, motivo: "La contraseña actual no es correcta." };
  }
  const nuevo = await sellar(derivadoNuevo, p);
  if (compararSeguro(nuevo, registro.guardado)) {
    return { ok: false, motivo: "La contraseña nueva es igual a la actual." };
  }
  registro.guardado = nuevo;
  if (!(await guardarUsuario(env, registro))) {
    return { ok: false, motivo: "No se pudo guardar. Intenta de nuevo." };
  }
  return { ok: true };
}

/** Cierra todas las sesiones menos esta (al cambiar la contraseña). */
export async function cerrarOtrasSesiones(env: EnvPanel, request: Request): Promise<number> {
  const kv = env.REVIEWS_KV;
  if (!kv) return 0;
  const actual = getCookie(request, COOKIE_SESION);
  const { keys } = await kv.list({ prefix: "admin:sesion:", limit: 1000 });
  let cerradas = 0;
  for (const { name } of keys) {
    if (actual && name === K_SESION(actual)) continue;
    await kv.delete(name);
    cerradas++;
  }
  return cerradas;
}

/**
 * Usuario + contraseña. Si el usuario no existe igual se calcula, para que
 * el tiempo de respuesta no delate qué nombres existen.
 */
export async function credencialesValidas(env: EnvPanel, usuario: string, derivado: string): Promise<boolean> {
  const p = pepper(env);
  if (!p) return false;
  const registro = await obtenerUsuario(env);
  const calculado = await sellar(derivado, p);
  if (!registro) {
    compararSeguro(calculado, "0".repeat(64));
    return false;
  }
  const nombreOk = compararSeguro(usuario, registro.usuario);
  const claveOk = compararSeguro(calculado, registro.guardado);
  return nombreOk && claveOk;
}

function cookie(nombre: string, valor: string, segundos: number): string {
  // HttpOnly: un script inyectado no la lee. Secure: solo HTTPS.
  // SameSite=Strict: no viaja desde otros sitios (CSRF).
  return [`${nombre}=${valor}`, "HttpOnly", "Secure", "SameSite=Strict", "Path=/", `Max-Age=${segundos}`].join("; ");
}

function idDeCookie(request: Request, nombre: string): string | null {
  const id = getCookie(request, nombre);
  return id && /^[0-9a-f]{64}$/.test(id) ? id : null;
}

/** Abre sesión: la cookie lleva solo un id al azar; los datos viven en KV (se puede cerrar de verdad). */
export async function abrirSesion(env: EnvPanel, usuario: string): Promise<string> {
  const kv = env.REVIEWS_KV;
  if (!kv) throw new Error("Falta la base de datos (REVIEWS_KV).");
  const id = idAleatorio();
  const ahora = new Date().toISOString();
  const duracion = await duracionSesion(env);
  await kv.put(K_SESION(id), JSON.stringify({ usuario, creada: ahora, renovada: ahora } satisfies Sesion), {
    expirationTtl: duracion,
  });
  return cookie(COOKIE_SESION, id, duracion);
}

async function reescribirSesion(env: EnvPanel, request: Request, respetarMargen: boolean): Promise<string | null> {
  const kv = env.REVIEWS_KV;
  const id = idDeCookie(request, COOKIE_SESION);
  if (!kv || !id) return null;
  const crudo = await kv.get(K_SESION(id));
  if (!crudo) return null;
  const sesion = JSON.parse(crudo) as Sesion;
  const ahora = Date.now();
  if (respetarMargen && ahora - new Date(sesion.renovada).getTime() < MARGEN_RENOVACION * 1000) return null;
  sesion.renovada = new Date(ahora).toISOString();
  const duracion = await duracionSesion(env);
  await kv.put(K_SESION(id), JSON.stringify(sesion), { expirationTtl: duracion });
  return cookie(COOKIE_SESION, id, duracion);
}

/** Reinicia el plazo porque hubo actividad REAL (la pantalla lo avisa). */
export const renovarSesion = (env: EnvPanel, request: Request) => reescribirSesion(env, request, true);
/** Reescribe la sesión con el plazo nuevo, recién cambiado en Seguridad. */
export const reajustarSesion = (env: EnvPanel, request: Request) => reescribirSesion(env, request, false);

/** Sesión a medias entre contraseña y código: cookie aparte, corta, que no da acceso a nada. */
export async function abrirPaso2(env: EnvPanel, usuario: string): Promise<string> {
  const kv = env.REVIEWS_KV;
  if (!kv) throw new Error("Falta la base de datos (REVIEWS_KV).");
  const id = idAleatorio();
  await kv.put(K_PASO2(id), JSON.stringify({ usuario, creada: new Date().toISOString() }), {
    expirationTtl: DURACION_PASO2,
  });
  return cookie(COOKIE_PASO2, id, DURACION_PASO2);
}

export async function usuarioDelPaso2(env: EnvPanel, request: Request): Promise<string | null> {
  const id = idDeCookie(request, COOKIE_PASO2);
  const crudo = id ? await env.REVIEWS_KV?.get(K_PASO2(id)) : null;
  if (!crudo) return null;
  try {
    const datos = JSON.parse(crudo) as { usuario?: unknown };
    return typeof datos.usuario === "string" ? datos.usuario : null;
  } catch {
    return null;
  }
}

/** Se usa una sola vez y se quema. */
export async function cerrarPaso2(env: EnvPanel, request: Request): Promise<string> {
  const id = idDeCookie(request, COOKIE_PASO2);
  if (id) await env.REVIEWS_KV?.delete(K_PASO2(id));
  return cookie(COOKIE_PASO2, "", 0);
}

export async function cerrarSesion(env: EnvPanel, request: Request): Promise<string> {
  const id = idDeCookie(request, COOKIE_SESION);
  if (id) await env.REVIEWS_KV?.delete(K_SESION(id));
  return cookie(COOKIE_SESION, "", 0);
}

export async function sesionActual(env: EnvPanel, request: Request): Promise<Sesion | null> {
  const id = idDeCookie(request, COOKIE_SESION);
  const crudo = id ? await env.REVIEWS_KV?.get(K_SESION(id)) : null;
  if (!crudo) return null;
  try {
    return JSON.parse(crudo) as Sesion;
  } catch {
    return null;
  }
}
