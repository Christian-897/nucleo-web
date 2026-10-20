/**
 * Aviso de "sitio en construcción" como middleware de Cloudflare Pages.
 *
 *  - Se enciende con la variable CONSTRUCCION="1" o desde el panel
 *    (interruptor en Resumen, ver estado.ts); si ninguno, el sitio funciona
 *    normal y el middleware no hace nada.
 *  - Los visitantes reciben la página de aviso con estado 503 (le dice a
 *    Google "temporal, vuelve después": no castiga el posicionamiento).
 *  - Quien tiene sesión en el panel ve la tienda sin clave (el panel le da
 *    la cookie). Además, el dueño puede entrar con `?previa=CLAVE`. Se guarda una cookie con una
 *    FIRMA de la clave (nunca la clave), HttpOnly y Secure, por N días.
 *  - `?previa=salir` borra la cookie (para ver lo que ve el público).
 *  - Siempre pasan los webhooks de pago, el retorno de Flow y robots.txt, más las rutas que
 *    el sitio agregue (el logo del aviso, por ejemplo).
 *
 * Seguridad: la clave se compara en tiempo constante; si es corta o no
 * existe, nadie puede saltarse el aviso (falla cerrado); la página de aviso
 * no carga nada externo y lleva su propia CSP.
 */
import { compararSeguro } from "../../core/cripto";
import { getCookie } from "../../core/seguridad";
import { type ConfigConstruccion, type EnvConstruccion, NOMBRE_COOKIE, RUTAS_LIBRES_POR_DEFECTO } from "./config";
import { avisoEncendido, claveEfectiva, firmaAcceso, forzadoPorVariable } from "./estado";
import { paginaConstruccion } from "./plantilla";

export interface ContextoMiddleware {
  request: Request;
  env: EnvConstruccion;
  next: () => Promise<Response>;
}

/** Solo la variable de Cloudflare (sin mirar el panel). Para el estado completo: avisoEncendido. */
export function avisoActivo(env: EnvConstruccion): boolean {
  return forzadoPorVariable(env);
}

export { firmaAcceso };

function rutaLibre(ruta: string, config: ConfigConstruccion): boolean {
  const libres = [...RUTAS_LIBRES_POR_DEFECTO, ...(config.rutasLibres ?? [])];
  if (config.logo) libres.push(config.logo);
  return libres.some((p) => ruta === p || ruta.startsWith(p));
}

function respuestaAviso(config: ConfigConstruccion): Response {
  return new Response(paginaConstruccion(config), {
    status: 503,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Retry-After": "86400",
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex",
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
      "Content-Security-Policy":
        "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
    },
  });
}

function redirigirSinParametro(url: URL, parametro: string, cookie: string): Response {
  url.searchParams.delete(parametro);
  return new Response(null, {
    status: 303,
    headers: {
      Location: url.pathname + url.search + url.hash,
      "Set-Cookie": cookie,
      "Cache-Control": "no-store",
    },
  });
}

export async function procesarConstruccion(
  ctx: ContextoMiddleware,
  config: ConfigConstruccion
): Promise<Response> {
  const { request, env } = ctx;
  const url = new URL(request.url);
  // Rutas libres primero: no gastan lectura de KV (pagos, panel, fotos).
  if (rutaLibre(url.pathname, config)) return ctx.next();
  if (!(await avisoEncendido(env))) return ctx.next();

  const parametro = config.parametro ?? "previa";
  const clave = await claveEfectiva(env);
  if (!clave) {
    console.warn("[construccion] sin ACCESO_PREVIA ni ADMIN_PEPPER: nadie puede entrar a la vista previa");
  }

  const pedido = url.searchParams.get(parametro);
  if (pedido === "salir") {
    return redirigirSinParametro(url, parametro, `${NOMBRE_COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`);
  }
  if (pedido !== null && clave) {
    if (compararSeguro(pedido, clave)) {
      const dias = config.diasAcceso ?? 30;
      const cookie = `${NOMBRE_COOKIE}=${await firmaAcceso(clave)}; Path=/; Max-Age=${dias * 86400}; HttpOnly; Secure; SameSite=Lax`;
      return redirigirSinParametro(url, parametro, cookie);
    }
    return respuestaAviso(config); // clave equivocada: mismo aviso, sin pistas
  }

  const enviada = getCookie(request, NOMBRE_COOKIE);
  if (clave && enviada && compararSeguro(enviada, await firmaAcceso(clave))) {
    const res = await ctx.next();
    // La vista previa nunca debe terminar indexada ni en caché compartida.
    const copia = new Response(res.body, res);
    copia.headers.set("X-Robots-Tag", "noindex");
    copia.headers.set("Cache-Control", "private, no-store");
    return copia;
  }

  return respuestaAviso(config);
}

export function crearAvisoConstruccion(config: ConfigConstruccion) {
  return {
    onRequest: (ctx: ContextoMiddleware) => procesarConstruccion(ctx, config),
  };
}
