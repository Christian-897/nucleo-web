/**
 * FOTOS QUE SUBE EL PANEL, guardadas en KV (R2 pide tarjeta aunque sea
 * gratis; esta plantilla se instala sin datos de pago). Por eso las fotos
 * se reducen en el navegador antes de subir (ver cliente.ts).
 *
 * Cada foto tiene un nombre único con azar: reemplazar una foto crea otra
 * dirección, y así las direcciones se pueden guardar en caché "para
 * siempre" (immutable) sin que nadie vea la vieja.
 *
 * Solo pasan JPEG, PNG y WebP, comprobados por sus primeros bytes: un SVG
 * (texto con posible código) disfrazado de foto no entra.
 */
import type { EnvPanel } from "./config";
import { MAXIMO_LADO_FOTO } from "./config";
import { medidasDeImagen } from "./medidas-imagen";

const PREFIJO = "foto:";
export const RUTA_MEDIA = "/media/";

export function nuevoIdentificador(prefijo: string): string {
  const limpio = prefijo.replace(/[^a-zA-Z0-9]/g, "-").slice(0, 60);
  const azar = [...crypto.getRandomValues(new Uint8Array(6))].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${limpio}-${azar}`;
}

export function identificadorValido(id: unknown): id is string {
  return typeof id === "string" && /^[a-zA-Z0-9-]{5,80}$/.test(id);
}

/** ¿Es una dirección que generó este módulo? */
export function direccionMediaValida(direccion: unknown): direccion is string {
  return (
    typeof direccion === "string" &&
    direccion.startsWith(RUTA_MEDIA) &&
    identificadorValido(direccion.slice(RUTA_MEDIA.length))
  );
}

export function tipoRealDeImagen(datos: Uint8Array): string | null {
  if (datos.length < 12) return null;
  if (datos[0] === 0xff && datos[1] === 0xd8 && datos[2] === 0xff) return "image/jpeg";
  const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (png.every((b, i) => datos[i] === b)) return "image/png";
  const texto = (i: number, largo: number) => String.fromCharCode(...datos.slice(i, i + largo));
  if (texto(0, 4) === "RIFF" && texto(8, 4) === "WEBP") return "image/webp";
  return null;
}

/** Lee las medidas de la cabecera (sin descomprimir nada). Ilegible = rechazo. */
export function medidasAceptables(datos: Uint8Array, maximoLado = MAXIMO_LADO_FOTO): { ok: boolean; motivo?: string } {
  const m = medidasDeImagen(datos);
  if (!m) return { ok: false, motivo: "No pudimos leer las medidas de esa foto." };
  if (m.ancho < 1 || m.alto < 1) return { ok: false, motivo: "Esa foto no tiene medidas válidas." };
  if (m.ancho > maximoLado || m.alto > maximoLado) {
    return { ok: false, motivo: `La foto llegó en ${m.ancho} × ${m.alto} píxeles y el máximo es ${maximoLado}.` };
  }
  return { ok: true };
}

/** Guarda una foto y devuelve su dirección pública. */
export async function guardarFoto(
  env: EnvPanel,
  prefijo: string,
  datos: ArrayBuffer,
  tipo: string
): Promise<{ ok: boolean; direccion?: string }> {
  const kv = env.REVIEWS_KV;
  if (!kv) return { ok: false };
  const id = nuevoIdentificador(prefijo);
  try {
    await kv.put(PREFIJO + id, datos, { metadata: { tipo } });
  } catch {
    return { ok: false };
  }
  return { ok: true, direccion: RUTA_MEDIA + id };
}

/** Borra una foto por su dirección. Si falla, queda huérfana: no rompe nada. */
export async function borrarFoto(env: EnvPanel, direccion: string): Promise<void> {
  if (!direccionMediaValida(direccion)) return;
  try {
    await env.REVIEWS_KV?.delete(PREFIJO + direccion.slice(RUTA_MEDIA.length));
  } catch {
    /* sin consecuencias visibles */
  }
}

export async function obtenerFoto(env: EnvPanel, id: string): Promise<{ datos: ArrayBuffer; tipo: string } | null> {
  const kv = env.REVIEWS_KV;
  if (!kv || !identificadorValido(id)) return null;
  const r = await kv.getWithMetadata(PREFIJO + id, { type: "arrayBuffer" });
  if (!r.value) return null;
  const meta = r.metadata as { tipo?: string } | null;
  const tipo = meta?.tipo;
  // Solo tipos de imagen conocidos: nunca se sirve otra cosa desde /media.
  return { datos: r.value, tipo: tipo === "image/png" || tipo === "image/webp" ? tipo : "image/jpeg" };
}

/** Respuesta pública de una foto: caché de un año y sin "adivinar" el tipo. */
export async function responderFoto(env: EnvPanel, id: string): Promise<Response> {
  const foto = await obtenerFoto(env, id);
  if (!foto) return new Response("No encontrada", { status: 404, headers: { "Cache-Control": "no-store" } });
  return new Response(foto.datos, {
    status: 200,
    headers: {
      "Content-Type": foto.tipo,
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
    },
  });
}
