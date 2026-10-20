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
/** El dueño (el que instaló el panel). Misma clave de siempre: compatible. */
const K_USUARIO = "admin:usuario";
/** Usuarios invitados, por nombre en minúsculas. */
const P_INVITADO = "admin:usuarios:";
const K_INVITADO = (nombre: string) => `${P_INVITADO}${nombre.toLowerCase()}`;
/** Invitaciones pendientes, por el resumen SHA-256 del enlace (el enlace no se guarda). */
const P_INVITACION = "admin:invitacion:";
const K_INVITACION = (resumen: string) => `${P_INVITACION}${resumen}`;
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
  /** true = entró por invitación. El dueño no lo lleva. */
  invitado?: boolean;
  /** Quién lo invitó. */
  invitadoPor?: string;
  /** El dueño le permite anular y borrar pedidos (v0.31). El dueño siempre puede. */
  puedeAnularPedidos?: boolean;
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

export async function duracionSesion(env: EnvPanel, usuario?: string): Promise<number> {
  const minutos = (await obtenerUsuario(env, usuario))?.inactividadMinutos;
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

async function leerRegistro(env: EnvPanel, clave: string): Promise<UsuarioAdmin | null> {
  const crudo = await env.REVIEWS_KV?.get(clave);
  if (!crudo) return null;
  try {
    return JSON.parse(crudo) as UsuarioAdmin;
  } catch {
    return null;
  }
}

/**
 * Sin nombre: el dueño (compatibilidad con los sitios de un solo usuario).
 * Con nombre: ese usuario exacto, sea el dueño o un invitado.
 */
export async function obtenerUsuario(env: EnvPanel, usuario?: string): Promise<UsuarioAdmin | null> {
  const dueno = await leerRegistro(env, K_USUARIO);
  if (usuario === undefined) return dueno;
  if (dueno && dueno.usuario === usuario) return dueno;
  if (!/^[a-zA-Z0-9._-]{3,40}$/.test(usuario)) return null;
  const invitado = await leerRegistro(env, K_INVITADO(usuario));
  return invitado && invitado.usuario === usuario ? invitado : null;
}

export const esDueno = (registro: UsuarioAdmin | null | undefined) => Boolean(registro && !registro.invitado);

/** Anular y borrar pedidos: el dueño, o un invitado al que el dueño se lo permitió. */
export const puedeAnularPedidos = (registro: UsuarioAdmin | null | undefined) =>
  Boolean(registro && (esDueno(registro) || registro.puedeAnularPedidos === true));

/** El dueño da o quita a un invitado el permiso de anular y borrar pedidos. */
export async function cambiarPermisoPedidos(env: EnvPanel, usuario: string, valor: boolean): Promise<{ ok: boolean; motivo?: string }> {
  const registro = await obtenerUsuario(env, usuario);
  if (!registro) return { ok: false, motivo: "Ese usuario no existe." };
  if (esDueno(registro)) return { ok: false, motivo: "El dueño del panel siempre puede anular pedidos." };
  registro.puedeAnularPedidos = valor;
  return (await guardarUsuario(env, registro)) ? { ok: true } : { ok: false, motivo: "No se pudo guardar. Intenta de nuevo." };
}

/**
 * El dueño le quita el doble factor a un invitado que perdió el celular y los
 * códigos de respaldo. Le cierra las sesiones; al volver a entrar solo pide
 * contraseña y puede activarlo de nuevo. Al dueño no se le puede restablecer
 * desde aquí (no hay nadie por encima).
 */
export async function restablecerDobleFactor(env: EnvPanel, usuario: string): Promise<{ ok: boolean; motivo?: string }> {
  const registro = await obtenerUsuario(env, usuario);
  if (!registro) return { ok: false, motivo: "Ese usuario no existe." };
  if (esDueno(registro)) return { ok: false, motivo: "El doble factor del dueño no se restablece desde aquí." };
  if (!registro.dosFactores && !registro.propuesta) return { ok: false, motivo: "Ese usuario no tiene doble factor activado." };
  delete registro.dosFactores;
  delete registro.propuesta;
  if (!(await guardarUsuario(env, registro))) return { ok: false, motivo: "No se pudo guardar. Intenta de nuevo." };
  await cerrarSesionesDe(env, usuario);
  return { ok: true };
}

export async function hayUsuario(env: EnvPanel): Promise<boolean> {
  return (await obtenerUsuario(env)) !== null;
}

/** ¿Ya hay alguien con ese nombre (sin distinguir mayúsculas)? */
export async function nombreOcupado(env: EnvPanel, usuario: string): Promise<boolean> {
  const dueno = await leerRegistro(env, K_USUARIO);
  if (dueno && dueno.usuario.toLowerCase() === usuario.toLowerCase()) return true;
  return (await env.REVIEWS_KV?.get(K_INVITADO(usuario))) != null;
}

export interface FichaUsuario {
  usuario: string;
  creado: string;
  dueno: boolean;
  dobleFactor: boolean;
  invitadoPor?: string;
  /** Puede anular y borrar pedidos (el dueño siempre). */
  puedeAnularPedidos: boolean;
}

/** Todos los usuarios del panel, el dueño primero. Sin datos secretos. */
export async function listarUsuarios(env: EnvPanel): Promise<FichaUsuario[]> {
  const ficha = (r: UsuarioAdmin): FichaUsuario => ({
    usuario: r.usuario,
    creado: r.creado,
    dueno: esDueno(r),
    dobleFactor: Boolean(r.dosFactores),
    ...(r.invitadoPor ? { invitadoPor: r.invitadoPor } : {}),
    puedeAnularPedidos: puedeAnularPedidos(r),
  });
  const lista: FichaUsuario[] = [];
  const dueno = await leerRegistro(env, K_USUARIO);
  if (dueno) lista.push(ficha(dueno));
  const kv = env.REVIEWS_KV;
  if (!kv) return lista;
  const { keys } = await kv.list({ prefix: P_INVITADO, limit: 100 });
  const invitados: UsuarioAdmin[] = [];
  for (const { name } of keys) {
    const r = await leerRegistro(env, name);
    if (r) invitados.push(r);
  }
  invitados.sort((a, b) => a.creado.localeCompare(b.creado));
  return lista.concat(invitados.map(ficha));
}

/** Quita a un invitado y le cierra las sesiones. Al dueño no se le puede quitar. */
export async function quitarUsuario(env: EnvPanel, usuario: string): Promise<{ ok: boolean; motivo?: string }> {
  const kv = env.REVIEWS_KV;
  if (!kv) return { ok: false, motivo: "Falta la base de datos." };
  const registro = await obtenerUsuario(env, usuario);
  if (!registro) return { ok: false, motivo: "Ese usuario no existe." };
  if (esDueno(registro)) return { ok: false, motivo: "Al dueño del panel no se le puede quitar el acceso." };
  await kv.delete(K_INVITADO(usuario));
  await cerrarSesionesDe(env, usuario);
  return { ok: true };
}

/** Cierra todas las sesiones de un usuario (menos `salvo`, si se indica). */
async function cerrarSesionesDe(env: EnvPanel, usuario: string, salvo?: string | null): Promise<number> {
  const kv = env.REVIEWS_KV;
  if (!kv) return 0;
  const { keys } = await kv.list({ prefix: "admin:sesion:", limit: 1000 });
  let cerradas = 0;
  for (const { name } of keys) {
    if (salvo && name === K_SESION(salvo)) continue;
    const crudo = await kv.get(name);
    let dueno = "";
    try {
      dueno = crudo ? String((JSON.parse(crudo) as Sesion).usuario) : "";
    } catch {
      dueno = "";
    }
    if (dueno !== usuario) continue;
    await kv.delete(name);
    cerradas++;
  }
  return cerradas;
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
    const clave = registro.invitado ? K_INVITADO(registro.usuario) : K_USUARIO;
    await env.REVIEWS_KV?.put(clave, JSON.stringify(registro));
    return Boolean(env.REVIEWS_KV);
  } catch {
    return false;
  }
}

