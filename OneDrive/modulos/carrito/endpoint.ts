/**
 * Fábrica del endpoint de validación del carrito.
 *
 * Uso en un sitio (functions/api/carrito.ts):
 *
 *   import { crearEndpointCarrito } from "nucleo-web/carrito";
 *   import { configCarrito } from "../../src/config/carrito";
 *   export const { onRequestPost } = crearEndpointCarrito(configCarrito);
 *
 * La config puede ser un objeto, o una función (env) => config, para cuando
 * la fuente de productos vive en KV/D1 y necesita el `env` de Cloudflare.
 */
import type { EnvBase } from "../../core/tipos";
import type { ConfigCarritoServidor } from "./config";
import { procesarValidacion } from "./servidor";

interface PagesContext {
  request: Request;
  env: EnvBase;
}

export function crearEndpointCarrito(
  configOFabrica:
    | ConfigCarritoServidor
    | ((env: EnvBase) => ConfigCarritoServidor)
) {
  return {
    onRequestPost: ({ request, env }: PagesContext): Promise<Response> => {
      const config =
        typeof configOFabrica === "function"
          ? configOFabrica(env)
          : configOFabrica;
      return procesarValidacion(request, config);
    },
  };
}
