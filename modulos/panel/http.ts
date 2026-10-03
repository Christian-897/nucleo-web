/** Utilidades HTTP compartidas por los endpoints del panel. */
import { isSameOrigin, jsonResponse } from "../../core/seguridad";
import { sesionActual, type Sesion } from "./auth";
import type { EnvPanel } from "./config";

export interface Ctx {
  request: Request;
  env: EnvPanel;
  params?: Record<string, string | string[]>;
}

const TAMANO_MAXIMO_JSON = 64 * 1024;

/** Lee JSON con tope de tamaño. null = cuerpo inválido. */
export async function leerJson(request: Request): Promise<Record<string, unknown> | null> {
  if (Number(request.headers.get("Content-Length") || "0") > TAMANO_MAXIMO_JSON) return null;
  const texto = await request.text();
  if (texto.length > TAMANO_MAXIMO_JSON) return null;
  try {
    const d = JSON.parse(texto || "{}");
    return d && typeof d === "object" && !Array.isArray(d) ? d : null;
  } catch {
    return null;
  }
}

/** Respuesta JSON con cookies (una o varias). */
export function jsonConCookies(status: number, cuerpo: unknown, cookies: (string | null | undefined)[]): Response {
  const h = new Headers({ "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  for (const c of cookies) if (c) h.append("Set-Cookie", c);
  return new Response(JSON.stringify(cuerpo), { status, headers: h });
}

/**
 * Puerta de toda acción del panel: mismo origen (si escribe) y sesión.
 * Devuelve la sesión, o la Response de rechazo para devolver tal cual.
 */
export async function exigirSesion(ctx: Ctx, escribe: boolean): Promise<Sesion | Response> {
  if (escribe && !isSameOrigin(ctx.request)) return jsonResponse(403, { message: "Origen no permitido." });
  const sesion = await sesionActual(ctx.env, ctx.request);
  if (!sesion) return jsonResponse(401, { message: "Necesitas iniciar sesión." });
  return sesion;
}

export { jsonResponse };
