/**
 * MOTOR del newsletter. Doble confirmación (double opt-in) y baja con un
 * clic, pensado para cumplir la Ley 19.628 y no terminar en spam.
 *
 *  1. Suscribir: valida, frena bots (honeypot + Turnstile + tope por IP y
 *     por correo) y manda un correo con un enlace FIRMADO que vence.
 *  2. Confirmar: solo con ese enlace la suscripción pasa a "activa".
 *  3. Baja: enlace firmado que no vence (va en cada correo).
 *
 * Seguridad:
 *  - La respuesta de "suscribir" es SIEMPRE la misma, exista o no el
 *    correo: no se puede averiguar quién está suscrito.
 *  - Confirmar y dar de baja son POST desde una página con botón: los
 *    antivirus de correo que abren los enlaces solos no confirman ni dan de
 *    baja a nadie.
 *  - Firmas HMAC-SHA256 comparadas en tiempo constante.
 *  - Sin NEWSLETTER_SECRET el módulo no funciona (falla cerrado).
 *  - La exportación pide un token propio y neutraliza fórmulas en el CSV.
 */
import {
  checkRateLimit,
  getClientIp,
  isSameOrigin,
  jsonResponse,
  verifyTurnstile,
} from "../../core/seguridad";
import { compararSeguro, hmacSha256Hex } from "../../core/cripto";
import { enviarCorreo, limpiarVariable, sendNotificationEmail } from "../../core/correo";
import { HONEYPOT_FIELD, escapeHtml, normalizeInput } from "../../core/validar";
import {
  type ConfigNewsletter,
  type EnvNewsletter,
  LARGO_MINIMO_SECRETO,
  RUTAS_NEWSLETTER,
} from "./config";
import { correoConfirmacion } from "./plantilla-correo";

export const PREFIJO_SUSCRIPTOR = "news:sub:";
const EMAIL_VALIDO = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;
const TAMANO_MAXIMO = 4 * 1024;

export type EstadoSuscriptor = "pendiente" | "activo";

export interface Suscriptor {
  email: string;
  estado: EstadoSuscriptor;
  creado: string;
  confirmado?: string;
}

// ───────────────────────────── utilidades ─────────────────────────────

export function normalizarEmail(valor: unknown): string | null {
  if (typeof valor !== "string") return null;
  const email = normalizeInput(valor).toLowerCase();
  return email.length <= 254 && EMAIL_VALIDO.test(email) ? email : null;
}

function secretoValido(env: EnvNewsletter): string | null {
  const s = limpiarVariable(env.NEWSLETTER_SECRET);
  return s.length >= LARGO_MINIMO_SECRETO ? s : null;
}

