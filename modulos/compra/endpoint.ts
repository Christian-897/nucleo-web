/**
 * Todos los endpoints de una tienda en un llamado:
 *
 *   // src/servidor/tienda.ts
 *   export const tienda = crearEndpointsCompra({ nombreSitio, catalogo, proveedores, envio });
 *
 *   // functions/api/carrito.ts
 *   export const { onRequestPost } = tienda.carrito;
 *   // functions/api/stock.ts
 *   export const { onRequestGet } = tienda.stock;
 *   // functions/api/pago/iniciar.ts
 *   export const { onRequestPost } = tienda.pago.iniciar;
 *   // functions/api/pago/webhook-mercadopago.ts
 *   export const { onRequestPost } = tienda.pago.webhookMercadoPago;
 *   // functions/api/pago/webhook-flow.ts
 *   export const { onRequestPost } = tienda.pago.webhookFlow;
 *   // functions/api/pago/estado.ts
 *   export const { onRequestGet, onRequestPost } = tienda.pago.estado;
 */
import { crearEndpointCarrito } from "../carrito/endpoint";
import { crearEndpointStock } from "../catalogo/endpoint";
import { fuenteCarrito } from "../catalogo/stock";
import { crearEndpointsPago } from "../pago/endpoint";
import type { ConfigCompra } from "./config";
import { crearConfigPagoCompra } from "./servidor";

export function crearEndpointsCompra(config: ConfigCompra) {
  return {
    carrito: crearEndpointCarrito(fuenteCarrito(config.catalogo)),
    stock: crearEndpointStock(config.catalogo),
    pago: crearEndpointsPago(crearConfigPagoCompra(config)),
  };
}
