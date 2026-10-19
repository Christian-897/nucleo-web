/**
 * Módulo despacho: cobro por zona (RM, regiones, zonas extremas), "gratis
 * desde $X", "por pagar" (por zona) y retiro sin costo, editable desde el panel.
 *
 *   import { crearDespachoEditable } from "nucleo-web/despacho";
 */
export * from "./calculo";
export { crearDespachoEditable, CLAVE_DESPACHO, ErrorDespacho, type FuenteDespacho, type OpcionesDespacho } from "./almacen";
export { crearEndpointDespacho } from "./endpoint";
