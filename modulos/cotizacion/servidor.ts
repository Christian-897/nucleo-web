/**
 * MOTOR del módulo de cotización (lado servidor). No conoce colores ni
 * markup de página: recibe la petición, valida, verifica anti-bot, avisa
 * por correo y guarda un respaldo. Lo específico del rubro entra por
 * `config`.
 *
 * Estructura de la clave de cada respaldo:
 *   cotizacion:2026-09-11T02:50:18.282Z:1305f875
 *              └─ fecha ISO ─┘           └ azar ┘
 * La fecha va primero porque KV devuelve las claves en orden alfabético,
 * que en ISO coincide con el cronológico. El azar evita choques en el
 * mismo milisegundo.
 */
import type { EnvBase } from "../../core/tipos";
import {
  getClientIp,
  isSameOrigin,
  verifyTurnstile,
  checkRateLimit,
  jsonResponse,
} from "../../core/seguridad";
import { HONEYPOT_FIELD, normalizeInput } from "../../core/validar";
import { sendNotificationEmail } from "../../core/correo";
import {
  type ConfigCotizacion,
  RETENCION_DIAS_POR_DEFECTO,
  nombresCategoria,
} from "./config";
import { crearEsquemaCotizacion } from "./esquema";
import { asuntoSolicitud, cuerpoSolicitud } from "./plantilla-correo";

export const PREFIJO = "cotizacion:";

/** Cuántas solicitudes se leen de una vez para el panel. */
export const MAXIMO_A_LEER = 200;

export interface Cotizacion {
  nombre: string;
  email: string;
  telefono?: string;
  categoria: string;
  descripcion: string;
  fecha: string;
  correoEnviado?: boolean;
  correoSimulado?: boolean;
  /** Lo pone el panel al marcarla. Si no existe, está pendiente. */
  atendida?: string | null;
}

export interface CotizacionConClave extends Cotizacion {
  clave: string;
}

/** Una clave válida y nada más: nunca se confía en lo que llega del cliente. */
export function claveValida(clave: unknown): clave is string {
  return (
    typeof clave === "string" &&
    clave.startsWith(PREFIJO) &&
    clave.length < 120 &&
    /^cotizacion:[0-9TZ:.\-]{20,30}:[0-9a-f]{8}$/.test(clave)
  );
}

/**
 * Procesa un envío del formulario de cotización. Devuelve directamente la
 * Response para que el endpoint solo tenga que enlazar la config.
 */
