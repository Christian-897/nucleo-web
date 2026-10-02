/**
 * Fábrica del endpoint de Cloudflare Pages Functions para cotización.
 *
 * Uso en un sitio (functions/api/quote.ts):
 *
 *   import { crearEndpointCotizacion } from "nucleo-web/cotizacion";
 *   import { configCotizacion } from "../../src/config/cotizacion";
 *   export const { onRequestPost } = crearEndpointCotizacion(configCotizacion);
 *
 * Solo se expone onRequestPost: Pages responde 405 solo a cualquier otro
 * método, sin comprobarlo a mano.
 */
import type { EnvBase } from "../../core/tipos";
import type { ConfigCotizacion } from "./config";
import { procesarCotizacion } from "./servidor";

interface PagesContext {
  request: Request;
  env: EnvBase;
}

export function crearEndpointCotizacion(config: ConfigCotizacion) {
  return {
    onRequestPost: ({ request, env }: PagesContext): Promise<Response> =>
      procesarCotizacion(request, env, config),
  };
}
