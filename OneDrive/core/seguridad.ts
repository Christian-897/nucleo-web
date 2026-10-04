import type { AlmacenKV } from "./tipos";

/**
 * Utilidades de seguridad compartidas por los endpoints de los módulos.
 * Todo lo que toca datos de entrada de usuarios anónimos vive acá para
 * poder auditarlo en un solo lugar.
 */

/** Lee una cookie por nombre desde la cabecera Cookie de la petición. */
export function getCookie(request: Request, name: string): string | null {
  const header = request.headers.get("Cookie") || "";
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return null;
}

/** IP real del visitante inyectada por el proxy de Cloudflare. */
export function getClientIp(request: Request): string {
  return (
    request.headers.get("CF-Connecting-IP") ||
    request.headers.get("X-Forwarded-For")?.split(",")[0]?.trim() ||
    "0.0.0.0"
  );
}

/**
 * Defensa en profundidad contra CSRF "silencioso": comprobamos que la
 * petición venga del propio origen. No reemplaza la protección del
 * navegador con preflight CORS para `Content-Type: application/json`, pero
 * deja explícito el control y cubre clientes no-browser mal configurados.
 */
export function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get("Origin");
  if (!origin) return true; // clientes legítimos (curl, apps) no siempre la envían
  try {
    const originUrl = new URL(origin);
    const requestUrl = new URL(request.url);
    return originUrl.host === requestUrl.host;
  } catch {
    return false;
  }
}

/**
 * Verifica el token de Cloudflare Turnstile contra "siteverify". Debe
 * ejecutarse SIEMPRE en el servidor: el token del cliente nunca es prueba
 * suficiente por sí solo.
 */
export async function verifyTurnstile(
  token: string,
  secretKey: string,
  remoteIp: string
): Promise<{ success: boolean; errorCodes?: string[] }> {
  const body = new URLSearchParams();
  body.set("secret", secretKey);
  body.set("response", token);

  // `remoteip` es OPCIONAL y va desactivado a propósito: en celulares la IP
  // cambia entre resolver el desafío y enviar (antena, wifi a datos, CGNAT)
  // y Cloudflare rechazaría a personas reales. Lo que prueba que hay una
  // persona es el token, que se verifica igual y solo sirve una vez.
  void remoteIp;

  try {
    const res = await fetch(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      { method: "POST", body }
    );
    const data = (await res.json()) as {
      success: boolean;
      ["error-codes"]?: string[];
    };
    return { success: data.success === true, errorCodes: data["error-codes"] };
  } catch {
    // Si Cloudflare no responde, fallamos CERRADO (rechazamos) en vez de
    // aceptar sin verificar.
    return { success: false, errorCodes: ["network_error"] };
  }
}

/**
 * Límite de solicitudes simple por IP usando KV como contador con
 * expiración. No es perfecto (KV es eventualmente consistente), pero frena
 * abuso básico. La capa "de verdad" contra DDoS va en el WAF de Cloudflare.
 */
export async function checkRateLimit(
  kv: AlmacenKV | undefined,
  key: string,
  max: number,
  windowSeconds: number
): Promise<boolean> {
  if (!kv) return true; // sin KV, no bloqueamos (modo demo)
  const current = await kv.get(key);
  const count = current ? parseInt(current, 10) : 0;
  if (count >= max) return false;
  await kv.put(key, String(count + 1), { expirationTtl: windowSeconds });
  return true;
}

/** Respuesta JSON estándar, sin caché (datos de formularios). */
export function jsonResponse(
  status: number,
  body: Record<string, unknown>
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
