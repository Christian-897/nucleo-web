/**
 * Endpoints del newsletter para Cloudflare Pages Functions.
 *
 *   // src/newsletter.ts
 *   export const newsletter = crearEndpointsNewsletter(config);
 *   // functions/api/newsletter/suscribir.ts
 *   export const { onRequestPost } = newsletter.suscribir;
 *   // functions/api/newsletter/confirmar.ts
 *   export const { onRequestPost } = newsletter.confirmar;
 *   // functions/api/newsletter/baja.ts
 *   export const { onRequestPost } = newsletter.baja;
 *   // functions/api/newsletter/exportar.ts
 *   export const { onRequestGet } = newsletter.exportar;
 */
import type { ConfigNewsletter, EnvNewsletter } from "./config";
import { confirmar, darDeBaja, exportar, suscribir } from "./servidor";

interface Ctx {
  request: Request;
  env: EnvNewsletter;
}

export function crearEndpointsNewsletter(config: ConfigNewsletter) {
  return {
    suscribir: { onRequestPost: ({ request, env }: Ctx) => suscribir(request, env, config) },
    confirmar: { onRequestPost: ({ request, env }: Ctx) => confirmar(request, env, config) },
    baja: { onRequestPost: ({ request, env }: Ctx) => darDeBaja(request, env) },
    exportar: { onRequestGet: ({ request, env }: Ctx) => exportar(request, env) },
  };
}
