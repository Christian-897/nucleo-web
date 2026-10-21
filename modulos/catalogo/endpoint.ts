/**
 * Endpoint opcional de stock, para que la página muestre "agotado" sin
 * reconstruir el sitio:  GET /api/stock?ids=a,b,c  → { a: 3, b: 0, c: null }
 * (null = sin límite). Solo lectura y sin datos personales.
 * Ids con color: `a~rojo`. `?producto=a` devuelve el stock de todos sus colores.
 */
import type { EnvBase } from "../../core/tipos";
import { ID_VALIDO } from "./catalogo";
import { ID_COLOR, partirId } from "./colores";
import { stockDeColores, stockDisponible } from "./stock";
import type { CatalogoODinamico } from "./almacen";

function idPermitido(id: string): boolean {
  const { base, color } = partirId(id);
  return ID_VALIDO.test(base) && (color === undefined || ID_COLOR.test(color));
}

export function crearEndpointStock(catalogo: CatalogoODinamico) {
  return {
    onRequestGet: async ({ request, env }: { request: Request; env: EnvBase }) => {
      const url = new URL(request.url);
      const producto = url.searchParams.get("producto") || "";
      const ids = (url.searchParams.get("ids") || "")
        .split(",")
        .map((s) => s.trim())
        .filter(idPermitido);
      const stock = ID_VALIDO.test(producto)
        ? await stockDeColores(catalogo, env, producto)
        : await stockDisponible(catalogo, env, ids);
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
