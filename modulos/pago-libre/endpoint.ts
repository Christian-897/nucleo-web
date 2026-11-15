import { crearEndpointsPago } from "../pago/endpoint";
import type { ConfigPagoLibre } from "./config";
import { crearConfigPagoLibre } from "./servidor";

/**
 * Endpoints del pago libre: los mismos de `pago` (iniciar, webhooks, estado,
 * retorno de Flow), con la config de monto acordado.
 *
 *   functions/api/pago/iniciar.ts               export const { onRequestPost } = pagoLibre.iniciar;
 *   functions/api/pago/webhook-flow.ts          export const { onRequestPost } = pagoLibre.webhookFlow;
 *   functions/api/pago/webhook-mercadopago.ts   export const { onRequestPost } = pagoLibre.webhookMercadoPago;
 *   functions/api/pago/estado.ts                export const { onRequestGet, onRequestPost } = pagoLibre.estado;
 *   functions/api/pago/retorno-flow.ts          export const { onRequestGet, onRequestPost } = pagoLibre.retornoFlow;
 */
export function crearEndpointsPagoLibre(config: ConfigPagoLibre) {
  return crearEndpointsPago(crearConfigPagoLibre(config));
}
