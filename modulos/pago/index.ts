/**
 * Módulo pago: Flow + Mercado Pago bajo una misma interfaz.
 *
 *   import { crearEndpointsPago, irAPagar, ErrorPedido, type ConfigPago } from "nucleo-web/pago";
 */
export * from "./tipos";
export * from "./config";
export { crearEndpointsPago } from "./endpoint";
export {
  iniciarPago,
  aplicarResultado,
  webhookFlow,
  webhookMercadoPago,
  consultarEstado,
} from "./servidor";
export { irAPagar, destinoPermitido, type ResultadoIniciarPago } from "./cliente";
export {
  firmarFlow,
  crearCobroFlow,
  consultarCobroFlow,
  estadoDesdeFlow,
  baseUrlFlow,
  type CredencialesFlow,
} from "./proveedores/flow";
export {
  crearCobroMercadoPago,
  consultarCobroMercadoPago,
  estadoDesdeMercadoPago,
  verificarFirmaMercadoPago,
  manifiestoMercadoPago,
  parsearXSignature,
} from "./proveedores/mercadopago";
export {
  revisarPagosFlow,
  compararPagos,
  pagosFlowDelDia,
  leerListaFlow,
  diasLocales,
  type RevisionPagos,
  type AlertaPago,
  type TipoAlerta,
} from "./revision";
