/**
 * Fábricas de los endpoints de pago (Cloudflare Pages Functions).
 *
 * En un sitio:
 *   functions/api/pago/iniciar.ts
 *     import { crearEndpointIniciarPago } from "nucleo-web/pago";
 *     import { configPago } from "../../../src/config/pago";
 *     export const { onRequestPost } = crearEndpointIniciarPago(configPago);
 *
 *   functions/api/pago/confirmacion.ts   (webhook; va en urlConfirmation)
 *     export const { onRequestPost } = crearEndpointConfirmacion(configPago);
 *
 *   functions/api/pago/estado.ts         (página de retorno)
 *     export const { onRequestPost, onRequestGet } = crearEndpointEstado(configPago);
 */
import type { ConfigPago, EnvPago } from "./config";
import { iniciarPago, confirmarPago, consultarEstado } from "./servidor";

interface Ctx {
  request: Request;
  env: EnvPago;
}

export function crearEndpointIniciarPago(config: ConfigPago) {
  return {
    onRequestPost: ({ request, env }: Ctx): Promise<Response> =>
      iniciarPago(request, env, config),
  };
}

export function crearEndpointConfirmacion(config: ConfigPago) {
  return {
    onRequestPost: ({ request, env }: Ctx): Promise<Response> =>
      confirmarPago(request, env, config),
  };
}

export function crearEndpointEstado(config: ConfigPago) {
  return {
    onRequestPost: ({ request, env }: Ctx): Promise<Response> =>
      consultarEstado(request, env, config),
    onRequestGet: ({ request, env }: Ctx): Promise<Response> =>
      consultarEstado(request, env, config),
  };
}
