/**
 * Punto de entrada del módulo pago (Flow). Un sitio importa desde aquí:
 *
 *   import {
 *     crearEndpointIniciarPago,
 *     crearEndpointConfirmacion,
 *     crearEndpointEstado,
 *     irAPagar,
 *     type ConfigPago,
 *   } from "nucleo-web/pago";
 */
export * from "./config";
export {
  firmarFlow,
  crearPagoFlow,
  obtenerEstadoFlow,
  baseUrlFlow,
  nombreEstado,
  ESTADO_FLOW,
  type CredencialesFlow,
  type DatosPagoFlow,
  type RespuestaCrearPago,
  type EstadoPagoFlow,
  type EstadoFlow,
} from "./flow";
export { iniciarPago, confirmarPago, consultarEstado } from "./servidor";
export {
  crearEndpointIniciarPago,
  crearEndpointConfirmacion,
  crearEndpointEstado,
} from "./endpoint";
export { irAPagar, type ResultadoIniciarPago } from "./cliente";
