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
 *   // functions/api/pago/retorno-flow.ts  (Flow vuelve con POST)
 *   export const { onRequestGet, onRequestPost } = tienda.pago.retornoFlow;
 *   // functions/api/despacho.ts  (si el sitio pasó `despacho`)
 *   export const { onRequestGet } = tienda.despacho;
 */
import { crearEndpointCarrito } from "../carrito/endpoint";
import { crearEndpointStock } from "../catalogo/endpoint";
import { crearEndpointCatalogoPublico } from "../catalogo/publico";
import { fuenteCarrito } from "../catalogo/stock";
import { crearEndpointsPago } from "../pago/endpoint";
import type { ConfigCompra } from "./config";
import { crearConfigPagoCompra } from "./servidor";
import { crearEndpointDespacho } from "../despacho/endpoint";

export function crearEndpointsCompra(config: ConfigCompra) {
  return {
    carrito: crearEndpointCarrito(fuenteCarrito(config.catalogo)),
    stock: crearEndpointStock(config.catalogo),
    /** GET /api/catalogo: lista pública del catálogo vigente. */
    catalogo: crearEndpointCatalogoPublico(config.catalogo),
    pago: crearEndpointsPago(crearConfigPagoCompra(config)),
    /** GET /api/despacho: tarifas y textos públicos. Sin `despacho` responde "por pagar". */
    despacho: config.despacho
      ? crearEndpointDespacho(config.despacho)
      : {
          onRequestGet: async () =>
            new Response(
              JSON.stringify({
                tarifas: { modo: "por-pagar", rm: 0, regiones: 0, extremas: 0, gratisDesde: null },
                textos: { corto: "Envíos a todo Chile", ficha: `${config.envio.modalidad} a todo Chile`, detalle: config.envio.detalle, filaSinRegion: config.envio.modalidad },
                zonasExtremas: [],
              }),
              { headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } }
            ),
        },
  };
}
