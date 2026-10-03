/**
 * CÓDIGOS DE SEIS DÍGITOS (TOTP, RFC 6238).
 *
 * Cómo funciona, en una línea: el teléfono y el servidor comparten un
 * secreto, cada uno mira la hora, y de la combinación de secreto + hora
 * sale un número de seis dígitos. No viaja nada entre ellos; por eso
 * funciona sin señal y sin depender de ningún proveedor.
 *
 * ───────────────────────────────────────────────────────────────────
 * TRES DETALLES QUE DECIDEN SI ESTO SIRVE DE ALGO
 *
 * 1. VENTANA DE TOLERANCIA. Se acepta el código del período actual y
 *    uno hacia cada lado. El reloj de un teléfono se desfasa, y sin
 *    margen la gente ve "código incorrecto" con el código correcto a la
 *    vista. Un período son 30 segundos, así que el margen real es de
 *    medio minuto: suficiente para el desfase normal y demasiado poco
 *    para que sirva de nada a quien intente adivinar.
 *
 * 2. UN CÓDIGO NO SE USA DOS VECES. Se guarda el período del último
 *    código aceptado y no se admite ese ni ninguno anterior. Sin esto,
 *    quien alcance a ver el código en la pantalla del cliente puede
 *    usarlo durante el resto de su medio minuto de vida.
 *
 * 3. EL SECRETO SE GUARDA CIFRADO. A diferencia de una contraseña, el
 *    secreto tiene que poder recuperarse para comprobar el código, así
 *    que no se puede guardar resumido. Se cifra con una clave derivada
 *    de ADMIN_PEPPER, que vive en las variables de Cloudflare y no en la
 *    base de datos. Así, quien logre leer la base de datos se lleva un
 *    bloque inútil en vez de la capacidad de generar códigos.
 * ───────────────────────────────────────────────────────────────────
 */

import { aBase32, desdeBase32 } from "./base32";

export const DIGITOS = 6;
export const PERIODO = 30;
/** Períodos aceptados hacia atrás y hacia adelante. */
export const TOLERANCIA = 1;

/** Bytes del secreto. 20 es lo que recomienda el RFC para SHA-1. */
const BYTES_SECRETO = 20;

export function nuevoSecreto(): string {
  return aBase32(crypto.getRandomValues(new Uint8Array(BYTES_SECRETO)));
}

/**
 * Calcula el código de un período.
 *
 * El algoritmo es el del RFC: se firma el número de período con el
 * secreto (HMAC-SHA1), se toma un trozo de cuatro bytes desde una
 * posición que indica el último byte de la firma, y se le saca el resto
 * de dividir por un millón.
 *
 * SHA-1 está aquí porque es lo que exige el estándar y lo que esperan
 * todas las aplicaciones de autenticación. No es un problema: lo que
 * está roto de SHA-1 son las colisiones, que no tienen nada que ver con
 * este uso.
 */
export async function codigoPara(secretoBase32: string, periodo: number): Promise<string | null> {
  const secreto = desdeBase32(secretoBase32);
  if (!secreto || secreto.length === 0) return null;

  const mensaje = new Uint8Array(8);
  let resto = periodo;
  for (let i = 7; i >= 0; i--) {
    mensaje[i] = resto & 255;
    resto = Math.floor(resto / 256);
  }

  // El `slice()` copia los bytes a un búfer propio. Sin eso, el tipo que
  // devuelve desdeBase32 no calza con lo que espera WebCrypto, porque
  // puede apuntar a una porción de un búfer compartido.
  const clave = await crypto.subtle.importKey(
    "raw",
    secreto.slice().buffer,
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"]
  );
  const firma = new Uint8Array(await crypto.subtle.sign("HMAC", clave, mensaje));

  const desde = firma[firma.length - 1] & 0x0f;
  const numero =
    (((firma[desde] & 0x7f) << 24) |
      (firma[desde + 1] << 16) |
      (firma[desde + 2] << 8) |
      firma[desde + 3]) %
    10 ** DIGITOS;

  return String(numero).padStart(DIGITOS, "0");
}

export interface Comprobacion {
  ok: boolean;
  /** Período en que calzó, para guardarlo y no aceptarlo de nuevo. */
  periodo?: number;
  motivo?: "formato" | "usado" | "incorrecto";
}

/**
 * Comprueba un código.
 *
 * `ultimoPeriodo` es el del último código aceptado. Todo período igual o
 * anterior se rechaza aunque el cálculo calce: ver el punto 2 de arriba.
 */
export async function comprobar(
  secretoBase32: string,
  entrante: string,
  ultimoPeriodo = 0,
  ahora = Date.now()
): Promise<Comprobacion> {
  const limpio = String(entrante || "").replace(/\s/g, "");
  if (!/^\d{6}$/.test(limpio)) return { ok: false, motivo: "formato" };

  const periodoActual = Math.floor(ahora / 1000 / PERIODO);

  for (let d = -TOLERANCIA; d <= TOLERANCIA; d++) {
    const periodo = periodoActual + d;
    const esperado = await codigoPara(secretoBase32, periodo);
    if (!esperado) return { ok: false, motivo: "formato" };
    if (igualesEnTiempoConstante(esperado, limpio)) {
      if (periodo <= ultimoPeriodo) return { ok: false, motivo: "usado" };
      return { ok: true, periodo };
    }
  }
  return { ok: false, motivo: "incorrecto" };
}