export async function procesarCotizacion(
  request: Request,
  env: EnvBase,
  config: ConfigCotizacion
): Promise<Response> {
  if (!isSameOrigin(request)) {
    return jsonResponse(403, { message: "Origen no permitido." });
  }

  let raw: Record<string, unknown>;
  try {
    raw = (await request.json()) as Record<string, unknown>;
  } catch {
    return jsonResponse(400, { message: "Cuerpo de la solicitud inválido." });
  }

  // Honeypot: si un bot completó el campo oculto, respondemos 200 SIN
  // procesar nada. Un 400 real le enseñaría a esquivarlo.
  if (typeof raw[HONEYPOT_FIELD] === "string" && raw[HONEYPOT_FIELD].length > 0) {
    console.warn("[cotizacion] honeypot activado, se ignora silenciosamente");
    return jsonResponse(200, { ok: true });
  }

  // Normalizamos strings antes de validar (quita caracteres de control
  // usados en inyección de cabeceras de email).
  const normalized = {
    ...raw,
    nombre: typeof raw.nombre === "string" ? normalizeInput(raw.nombre) : raw.nombre,
    email: typeof raw.email === "string" ? normalizeInput(raw.email) : raw.email,
    telefono:
      typeof raw.telefono === "string" ? normalizeInput(raw.telefono) : raw.telefono,
    descripcion:
      typeof raw.descripcion === "string"
        ? normalizeInput(raw.descripcion, { allowNewlines: true })
        : raw.descripcion,
  };

  const esquema = crearEsquemaCotizacion(config.categorias);
  const parsed = esquema.safeParse(normalized);
  if (!parsed.success) {
    return jsonResponse(400, {
      message: "Revisa los campos marcados.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    });
  }

  const ip = getClientIp(request);

  const withinLimit = await checkRateLimit(
    env.REVIEWS_KV,
    `quote:${ip}`,
    Number(env.RATE_LIMIT_MAX ?? config.rateLimitMax ?? 5),
    Number(env.RATE_LIMIT_WINDOW_SECONDS ?? config.rateLimitVentanaSeg ?? 600)
  );
  if (!withinLimit) {
    return jsonResponse(429, {
      message: "Demasiadas solicitudes. Intenta nuevamente más tarde.",
    });
  }

  const turnstile = await verifyTurnstile(
    parsed.data.turnstileToken,
    env.TURNSTILE_SECRET_KEY || "",
    ip
  );
  if (!turnstile.success) {
    // El motivo va SOLO al registro del servidor, nunca a la respuesta.
    console.error(
      "[cotizacion] Turnstile rechazó la solicitud:",
      JSON.stringify(turnstile.errorCodes ?? ["sin-codigo"]),
      "| largo de la clave secreta configurada:",
      (env.TURNSTILE_SECRET_KEY || "").length
    );
    return jsonResponse(400, {
      message: "No pudimos verificar que eres una persona. Intenta de nuevo.",
    });
  }

  const { nombre, email, telefono, categoria, descripcion } = parsed.data;
  const datos = { nombre, email, telefono, categoria, descripcion };
  const nombres = nombresCategoria(config);

  const origen = new URL(request.url).origin;
  const rutaPanel = config.rutaPanel ?? "/admin/";
  const html = cuerpoSolicitud(datos, {
    nombreSitio: config.nombreSitio,
    urlPanel: `${origen}${rutaPanel}`,
    nombresCategoria: nombres,
    colores: config.coloresCorreo,
  });

  // El correo puede fallar por causas ajenas (cuota, caída del proveedor):
  // se captura para que NO impida guardar el respaldo.
  let envio = { sent: false, simulated: false };
  try {
    envio = await sendNotificationEmail(env, {
      subject: asuntoSolicitud(datos, {
        nombreSitio: config.nombreSitio,
        nombresCategoria: nombres,
      }),
      html,
      // Al responder el correo, la respuesta le llega al visitante.
      replyTo: email,
      remitentePorDefecto: `${config.nombreSitio} <onboarding@resend.dev>`,
    });
  } catch (error) {
    console.error("[cotizacion] falló el envío del correo", error);
  }

  await guardarRespaldo(env, datos, envio, config);

  return jsonResponse(200, { ok: true });
}

/**
 * Guarda una copia de la cotización en KV, pase lo que pase con el correo.
 * NO se guarda la IP: para responder no hace falta, y guardar menos datos
 * personales es guardar menos problemas. Se borra sola al cumplir el plazo.
 */
async function guardarRespaldo(
  env: EnvBase,
  datos: {
    nombre: string;
    email: string;
    telefono?: string;
    categoria: string;
    descripcion: string;
  },
  envio: { sent: boolean; simulated: boolean },
  config: ConfigCotizacion
): Promise<void> {
  if (!env.REVIEWS_KV) {
    console.warn("[cotizacion] sin KV: la cotización no queda respaldada");
    return;
  }

  const retencion = (config.retencionDias ?? RETENCION_DIAS_POR_DEFECTO) * 24 * 60 * 60;
  const fecha = new Date().toISOString();
  const clave = `${PREFIJO}${fecha}:${crypto.randomUUID().slice(0, 8)}`;

  try {
    await env.REVIEWS_KV.put(
      clave,
      JSON.stringify({
        ...datos,
        fecha,
        correoEnviado: envio.sent,
        correoSimulado: envio.simulated,
      }),
      { expirationTtl: retencion }
    );
  } catch (error) {
    console.error("[cotizacion] no se pudo guardar el respaldo", error);
  }
}

/** Devuelve las solicitudes más recientes, las nuevas primero (para el panel). */
export async function listarCotizaciones(env: EnvBase): Promise<{
  cotizaciones: CotizacionConClave[];
  total: number;
  pendientes: number;
  hayMas: boolean;
}> {
  const kv = env.REVIEWS_KV;
  if (!kv) return { cotizaciones: [], total: 0, pendientes: 0, hayMas: false };

  const listado = await kv.list({ prefix: PREFIJO, limit: 1000 });
  const todas = listado.keys.map((k) => k.name).reverse();
  const aLeer = todas.slice(0, MAXIMO_A_LEER);

  const leidas = await Promise.all(
    aLeer.map(async (clave) => {
      const crudo = await kv.get(clave);
      if (!crudo) return null;
      try {
        return { ...(JSON.parse(crudo) as Cotizacion), clave };
      } catch {
        return null; // un registro corrupto no tumba la bandeja completa
      }
    })
  );

  const cotizaciones = leidas.filter((c): c is CotizacionConClave => c !== null);
  return {
    cotizaciones,
    total: todas.length,
    pendientes: cotizaciones.filter((c) => !c.atendida).length,
    hayMas: todas.length > aLeer.length,
  };
}

/**
 * Marca una cotización como atendida, o la vuelve a pendiente, RESPETANDO
 * el plazo de borrado. KV no deja modificar: hay que reescribir, y al
 * reescribir el plazo vuelve a cero si no se indica otro. Por eso se
 * recalcula lo que le quedaba, contando desde su fecha original, o un dato
 * personal terminaría guardado el doble de lo prometido.
 */
export async function marcarCotizacion(
  env: EnvBase,
  clave: string,
  atendida: boolean,
  config: ConfigCotizacion
): Promise<{ ok: boolean; motivo?: string }> {
  const kv = env.REVIEWS_KV;
  if (!kv) return { ok: false, motivo: "sin-base-de-datos" };

  const crudo = await kv.get(clave);
  if (!crudo) return { ok: false, motivo: "no-existe" };

  let cotizacion: Cotizacion;
  try {
    cotizacion = JSON.parse(crudo) as Cotizacion;
  } catch {
    return { ok: false, motivo: "registro-ilegible" };
  }

  cotizacion.atendida = atendida ? new Date().toISOString() : null;

  const retencionDias = config.retencionDias ?? RETENCION_DIAS_POR_DEFECTO;
  const vividos = Math.floor(
    (Date.now() - new Date(cotizacion.fecha).getTime()) / 1000
  );
  const restante = retencionDias * 24 * 60 * 60 - vividos;

  if (restante <= 60) {
    await kv.delete(clave);
    return { ok: false, motivo: "ya-vencida" };
  }

  await kv.put(clave, JSON.stringify(cotizacion), { expirationTtl: restante });
  return { ok: true };
}

/**
 * Borra una cotización para siempre. La clave ya viene comprobada por
 * `claveValida` en el endpoint. Idempotente: si ya no existe, se considera
 * cumplido (dos personas borrando lo mismo no ven un error confuso).
 */
export async function eliminarCotizacion(
  env: EnvBase,
  clave: string
): Promise<{ ok: boolean; motivo?: string }> {
  const kv = env.REVIEWS_KV;
  if (!kv) return { ok: false, motivo: "sin-base-de-datos" };
  try {
    await kv.delete(clave);
    return { ok: true };
  } catch {
    return { ok: false, motivo: "no-se-pudo-borrar" };
  }
}
