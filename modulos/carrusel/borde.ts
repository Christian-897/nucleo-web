/**
 * CARRUSEL EN EL BORDE: si la portada se editó en el panel, reemplaza el
 * carrusel estático MIENTRAS la página viaja al visitante (HTMLRewriter),
 * sin reconstruir el sitio. Si no se editó, la página pasa sin tocar.
 *
 * El HTML nuevo lo arma `htmlCarrusel`, la misma función del componente, y
 * todo dato del panel va escapado ahí. Si KV falla se sirve lo estático:
 * nunca un error al visitante.
 */
import type { EnvBase } from "../../core/tipos";
import type { FuenteCarrusel } from "./almacen";
import { atributosCarrusel, htmlCarrusel } from "./marcado";
import type { OpcionesCarrusel } from "./tipos";

interface ElementoHtml {
  setAttribute(nombre: string, valor: string): void;
  setInnerContent(contenido: string, opciones?: { html?: boolean }): void;
}
interface Reescritor {
  on(selector: string, manejador: { element(el: ElementoHtml): void }): Reescritor;
  transform(r: Response): Response;
}
declare const HTMLRewriter: { new (): Reescritor };

export interface OpcionesBordeCarrusel extends OpcionesCarrusel {
  /** Páginas que llevan este carrusel. Por defecto solo la portada ("/"). */
  rutas?: string[];
}

export function crearBordeCarrusel(fuente: FuenteCarrusel, opciones: OpcionesBordeCarrusel = {}) {
  const rutas = new Set(opciones.rutas ?? ["/"]);
  const nombre = fuente.clave.replace(/^carrusel:/, "");
  return {
    onRequest: async ({ request, env, next }: { request: Request; env: EnvBase; next: () => Promise<Response> }) => {
      const ruta = new URL(request.url).pathname;
      if (!rutas.has(ruta) && !rutas.has(ruta.replace(/index\.html$/, ""))) return next();
      const respuesta = await next();
      if (!(respuesta.headers.get("content-type") || "").includes("text/html")) return respuesta;
      let estado;
      try {
        if (!(await fuente.editado(env))) return respuesta;
        estado = await fuente.obtener(env);
      } catch {
        return respuesta;
      }
      const html = htmlCarrusel(estado, opciones);
      const atributos = atributosCarrusel(estado);
      return new HTMLRewriter()
        .on(`[data-carrusel="${nombre}"]`, {
          element(el) {
            for (const [k, v] of Object.entries(atributos)) el.setAttribute(k, v);
            el.setInnerContent(html, { html: true });
          },
        })
        .transform(respuesta);
    },
  };
}
