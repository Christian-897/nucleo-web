/**
 * Módulo compra: tienda completa (catálogo + carrito + pago + comprador +
 * correos) con un solo llamado en el servidor.
 *
 *   import { crearEndpointsCompra, iniciarCompra, REGIONES_CHILE } from "nucleo-web/compra";
 */
export * from "./config";
export * from "./regiones";
export { crearEsquemaComprador, validarComprador, type Comprador, type ResultadoComprador } from "./esquema";
export { crearConfigPagoCompra, type MetadataCompra } from "./servidor";
export { crearEndpointsCompra } from "./endpoint";
export { iniciarCompra, necesitaDespacho, type ResultadoCompra } from "./cliente";
export { correoComprador, correoTienda } from "./plantilla-correo";
