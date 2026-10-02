/**
 * Punto de entrada del módulo de cotización. Un sitio importa desde aquí:
 *
 *   import {
 *     crearEndpointCotizacion,
 *     enviarCotizacion,
 *     listarCotizaciones,
 *     type ConfigCotizacion,
 *   } from "nucleo-web/cotizacion";
 */
export * from "./config";
export * from "./esquema";
export * from "./plantilla-correo";
export * from "./cliente";
export {
  crearEndpointCotizacion,
} from "./endpoint";
export {
  procesarCotizacion,
  listarCotizaciones,
  marcarCotizacion,
  eliminarCotizacion,
  claveValida,
  PREFIJO,
  MAXIMO_A_LEER,
  type Cotizacion,
  type CotizacionConClave,
} from "./servidor";
