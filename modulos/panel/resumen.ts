/**
 * RESUMEN (MÉTRICAS) DESDE EL PANEL. Solo con sesión.
 *
 *   GET /api/admin/resumen
 *     Vista general: hoy, 7 y 30 días, comparación por años y pedidos por
 *     despachar. Antes de calcular se "pone al día": cualquier pedido pagado
 *     que aún no esté en las métricas (por ejemplo, ventas de antes de
 *     instalar este módulo) se suma una sola vez.
 *
 *   GET /api/admin/resumen?desde=AAAA-MM-DD&hasta=AAAA-MM-DD&agrupar=dia|semana|mes
 *     Reporte de un rango de fechas elegido.
 */
import { ErrorRango, obtenerRango, obtenerResumen, ordenesContadas, registrarPedido } from "../metricas/index";
import { type Ctx, exigirSesion, jsonResponse } from "./http";
import { listarPedidos } from "./pedidos";

export function crearResumen(zona?: string) {
  return async function resumen(ctx: Ctx): Promise<Response> {
    const s = await exigirSesion(ctx, false);
    if (s instanceof Response) return s;
    const kv = ctx.env.REVIEWS_KV;
    const url = new URL(ctx.request.url);

    if (url.searchParams.has("desde") || url.searchParams.has("hasta")) {
      try {
        const reporte = await obtenerRango(
          kv,
          {
            desde: url.searchParams.get("desde") ?? "",
            hasta: url.searchParams.get("hasta") ?? "",
            agrupar: (url.searchParams.get("agrupar") ?? undefined) as "dia" | "semana" | "mes" | undefined,
          },
          { zona }
        );
        return jsonResponse(200, { ...reporte });
      } catch (e) {
        if (e instanceof ErrorRango) return jsonResponse(400, { message: e.message });
        throw e;
      }
    }

    const pedidos = await listarPedidos(ctx, false);
    // Una sola operación de listado para saber qué pedidos ya están contados.
    const contadas = await ordenesContadas(kv);
    for (const p of pedidos) {
      if (p.estado !== "pagada" || contadas.has(p.orden)) continue;
      try {
        await registrarPedido(kv, p, zona);
      } catch (e) {
        console.error("[panel] no se pudo poner al día las métricas", e);
      }
    }
    const datos = await obtenerResumen(kv, { zona });
    const porDespachar = pedidos.filter((p) => p.estado === "pagada" && p.requiereDespacho && !p.enviado).length;
    return jsonResponse(200, { ...datos, porDespachar });
  };
}
