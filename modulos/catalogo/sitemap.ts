/**
 * /sitemap.xml generado con el catálogo VIGENTE (lo creado en el panel
 * incluido), para que Google encuentre los productos nuevos sin reconstruir.
 */
import type { EnvBase } from "../../core/tipos";
import { type CatalogoODinamico, resolverCatalogo } from "./almacen";

const escaparXml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function crearSitemap(fuente: CatalogoODinamico, opciones: { dominio: string; rutasFijas: string[] }) {
  return {
    onRequestGet: async ({ env }: { env: EnvBase }) => {
      const catalogo = await resolverCatalogo(fuente, env);
      const rutas = [
        ...opciones.rutasFijas,
        ...catalogo.categorias.map((c) => `/tienda/${c.id}/`),
        ...catalogo.productos.map((p) => `/producto/${p.id}/`),
      ];
      const xml =
        `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
        rutas.map((r) => `  <url><loc>${escaparXml(new URL(r, opciones.dominio).href)}</loc></url>`).join("\n") +
        `\n</urlset>\n`;
      return new Response(xml, {
        headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=300" },
      });
    },
  };
}