/**
 * Compara sin delatar en cuántos caracteres coincide.
 *
 * Una comparación normal se detiene en la primera diferencia, y el
 * tiempo que tarda revela cuánto acertó quien probó. Acá se recorren
 * siempre todos los caracteres.
 */
export function igualesEnTiempoConstante(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diferencia = 0;
  for (let i = 0; i < a.length; i++) diferencia |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diferencia === 0;
}

/**
 * La dirección que lee el código QR.
 *
 * El nombre del sitio y el usuario van dentro para que en la aplicación
 * del teléfono se distinga de otras cuentas. Van codificados: un nombre
 * con espacios o acentos rompería la dirección.
 */
export function direccionOtp(secreto: string, usuario: string, sitio: string): string {
  const etiqueta = encodeURIComponent(`${sitio}:${usuario}`);
  // Se arma a mano y NO con URLSearchParams, que escribe los espacios
  // como "+". Varias aplicaciones de autenticación toman ese signo como
  // parte del nombre y muestran "Muebles+Crea" en la lista de cuentas.
  const parametros = [
    `secret=${encodeURIComponent(secreto)}`,
    `issuer=${encodeURIComponent(sitio)}`,
    "algorithm=SHA1",
    `digits=${DIGITOS}`,
    `period=${PERIODO}`,
  ].join("&");
  return `otpauth://totp/${etiqueta}?${parametros}`;
}

// ─────────────────────────────────────────────────────────────────────
// CIFRADO DEL SECRETO
// ─────────────────────────────────────────────────────────────────────

/**
 * Deriva la clave de cifrado desde ADMIN_PEPPER.
 *
 * La sal es fija y conocida a propósito: no protege contra diccionarios
 * —ADMIN_PEPPER no es una contraseña humana, es un valor largo y al
 * azar— sino que separa esta clave de cualquier otra que salga del
 * mismo pepper.
 */
async function claveDeCifrado(pepper: string): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(pepper),
    "HKDF",
    false,
    ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      // Fija para siempre: es la misma con que Muebles Crea cifró sus
      // secretos. Cambiarla dejaría sin doble factor a los sitios que ya
      // lo tienen activado. No es un secreto; el secreto es el pepper.
      salt: new TextEncoder().encode("muebles-crea:totp:v1"),
      info: new Uint8Array(0),
    },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

/** Cifra el secreto. Devuelve base64 con el vector inicial al principio. */
export async function cifrarSecreto(secreto: string, pepper: string): Promise<string> {
  const clave = await claveDeCifrado(pepper);
  const vector = crypto.getRandomValues(new Uint8Array(12));
  const cifrado = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: vector },
      clave,
      new TextEncoder().encode(secreto)
    )
  );
  const junto = new Uint8Array(vector.length + cifrado.length);
  junto.set(vector, 0);
  junto.set(cifrado, vector.length);
  return btoa(String.fromCharCode(...junto));
}

/** Descifra. Devuelve null si el bloque fue alterado o el pepper cambió. */
export async function descifrarSecreto(
  guardado: string,
  pepper: string
): Promise<string | null> {
  try {
    const junto = Uint8Array.from(atob(guardado), (c) => c.charCodeAt(0));
    if (junto.length < 13) return null;
    const clave = await claveDeCifrado(pepper);
    const abierto = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: junto.slice(0, 12) },
      clave,
      junto.slice(12)
    );
    return new TextDecoder().decode(abierto);
  } catch {
    // AES-GCM avisa si el contenido fue modificado: llegar acá significa
    // que el bloque está alterado o que ADMIN_PEPPER ya no es el mismo.
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────
// CÓDIGOS DE RESPALDO
// ─────────────────────────────────────────────────────────────────────

export const CANTIDAD_RESPALDOS = 8;

/**
 * Ocho códigos de un solo uso.
 *
 * Sin esto, perder el teléfono deja el panel cerrado para siempre y la
 * única salida es borrar un registro en Cloudflare a mano. Se muestran
 * una única vez, al activar, y se guardan resumidos: el servidor no
 * puede volver a mostrarlos, igual que con una contraseña.
 *
 * El alfabeto evita los caracteres que se confunden al copiarlos a mano
 * desde una hoja de papel, que es donde deberían terminar.
 */
const ALFABETO_RESPALDO = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function nuevosRespaldos(): string[] {
  const codigos: string[] = [];
  for (let i = 0; i < CANTIDAD_RESPALDOS; i++) {
    const azar = crypto.getRandomValues(new Uint8Array(10));
    let codigo = "";
    for (const byte of azar) codigo += ALFABETO_RESPALDO[byte % ALFABETO_RESPALDO.length];
    codigos.push(codigo.slice(0, 5) + "-" + codigo.slice(5));
  }
  return codigos;
}

export function normalizarRespaldo(valor: string): string {
  return String(valor || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

/**
 * Resumen de un código de respaldo.
 *
 * Con pepper y con SHA-256 de una sola pasada, no con las 600.000
 * repeticiones de la contraseña. Es deliberado: un código de respaldo
 * tiene cincuenta bits de azar, así que no hay diccionario que probar.
 * Las repeticiones existen para proteger contraseñas que las personas
 * eligen, no valores generados por el servidor.
 */
export async function resumenRespaldo(codigo: string, pepper: string): Promise<string> {
  const datos = new TextEncoder().encode(`${pepper}:respaldo:${normalizarRespaldo(codigo)}`);
  const resumen = new Uint8Array(await crypto.subtle.digest("SHA-256", datos));
  return [...resumen].map((b) => b.toString(16).padStart(2, "0")).join("");
}
