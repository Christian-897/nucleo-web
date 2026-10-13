/**
 * Módulo despacho: cobro por zona (RM, regiones, zonas extremas), "gratis
 * desde $X" o "por pagar", editable desde el panel.
 *
 *   import { crearDespachoEditable } from "nucleo-web/despacho";
 */
export * from "./calculo";
export { crearDespachoEditable, CLAVE_DESPACHO, ErrorDespacho, type FuenteDespacho, type OpcionesDespacho } from "./almacen";
export { crearEndpointDespacho } from "./endpoint";
