/**
 * Endpoint opcional de stock, para que la página muestre "agotado" sin
 * reconstruir el sitio:  GET /api/stock?ids=a,b,c  → { a: 3, b: 0, c: null }
 * (null = sin límite). Solo lectura y sin datos personales.
 */
import type { EnvBase } from "../../core/tipos";
import { ID_VALIDO } from "./catalogo";
import { stockDisponible } from "./stock";
import type { CatalogoODinamico } from "./almacen";

export function crearEndpointStock(catalogo: CatalogoODinamico) {
  return {
    onRequestGet: async ({ request, env }: { request: Request; env: EnvBase }) => {
      const ids = (new URL(request.url).searchParams.get("ids") || "")
        .split(",")
        .map((s) => s.trim())
        .filter((s) => ID_VALIDO.test(s));
      const stock = await stockDisponible(catalogo, env, ids);
      return new Response(JSON.stringify(stock), {
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          // Caché corta en el borde: el stock no necesita ser al segundo.
          "Cache-Control": "public, max-age=30",
        },
      });
    },
  };
}
