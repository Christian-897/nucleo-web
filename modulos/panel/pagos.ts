/**
 * PAGOS RECIBIDOS en el panel (v0.49): los cobros de monto libre
 * (pago-libre) ya confirmados por Flow o Mercado Pago. Solo lectura.
 *
 *   crearPanel({ …, pagos: true })
 *   functions/api/admin/pagos.ts    export const { onRequestGet } = panel.pagos;
 *   <PanelAdmin … pagos />
 *
 * Lo que se muestra lo escribió quien pagó (nombre, detalle): la pantalla lo
 * pone siempre como texto, nunca como HTML.
 */
import { listarPagosLibres } from "../pago-libre/servidor";
import { type Ctx, exigirSesion, jsonResponse } from "./http";

export function crearGestionPagos() {
  async function get(ctx: Ctx): Promise<Response> {
    const s = await exigirSesion(ctx, false);
    if (s instanceof Response) return s;
    const r = await listarPagosLibres(ctx.env, 100);
    return jsonResponse(200, {
      hayMas: r.hayMas,
      pagos: r.pagos.map((p) => ({
        orden: p.orden,
        fecha: p.fecha,
        nombre: p.nombre,
        email: p.email,
        concepto: p.conceptoLabel,
        detalle: p.detalle,
        monto: p.monto,
        proveedor: p.proveedor,
      })),
    });
  }
  return { get };
}