/** ¿Es esta la contraseña de este usuario? (el nombre sale de la sesión). */
export async function claveCorrecta(env: EnvPanel, derivado: string, usuario?: string): Promise<boolean> {
  const p = pepper(env);
  if (!p) return false;
  const registro = await obtenerUsuario(env, usuario);
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
  derivadoNuevo: string,
  usuario?: string
): Promise<{ ok: boolean; motivo?: string }> {
  const p = pepper(env);
  if (!p) return { ok: false, motivo: "Falta configuración en el servidor." };
  const registro = await obtenerUsuario(env, usuario);
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

/** Cierra las otras sesiones de ESTE usuario (al cambiar su contraseña). Las de los demás siguen. */
export async function cerrarOtrasSesiones(env: EnvPanel, request: Request, usuario: string): Promise<number> {
  return cerrarSesionesDe(env, usuario, getCookie(request, COOKIE_SESION));
}

/**
 * Usuario + contraseña. Si el usuario no existe igual se calcula, para que
 * el tiempo de respuesta no delate qué nombres existen.
 */
export async function credencialesValidas(env: EnvPanel, usuario: string, derivado: string): Promise<boolean> {
  const p = pepper(env);
  if (!p) return false;
  const registro = typeof usuario === "string" ? await obtenerUsuario(env, usuario) : null;
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
  const duracion = await duracionSesion(env, usuario);
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
  const duracion = await duracionSesion(env, sesion.usuario);
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

/** La sesión de esta petición. Si al usuario le quitaron el acceso, ya no vale. */
export async function sesionActual(env: EnvPanel, request: Request): Promise<Sesion | null> {
  const id = idDeCookie(request, COOKIE_SESION);
  const crudo = id ? await env.REVIEWS_KV?.get(K_SESION(id)) : null;
  if (!crudo) return null;
  let sesion: Sesion;
  try {
    sesion = JSON.parse(crudo) as Sesion;
  } catch {
    return null;
  }
  if (typeof sesion?.usuario !== "string" || !(await obtenerUsuario(env, sesion.usuario))) return null;
  return sesion;
}

// ─────────────────────────── invitaciones ───────────────────────────

/** Plazos que puede elegir el dueño para un enlace de invitación, en horas. */
export const OPCIONES_VIGENCIA = [1, 24, 72] as const;
export const vigenciaValida = (horas: unknown): horas is number =>
  typeof horas === "number" && (OPCIONES_VIGENCIA as readonly number[]).includes(horas);

export interface Invitacion {
  /** Primeros caracteres del resumen: sirve para anularla, no para usarla. */
  id: string;
  creada: string;
  vence: string;
  por: string;
}

async function resumenEnlace(token: string): Promise<string> {
  const datos = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return [...new Uint8Array(datos)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export const tokenValido = (valor: unknown): valor is string => typeof valor === "string" && /^[0-9a-f]{64}$/.test(valor);

/**
 * Crea una invitación de un solo uso. Devuelve el token EN CLARO una sola
 * vez; en la base solo queda su resumen, así que ni quien lea la base puede
 * armar el enlace.
 */
export async function crearInvitacion(env: EnvPanel, por: string, horas: number): Promise<string> {
  const kv = env.REVIEWS_KV;
  if (!kv) throw new Error("Falta la base de datos (REVIEWS_KV).");
  const token = idAleatorio();
  const resumen = await resumenEnlace(token);
  const ahora = Date.now();
  const datos: Invitacion = {
    id: resumen.slice(0, 16),
    creada: new Date(ahora).toISOString(),
    vence: new Date(ahora + horas * 3600_000).toISOString(),
    por,
  };
  await kv.put(K_INVITACION(resumen), JSON.stringify(datos), { expirationTtl: Math.max(60, horas * 3600) });
  return token;
}

async function invitacionPorToken(env: EnvPanel, token: string): Promise<{ clave: string; datos: Invitacion } | null> {
  const clave = K_INVITACION(await resumenEnlace(token));
  const crudo = await env.REVIEWS_KV?.get(clave);
  if (!crudo) return null;
  try {
    const datos = JSON.parse(crudo) as Invitacion;
    if (Date.parse(datos.vence) <= Date.now()) return null;
    return { clave, datos };
  } catch {
    return null;
  }
}

export async function invitacionVigente(env: EnvPanel, token: string): Promise<boolean> {
  return (await invitacionPorToken(env, token)) !== null;
}

export async function listarInvitaciones(env: EnvPanel): Promise<Invitacion[]> {
  const kv = env.REVIEWS_KV;
  if (!kv) return [];
  const { keys } = await kv.list({ prefix: P_INVITACION, limit: 100 });
  const lista: Invitacion[] = [];
  for (const { name } of keys) {
    const crudo = await kv.get(name);
    try {
      const d = crudo ? (JSON.parse(crudo) as Invitacion) : null;
      if (d && Date.parse(d.vence) > Date.now()) lista.push(d);
    } catch {
      /* se ignora */
    }
  }
  return lista.sort((a, b) => a.creada.localeCompare(b.creada));
}

export async function anularInvitacion(env: EnvPanel, id: string): Promise<boolean> {
  const kv = env.REVIEWS_KV;
  if (!kv || !/^[0-9a-f]{16}$/.test(id)) return false;
  const { keys } = await kv.list({ prefix: K_INVITACION(id), limit: 2 });
  if (keys.length !== 1) return false;
  await kv.delete(keys[0].name);
  return true;
}

/**
 * Usa la invitación: crea el usuario y quema el enlace. Se borra ANTES de
 * crear el usuario, para que dos intentos casi simultáneos no creen dos.
 */
export async function aceptarInvitacion(
  env: EnvPanel,
  token: string,
  usuario: string,
  derivado: string
): Promise<{ ok: boolean; motivo?: string; status?: number }> {
  const kv = env.REVIEWS_KV;
  const p = pepper(env);
  if (!kv || !p) return { ok: false, motivo: "Falta configuración en el servidor.", status: 503 };
  const inv = await invitacionPorToken(env, token);
  if (!inv) return { ok: false, motivo: "Este enlace ya se usó o venció. Pide uno nuevo.", status: 410 };
  if (await nombreOcupado(env, usuario)) return { ok: false, motivo: "Ese nombre de usuario ya existe. Elige otro.", status: 409 };
  await kv.delete(inv.clave);
  const registro: UsuarioAdmin = {
    usuario,
    guardado: await sellar(derivado, p),
    creado: new Date().toISOString(),
    invitado: true,
    invitadoPor: inv.datos.por,
  };
  await kv.put(K_INVITADO(usuario), JSON.stringify(registro));
  return { ok: true };
}
