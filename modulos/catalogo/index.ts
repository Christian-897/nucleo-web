/**
 * Módulo catálogo: productos desde una lista + stock real en KV.
 *
 *   import { crearCatalogo, fuenteCarrito, registrarVenta } from "nucleo-web/catalogo";
 */
export * from "./tipos";
export { crearCatalogo, validarCatalogo, ErrorCatalogo, ID_VALIDO } from "./catalogo";
export {
  fuenteCarrito,
  productoDisponible,
  registrarVenta,
  stockDisponible,
  PREFIJO_VENDIDOS,
} from "./stock";
export { crearEndpointStock } from "./endpoint";
export { consultarStock } from "./cliente";
