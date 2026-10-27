/**
 * Revisión de pagos en el panel (Resumen): GET → la revisión guardada (30
 * min); GET ?forzar=1 → consulta a Flow ahora (máximo una vez por minuto).
 * Solo lectura y solo con sesión: incluye correos de quienes pagaron.
 */
import { checkRateLimit } from "../../core/seguridad";
import { CLAVE_ERROR_INICIO, type ErrorInicioPago } from "../pago/explicar-error";
import { revisarPagosFlow } from "../pago/revision";
import type { EnvPago } from "../pago/config";
import { type Ctx, exigirSesion, jsonResponse } from "./http";

export interface ConfigRevisionPagos {
  /** Días hacia atrás que se revisan (1 a 14). Por defecto 7. */
  dias?: number;
  /** Zona horaria del negocio (Flow trabaja en hora de Chile). */
  zonaHoraria?: string;
}

export function crearRevisionPagos(config: ConfigRevisionPagos = {}) {
  return async function get(ctx: Ctx): Promise<Response> {
    const s = await exigirSesion(ctx, false);
    if (s instanceof Response) return s;
    let forzar = new URL(ctx.request.url).searchParams.get("forzar") === "1";
    if (forzar && ctx.env.REVIEWS_KV) {
      forzar = await checkRateLimit(ctx.env.REVIEWS_KV, "pago:revision:forzar", 1, 60);
    }
    const r = await revisarPagosFlow(ctx.env as EnvPago, { dias: config.dias, forzar, zona: config.zonaHoraria });
    // Últimos errores al iniciar un pago (v0.43.1): el motivo en palabras simples.
    const erroresInicio: ErrorInicioPago[] = [];
    for (const p of ["flow", "mercadopago"] as const) {
      try {
        const crudo = await ctx.env.REVIEWS_KV?.get(CLAVE_ERROR_INICIO(p));
        if (crudo) erroresInicio.push(JSON.parse(crudo) as ErrorInicioPago);
      } catch {
        /* ilegible: se ignora */
      }
    }
    const { huella: _h, ...publico } = r;
    return jsonResponse(200, { ...publico, erroresInicio });
  };
}
