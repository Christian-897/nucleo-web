/**
 * Punto de entrada del módulo carrito. Un sitio importa desde aquí:
 *
 *   import {
 *     crearEndpointCarrito,   // servidor (functions/api/carrito.ts)
 *     crearCarrito,           // cliente (navegador)
 *     obtenerCarrito,         // cliente compartido por página
 *     validarCarrito,         // motor, por si se usa directo
 *     formatearPrecio,
 *     type ConfigCarritoServidor,
 *     type CarritoValidado,
 *   } from "nucleo-web/carrito";
 */
export * from "./tipos";
export * from "./config";
export * from "./formato";
export { crearCarrito, obtenerCarrito, type Carrito } from "./cliente";
export { crearEndpointCarrito } from "./endpoint";
export { validarCarrito, procesarValidacion } from "./servidor";
