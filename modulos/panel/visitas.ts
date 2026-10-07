/**
 * VISITAS EN EL PANEL (módulo visitas).
 *
 *   GET /api/admin/visitas?dias=7|30
 *
 * Sin las 3 variables de Cloudflare responde { conectadas: false } y la
 * pantalla lo explica; nunca un error rojo para la dueña de la tienda.
 */
import { consultarVisitas, ErrorVisitas, PERIODOS_VISITAS, visitasConfiguradas, type EnvVisitas, type PeriodoVisitas } from "../visitas/index";
import { type Ctx, exigirSesion, jsonResponse } from "./http";

export async function visitasPanel(ctx: Ctx, fetcher?: typeof fetch): Promise<Response> {
  const s = await exigirSesion(ctx, false);
  if (s instanceof Response) return s;
  const env = ctx.env as EnvVisitas;
  if (!visitasConfiguradas(env)) return jsonResponse(200, { conectadas: false });
  const pedido = Number(new URL(ctx.request.url).searchParams.get("dias") || "7");
  const dias = (PERIODOS_VISITAS as readonly number[]).includes(pedido) ? (pedido as PeriodoVisitas) : 7;
  try {
    const reporte = await consultarVisitas(env, dias, { fetch: fetcher });
    return jsonResponse(200, { conectadas: true, ...reporte });
  } catch (e) {
    if (e instanceof ErrorVisitas) return jsonResponse(502, { conectadas: true, message: e.message });
    throw e;
  }
}
