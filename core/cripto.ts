/**
 * Criptografía compartida (Web Crypto: funciona en Cloudflare Workers y en
 * Node 18+ sin dependencias).
 */

const enc = new TextEncoder();

function aHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** HMAC-SHA256 de `mensaje` con `secreto`, en hexadecimal minúscula. */
export async function hmacSha256Hex(secreto: string, mensaje: string): Promise<string> {
  const clave = await crypto.subtle.importKey(
    "raw",
    enc.encode(secreto),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  return aHex(await crypto.subtle.sign("HMAC", clave, enc.encode(mensaje)));
}

/**
 * Compara dos strings en tiempo constante. Para firmas: una comparación
 * normal (`===`) corta en el primer carácter distinto, y midiendo tiempos
 * un atacante podría adivinar la firma de a poco.
 */
export function compararSeguro(a: string, b: string): boolean {
  if (typeof a !== "string" || typeof b !== "string") return false;
  if (a.length !== b.length) return false;
  let diferencia = 0;
  for (let i = 0; i < a.length; i++) {
    diferencia |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diferencia === 0;
}

/** Identificador aleatorio e impredecible (no usar Date.now para órdenes). */
export function generarId(prefijo = ""): string {
  return prefijo + crypto.randomUUID().replace(/-/g, "");
}
