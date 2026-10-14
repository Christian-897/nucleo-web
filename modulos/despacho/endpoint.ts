/**
 * GET /api/despacho: tarifas y textos públicos, para que el carrito muestre
 * el despacho al elegir la región y la ficha lo avise antes de comprar.
 * Solo lectura: lo que se cobra lo decide el servidor al iniciar el pago.
 *
 *   // functions/api/despacho.ts
 *   export const { onRequestGet } = tienda.despacho;
 */
import type { EnvBase } from "../../core/tipos";
import type { FuenteDespacho } from "./almacen";

export function crearEndpointDespacho(fuente: FuenteDespacho) {
  return {
    async onRequestGet({ env }: { env: EnvBase }): Promise<Response> {
      const tarifas = await fuente.obtener(env);
      return new Response(JSON.stringify({ tarifas, textos: fuente.textos(tarifas) }), {
        headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
      });
    },
  };
}
