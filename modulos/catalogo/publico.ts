/**
 * GET /api/catalogo → lista pública del catálogo vigente (lo editado en el
 * panel incluido), con el stock disponible. La usan las páginas para
 * saber, por ejemplo, si un producto nuevo es digital (no pide dirección).
 * Solo datos públicos: nada de costos ni contadores internos.
 */
import type { EnvBase } from "../../core/tipos";
import { type CatalogoODinamico, resolverCatalogo } from "./almacen";
import { productoDisponible } from "./stock";

export interface ProductoPublico {
  id: string;
  nombre: string;
  precio: number;
  categoria: string;
  tipo: "fisico" | "digital";
  imagen?: string;
  /** null = sin límite. */
  disponible: number | null;
}

export function crearEndpointCatalogoPublico(catalogo: CatalogoODinamico) {
  return {
    onRequestGet: async ({ env }: { env: EnvBase }) => {
      const vigente = await resolverCatalogo(catalogo, env);
      const lista: ProductoPublico[] = [];
      for (const p of vigente.productos) {
        const d = await productoDisponible(vigente, env, p.id);
        lista.push({
          id: p.id,
          nombre: p.nombre,
          precio: p.precio,
          categoria: p.categoria,
          tipo: p.tipo,
          imagen: p.imagen,
          disponible: d?.stock === undefined ? null : Number(d.stock),
        });
      }
      return new Response(JSON.stringify(lista), {
        headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "public, max-age=15" },
      });
    },
  };
}