/** El correo viaja en el enlace como base64url (sin "@" ni "+" en la URL). */
export function codificarEmail(email: string): string {
  const bytes = new TextEncoder().encode(email);
  let bin = "";
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function decodificarEmail(valor: unknown): string | null {
  if (typeof valor !== "string" || !/^[A-Za-z0-9_-]{4,400}$/.test(valor)) return null;
  try {
    const b64 = valor.replace(/-/g, "+").replace(/_/g, "/");
    const bin = atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    return normalizarEmail(new TextDecoder().decode(bytes));
  } catch {
    return null;
  }
}

async function claveSuscriptor(secreto: string, email: string): Promise<string> {
  // La clave de KV no lleva el correo a la vista: es un HMAC del correo.
  return PREFIJO_SUSCRIPTOR + (await hmacSha256Hex(secreto, `clave:${email}`)).slice(0, 40);
}

export async function firmarConfirmacion(secreto: string, email: string, vence: number) {
  return hmacSha256Hex(secreto, `confirmar:${email}:${vence}`);
}

export async function firmarBaja(secreto: string, email: string) {
  return hmacSha256Hex(secreto, `baja:${email}`);
}

/** Enlace de baja listo para poner en cada correo del newsletter. */
export async function enlaceBaja(
  env: EnvNewsletter,
  origen: string,
  email: string,
  config: Pick<ConfigNewsletter, "rutaBaja"> = {}
): Promise<string | null> {
  const secreto = secretoValido(env);
  const limpio = normalizarEmail(email);
  if (!secreto || !limpio) return null;
  const t = await firmarBaja(secreto, limpio);
  const ruta = config.rutaBaja ?? RUTAS_NEWSLETTER.baja;
  return `${origen}${ruta}?e=${codificarEmail(limpio)}&t=${t}`;
}

async function leerJson(request: Request): Promise<Record<string, unknown> | null> {
  const largo = Number(request.headers.get("Content-Length") || "0");
  if (largo > TAMANO_MAXIMO) return null;
  const texto = await request.text();
  if (texto.length > TAMANO_MAXIMO) return null;
  try {
    const d = JSON.parse(texto || "{}");
    return d && typeof d === "object" && !Array.isArray(d) ? d : null;
  } catch {
    return null;
  }
}

async function leerSuscriptor(env: EnvNewsletter, clave: string): Promise<Suscriptor | null> {
  const crudo = await env.REVIEWS_KV?.get(clave);
  if (!crudo) return null;
  try {
    return JSON.parse(crudo) as Suscriptor;
  } catch {
    return null;
  }
}

const RESPUESTA_SUSCRIBIR = {
  ok: true,
  message: "¡Listo! Te enviamos un correo para confirmar tu suscripción.",
};

// ───────────────────────────── SUSCRIBIR ─────────────────────────────

export async function suscribir(
  request: Request,
  env: EnvNewsletter,
  config: ConfigNewsletter
): Promise<Response> {
  if (!isSameOrigin(request)) return jsonResponse(403, { message: "Origen no permitido." });

  const secreto = secretoValido(env);
  if (!secreto || !env.REVIEWS_KV) {
    console.error("[newsletter] falta NEWSLETTER_SECRET (mín. 32) o REVIEWS_KV");
    return jsonResponse(503, { message: "La suscripción no está disponible ahora." });
  }

  const cuerpo = await leerJson(request);
  if (!cuerpo) return jsonResponse(400, { message: "Solicitud inválida." });

  if (typeof cuerpo[HONEYPOT_FIELD] === "string" && cuerpo[HONEYPOT_FIELD]) {
    return jsonResponse(200, RESPUESTA_SUSCRIBIR);
  }

  const email = normalizarEmail(cuerpo.email);
  if (!email) {
    return jsonResponse(400, {
      message: "Revisa tu correo electrónico.",
      fieldErrors: { email: ["Ingresa un correo válido."] },
    });
  }
  if (cuerpo.aceptaPolitica !== true) {
    return jsonResponse(400, {
      message: "Debes aceptar la política de privacidad.",
      fieldErrors: { aceptaPolitica: ["Debes aceptar la política de privacidad."] },
    });
  }

  const ip = getClientIp(request);
  const tope = config.rateLimit ?? { max: 5, ventanaSeg: 600 };
  if (!(await checkRateLimit(env.REVIEWS_KV, `news:ip:${ip}`, tope.max, tope.ventanaSeg))) {
    return jsonResponse(429, { message: "Demasiados intentos. Intenta más tarde." });
  }

  const token = typeof cuerpo.turnstileToken === "string" ? cuerpo.turnstileToken : "";
  const turnstile = await verifyTurnstile(token, limpiarVariable(env.TURNSTILE_SECRET_KEY), ip);
  if (!turnstile.success) {
    console.error(
      "[newsletter] Turnstile rechazó:",
      JSON.stringify(turnstile.errorCodes ?? ["sin-codigo"])
    );
    return jsonResponse(400, {
      message: "No pudimos verificar que eres una persona. Intenta de nuevo.",
      fieldErrors: { turnstileToken: ["Completa la verificación."] },
    });
  }

  const clave = await claveSuscriptor(secreto, email);
  const existente = await leerSuscriptor(env, clave);
  // Ya activo: misma respuesta, sin correo (no se revela nada).
  if (existente?.estado === "activo") return jsonResponse(200, RESPUESTA_SUSCRIBIR);

  // Tope por correo: que nadie use el formulario para bombardear un buzón.
  const hashCorreo = clave.slice(PREFIJO_SUSCRIPTOR.length);
  if (!(await checkRateLimit(env.REVIEWS_KV, `news:mail:${hashCorreo}`, 3, 86400))) {
    return jsonResponse(200, RESPUESTA_SUSCRIBIR);
  }

  const horas = config.horasConfirmacion ?? 48;
  const registro: Suscriptor = {
    email,
    estado: "pendiente",
    creado: existente?.creado ?? new Date().toISOString(),
  };
  await env.REVIEWS_KV.put(clave, JSON.stringify(registro), {
    expirationTtl: horas * 3600,
  });

  const vence = Math.floor(Date.now() / 1000) + horas * 3600;
  const firma = await firmarConfirmacion(secreto, email, vence);
  const origen = new URL(request.url).origin;
  const enlace =
    `${origen}${config.rutaConfirmar ?? RUTAS_NEWSLETTER.confirmar}` +
    `?e=${codificarEmail(email)}&v=${vence}&t=${firma}`;

  const envio = await enviarCorreo(env, {
    para: email,
    subject: `Confirma tu suscripción a ${config.nombreSitio}`,
    html: correoConfirmacion(config, enlace),
    remitentePorDefecto: config.remitentePorDefecto,
  });
  if (envio.simulated) {
    // Solo en modo demo (sin RESEND_API_KEY) se deja el enlace en el
    // registro, para poder probar. Con clave real nunca se registra.
    console.log("[newsletter:demo] enlace de confirmación:", enlace);
  }

  return jsonResponse(200, RESPUESTA_SUSCRIBIR);
}

// ───────────────────────────── CONFIRMAR ─────────────────────────────

export async function confirmar(
  request: Request,
  env: EnvNewsletter,
  config: ConfigNewsletter
): Promise<Response> {
  if (!isSameOrigin(request)) return jsonResponse(403, { message: "Origen no permitido." });
  const secreto = secretoValido(env);
  if (!secreto || !env.REVIEWS_KV) {
    return jsonResponse(503, { message: "No disponible ahora." });
  }
  const cuerpo = await leerJson(request);
  const email = decodificarEmail(cuerpo?.e);
  const vence = Number(cuerpo?.v);
  const firma = typeof cuerpo?.t === "string" ? cuerpo.t : "";
  const invalido = jsonResponse(400, {
    message: "El enlace no es válido o ya venció. Suscríbete de nuevo.",
  });
  if (!email || !Number.isInteger(vence) || !/^[0-9a-f]{64}$/.test(firma)) return invalido;

  const esperada = await firmarConfirmacion(secreto, email, vence);
  if (!compararSeguro(firma, esperada)) return invalido;
  if (vence < Math.floor(Date.now() / 1000)) return invalido;

  const clave = await claveSuscriptor(secreto, email);
  const existente = await leerSuscriptor(env, clave);
  if (existente?.estado === "activo") {
    return jsonResponse(200, { ok: true, message: "Tu suscripción ya estaba confirmada." });
  }

  const registro: Suscriptor = {
    email,
    estado: "activo",
    creado: existente?.creado ?? new Date().toISOString(),
    confirmado: new Date().toISOString(),
  };
  await env.REVIEWS_KV.put(clave, JSON.stringify(registro));

  if (config.avisarAdmin) {
    await sendNotificationEmail(env, {
      subject: `Nueva suscripción al newsletter de ${config.nombreSitio}`,
      html: `<p>Se suscribió: <strong>${escapeHtml(email)}</strong></p>`,
      remitentePorDefecto: config.remitentePorDefecto,
    });
  }

  return jsonResponse(200, { ok: true, message: "¡Suscripción confirmada! Gracias." });
}

// ──────────────────────────────── BAJA ────────────────────────────────

export async function darDeBaja(
  request: Request,
  env: EnvNewsletter
): Promise<Response> {
  const secreto = secretoValido(env);
  if (!secreto || !env.REVIEWS_KV) {
    return jsonResponse(503, { message: "No disponible ahora." });
  }

  // Acepta el JSON de la página y también el "List-Unsubscribe-Post" de un
  // clic de los programas de correo (RFC 8058), que llega con e/t en la URL.
  const url = new URL(request.url);
  let e: unknown = url.searchParams.get("e");
  let t: unknown = url.searchParams.get("t");
  const tipo = request.headers.get("Content-Type") || "";
  if (tipo.includes("application/json")) {
    if (!isSameOrigin(request)) return jsonResponse(403, { message: "Origen no permitido." });
    const cuerpo = await leerJson(request);
    e = cuerpo?.e;
    t = cuerpo?.t;
  }

  const email = decodificarEmail(e);
  const firma = typeof t === "string" ? t : "";
  if (!email || !/^[0-9a-f]{64}$/.test(firma)) {
    return jsonResponse(400, { message: "El enlace no es válido." });
  }
  const esperada = await firmarBaja(secreto, email);
  if (!compararSeguro(firma, esperada)) {
    return jsonResponse(400, { message: "El enlace no es válido." });
  }

  await env.REVIEWS_KV.delete(await claveSuscriptor(secreto, email));
  return jsonResponse(200, {
    ok: true,
    message: "Listo. Ya no recibirás más correos nuestros.",
  });
}

// ───────────────────────────── EXPORTAR ─────────────────────────────

/** Neutraliza fórmulas al abrir el CSV en Excel/Sheets (=, +, -, @). */
export function celdaCsv(valor: string): string {
  let v = valor.replace(/"/g, '""');
  if (/^[=+\-@\t\r]/.test(v)) v = "'" + v;
  return `"${v}"`;
}

export async function exportar(request: Request, env: EnvNewsletter): Promise<Response> {
  const esperado = limpiarVariable(env.NEWSLETTER_EXPORT_TOKEN);
  const enviado = (request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (esperado.length < LARGO_MINIMO_SECRETO || !compararSeguro(enviado, esperado)) {
    return new Response("No autorizado", { status: 401 });
  }
  if (!env.REVIEWS_KV) return new Response("Sin almacén", { status: 503 });

  return respuestaCsv(await listarActivos(env));
}

/** Suscriptores confirmados (lo usan la exportación y el panel). */
export async function listarActivos(env: EnvNewsletter): Promise<Suscriptor[]> {
  if (!env.REVIEWS_KV) return [];
  const { keys } = await env.REVIEWS_KV.list({ prefix: PREFIJO_SUSCRIPTOR, limit: 1000 });
  const activos: Suscriptor[] = [];
  for (const { name } of keys) {
    const s = await leerSuscriptor(env, name);
    if (s?.estado === "activo") activos.push(s);
  }
  return activos;
}

export function respuestaCsv(activos: Suscriptor[]): Response {
  const filas = ["email,confirmado", ...activos.map((s) => `${celdaCsv(s.email)},${celdaCsv(s.confirmado ?? "")}`)];
  return new Response(filas.join("\n") + "\n", {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="suscriptores.csv"',
      "Cache-Control": "no-store",
    },
  });
}
