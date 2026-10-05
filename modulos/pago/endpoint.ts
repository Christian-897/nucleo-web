/**
 * Endpoints de pago para Cloudflare Pages Functions.
 *
 * Lo más simple: un solo llamado arma todos los endpoints.
 *
 *   // src/pago.ts
 *   import { crearEndpointsPago } from "nucleo-web/pago";
 *   export const pago = crearEndpointsPago(configPago);
 *
 *   // functions/api/pago/iniciar.ts
 *   export const { onRequestPost } = pago.iniciar;
 *   // functions/api/pago/webhook-flow.ts
 *   export const { onRequestPost } = pago.webhookFlow;
 *   // functions/api/pago/webhook-mercadopago.ts
 *   export const { onRequestPost } = pago.webhookMercadoPago;
 *   // functions/api/pago/estado.ts
 *   export const { onRequestGet, onRequestPost } = pago.estado;
 *   // functions/api/pago/retorno-flow.ts   (solo si se usa Flow)
 *   export const { onRequestGet, onRequestPost } = pago.retornoFlow;
 */
import type { ConfigPago, EnvPago } from "./config";
import {
  consultarEstado,
  iniciarPago,
  retornoFlow,
  webhookFlow,
  webhookMercadoPago,
} from "./servidor";

interface Ctx {
  request: Request;
  env: EnvPago;
}

export function crearEndpointsPago(config: ConfigPago) {
  if (!config.proveedores?.length) {
    throw new Error("crearEndpointsPago: habilita al menos un proveedor.");
  }
  return {
    iniciar: {
      onRequestPost: ({ request, env }: Ctx) => iniciarPago(request, env, config),
    },
    webhookFlow: {
      onRequestPost: ({ request, env }: Ctx) => webhookFlow(request, env, config),
    },
    webhookMercadoPago: {
      onRequestPost: ({ request, env }: Ctx) => webhookMercadoPago(request, env, config),
    },
    estado: {
      onRequestGet: ({ request, env }: Ctx) => consultarEstado(request, env, config),
      onRequestPost: ({ request, env }: Ctx) => consultarEstado(request, env, config),
    },
    retornoFlow: {
      onRequestGet: ({ request }: Ctx) => retornoFlow(request, config),
      onRequestPost: ({ request }: Ctx) => retornoFlow(request, config),
    },
  };
}
