/**
 * BOLETINES: correos a los suscriptores confirmados, escritos y enviados
 * desde el panel.
 *
 *  - Cada correo lleva SIEMPRE su enlace "Darme de baja" (firmado, uno por
 *    persona) y las cabeceras List-Unsubscribe / List-Unsubscribe-Post, para
 *    que Gmail y Outlook muestren su botón "Cancelar suscripción" (RFC 8058).
 *    No hay forma de enviar un boletín sin ellos.
 *  - Se envía por lotes con la API de Resend (hasta 100 correos por llamada).
 *    El plan gratis de Resend permite 100 correos al día: si se llega al
 *    tope, el envío se detiene y sigue después ("Seguir enviando"), sin
 *    repetirle el correo a quien ya lo recibió.
 *  - Lo que escribe la dueña se escapa: no puede colar HTML ni scripts.
 *
 * Guardado en KV: `news:bol:<id>` (el boletín y a quiénes ya les llegó, como
 * huella corta del correo, no el correo).
 */
import { hmacSha256Hex } from "../../core/cripto";
import { limpiarVariable } from "../../core/correo";
import { escapeHtml } from "../../core/validar";
import type { ConfigNewsletter, EnvNewsletter } from "./config";
import { enlaceBaja, listarActivos } from "./servidor";

export const PREFIJO_BOLETIN = "news:bol:";

export const LIMITES_BOLETIN = {
  asunto: 120,
  titulo: 120,
  texto: 6000,
  botonTexto: 40,
  enlace: 300,
  /** Boletines guardados (los más viejos se borran solos). */
  guardados: 30,
  /** Correos por llamada a Resend (su máximo). */
  porLote: 100,
} as const;

export type EstadoBoletin = "borrador" | "enviando" | "enviado";

export interface Boletin {
  id: string;
  asunto: string;
  titulo: string;
  texto: string;
  /** Foto del sitio: /media/… (subida al panel) o /img/…. */
  imagen?: string;
  boton?: { texto: string; enlace: string };
  estado: EstadoBoletin;
  creado: string;
  actualizado: string;
  /** Cuándo terminó de enviarse. */
  enviado?: string;
  /** A cuántos les llegó. */
  enviados: number;
  /** Huellas cortas de los correos que ya lo recibieron (no los correos). */
  entregados?: string[];
}

export interface DatosBoletin {
  asunto?: unknown;
  titulo?: unknown;
  texto?: unknown;
  imagen?: unknown;
  boton?: unknown;
}

// ───────────────────────────── validar ─────────────────────────────

const texto = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\r\n?/g, "\n").trim().slice(0, max + 1) : "");

export function imagenBoletinValida(v: unknown): v is string {
  return typeof v === "string" && /^\/(media|img)\/[A-Za-z0-9/_.-]{1,200}$/.test(v) && !v.includes("..");
}

/** Página del sitio ("/tienda/") o dirección https. Nada de javascript: ni //otro. */
export function enlaceBoletinValido(v: unknown): v is string {
  if (typeof v !== "string" || !v || v.length > LIMITES_BOLETIN.enlace) return false;
  if (v.startsWith("/")) return !v.startsWith("//") && !/[\s\\]/.test(v);
  try {
    const u = new URL(v);
    return u.protocol === "https:" && !!u.hostname;
  } catch {
    return false;
  }
}

/** Revisa y limpia lo que llega del panel. Errores con el nombre del campo. */
export function validarBoletin(d: DatosBoletin): {
  ok: boolean;
  datos?: Pick<Boletin, "asunto" | "titulo" | "texto" | "imagen" | "boton">;
  errores: Record<string, string>;
} {
  const errores: Record<string, string> = {};
  const asunto = texto(d.asunto, LIMITES_BOLETIN.asunto);
  const titulo = texto(d.titulo, LIMITES_BOLETIN.titulo);
  const cuerpo = texto(d.texto, LIMITES_BOLETIN.texto);
  if (!asunto) errores.asunto = "Escribe el asunto (lo que se ve en la bandeja de entrada).";
  else if (asunto.length > LIMITES_BOLETIN.asunto) errores.asunto = `Máximo ${LIMITES_BOLETIN.asunto} caracteres.`;
  if (titulo.length > LIMITES_BOLETIN.titulo) errores.titulo = `Máximo ${LIMITES_BOLETIN.titulo} caracteres.`;
  if (!cuerpo) errores.texto = "Escribe el mensaje.";
  else if (cuerpo.length > LIMITES_BOLETIN.texto) errores.texto = `Máximo ${LIMITES_BOLETIN.texto} caracteres.`;

  let imagen: string | undefined;
  if (d.imagen !== undefined && d.imagen !== null && d.imagen !== "") {
    if (imagenBoletinValida(d.imagen)) imagen = d.imagen;
    else errores.imagen = "Esa foto no es válida.";
  }

  let boton: Boletin["boton"];
  if (d.boton && typeof d.boton === "object") {
    const b = d.boton as Record<string, unknown>;
    const t = texto(b.texto, LIMITES_BOLETIN.botonTexto);
    const e = texto(b.enlace, LIMITES_BOLETIN.enlace);
    if (t || e) {
      if (!t) errores["boton.texto"] = "Escribe el texto del botón.";
      else if (t.length > LIMITES_BOLETIN.botonTexto) errores["boton.texto"] = `Máximo ${LIMITES_BOLETIN.botonTexto} caracteres.`;
      if (!enlaceBoletinValido(e)) errores["boton.enlace"] = "Usa una página del sitio (por ejemplo /tienda/) o una dirección que empiece con https://";
      if (!errores["boton.texto"] && !errores["boton.enlace"]) boton = { texto: t, enlace: e };
    }
  }

  const ok = Object.keys(errores).length === 0;
  return ok ? { ok, errores, datos: { asunto, titulo, texto: cuerpo, imagen, boton } } : { ok, errores };
}

// ───────────────────────────── correo ─────────────────────────────

/** Una dirección del sitio pasa a absoluta (los correos no entienden "/tienda/"). */
export function absoluta(origen: string, direccion: string): string {
  return direccion.startsWith("/") ? origen.replace(/\/+$/, "") + direccion : direccion;
}

/** Párrafos (línea en blanco) y saltos de línea; todo escapado. */
export function parrafosHtml(cuerpo: string): string {
  return cuerpo
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p style="font-size:16px;line-height:1.6;margin:0 0 14px">${escapeHtml(p).replace(/\n/g, "<br>")}</p>`)
    .join("\n");
}

/** HTML del boletín para una persona (con SU enlace de baja). */
export function correoBoletin(
  config: ConfigNewsletter,
  b: Pick<Boletin, "titulo" | "texto" | "imagen" | "boton">,
  origen: string,
  enlaceBajaPersona: string
): string {
  const acento = config.coloresCorreo?.acento ?? "#B5577A";
  const fondo = config.coloresCorreo?.fondo ?? "#FBF5F2";
  const nombre = escapeHtml(config.nombreSitio);
  const sitio = escapeHtml(origen);
  const imagen = b.imagen
    ? `<img src="${escapeHtml(absoluta(origen, b.imagen))}" alt="" width="456" style="display:block;width:100%;max-width:456px;height:auto;border-radius:10px;margin:0 0 20px">`
    : "";
  const titulo = b.titulo ? `<h2 style="margin:0 0 14px;font-size:22px;line-height:1.3;color:#3a2a33">${escapeHtml(b.titulo)}</h2>` : "";
  const boton = b.boton
    ? `<p style="margin:22px 0 6px"><a href="${escapeHtml(absoluta(origen, b.boton.enlace))}" style="background:${acento};color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:999px;font-weight:bold;display:inline-block">${escapeHtml(b.boton.texto)}</a></p>`
    : "";
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body style="margin:0;background:${fondo};font-family:Arial,sans-serif;color:#3a2a33">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" style="max-width:520px;background:#ffffff;border-radius:12px;padding:32px">
<tr><td>
<h1 style="margin:0 0 18px;font-size:20px;color:${acento}"><a href="${sitio}" style="color:${acento};text-decoration:none">${nombre}</a></h1>
${imagen}${titulo}${parrafosHtml(b.texto)}${boton}
</td></tr></table>
<p style="max-width:520px;font-size:12px;line-height:1.5;color:#7a6871;margin:18px auto 0;text-align:center">
Recibes este correo porque te suscribiste a las novedades de ${nombre}.<br>
<a href="${escapeHtml(enlaceBajaPersona)}" style="color:#7a6871">Darme de baja</a>
</p>
</td></tr></table></body></html>`;
}

/** Cabeceras de baja de un clic: apuntan a la API (POST desde Gmail/Outlook). */
export function cabecerasBaja(enlacePagina: string, rutaApi = "/api/newsletter/baja"): Record<string, string> {
  const u = new URL(enlacePagina);
  const api = `${u.origin}${rutaApi}${u.search}`;
  return { "List-Unsubscribe": `<${api}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" };
}

// ───────────────────────────── guardar ─────────────────────────────

export function nuevoIdBoletin(ahora = new Date()): string {
  const azar = [...crypto.getRandomValues(new Uint8Array(4))].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${ahora.toISOString().slice(0, 10)}-${azar}`;
}

export function idBoletinValido(id: unknown): id is string {
  return typeof id === "string" && /^\d{4}-\d{2}-\d{2}-[0-9a-f]{8}$/.test(id);
}

export async function leerBoletin(env: EnvNewsletter, id: string): Promise<Boletin | null> {
  if (!idBoletinValido(id)) return null;
  const crudo = await env.REVIEWS_KV?.get(PREFIJO_BOLETIN + id);
  if (!crudo) return null;
  try {
    return JSON.parse(crudo) as Boletin;
  } catch {
    return null;
  }
}

export async function guardarBoletin(env: EnvNewsletter, b: Boletin): Promise<void> {
  await env.REVIEWS_KV?.put(PREFIJO_BOLETIN + b.id, JSON.stringify(b));
}

export async function borrarBoletin(env: EnvNewsletter, id: string): Promise<void> {
  if (idBoletinValido(id)) await env.REVIEWS_KV?.delete(PREFIJO_BOLETIN + id);
}

/** Los más nuevos primero. Borra los que pasen del tope de guardados. */
export async function listarBoletines(env: EnvNewsletter): Promise<Boletin[]> {
  if (!env.REVIEWS_KV) return [];
  const { keys } = await env.REVIEWS_KV.list({ prefix: PREFIJO_BOLETIN, limit: 200 });
  const todos: Boletin[] = [];
  for (const { name } of keys) {
    const b = await leerBoletin(env, name.slice(PREFIJO_BOLETIN.length));
    if (b) todos.push(b);
  }
  todos.sort((a, b) => b.creado.localeCompare(a.creado));
  for (const viejo of todos.splice(LIMITES_BOLETIN.guardados)) await borrarBoletin(env, viejo.id);
  return todos;
}

/** Lo que ve el panel (sin las huellas). */
export function resumenBoletin(b: Boletin) {
  const { entregados: _e, ...resto } = b;
  return resto;
}

// ───────────────────────── tope por día ─────────────────────────

const CLAVE_AJUSTES = "news:bolcfg";
const PREFIJO_DIA = "news:boldia:";
export const LIMITES_POR_DIA = { minimo: 1, maximo: 1000 } as const;

export interface AjustesBoletin {
  /** Correos de boletín por día (el resto del cupo queda para compras y confirmaciones). */
  porDia: number;
}

export function porDiaValido(v: unknown): v is number {
  return typeof v === "number" && Number.isInteger(v) && v >= LIMITES_POR_DIA.minimo && v <= LIMITES_POR_DIA.maximo;
}

export async function leerAjustes(env: EnvNewsletter, porDefecto: number): Promise<AjustesBoletin> {
  try {
    const crudo = await env.REVIEWS_KV?.get(CLAVE_AJUSTES);
    const a = crudo ? (JSON.parse(crudo) as Partial<AjustesBoletin>) : {};
    return { porDia: porDiaValido(a.porDia) ? a.porDia : porDefecto };
  } catch {
    return { porDia: porDefecto };
  }
}

export async function guardarAjustes(env: EnvNewsletter, a: AjustesBoletin): Promise<void> {
  await env.REVIEWS_KV?.put(CLAVE_AJUSTES, JSON.stringify(a));
}

/** Día como lo cuenta Resend: calendario UTC. */
const diaUtc = (ahora: Date) => ahora.toISOString().slice(0, 10);

/** Correos de boletín enviados hoy (día UTC, igual que el cupo de Resend). */
export async function enviadosHoy(env: EnvNewsletter, ahora = new Date()): Promise<number> {
  const n = Number(await env.REVIEWS_KV?.get(PREFIJO_DIA + diaUtc(ahora)));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

async function sumarHoy(env: EnvNewsletter, cuantos: number, ahora: Date): Promise<void> {
  const total = (await enviadosHoy(env, ahora)) + cuantos;
  await env.REVIEWS_KV?.put(PREFIJO_DIA + diaUtc(ahora), String(total), { expirationTtl: 3 * 86400 });
}

/** Hora local en que se reinicia el cupo (medianoche UTC), ej. "21:00". */
export function horaReinicio(zona = "America/Santiago", ahora = new Date()): string {
  const manana = new Date(Date.UTC(ahora.getUTCFullYear(), ahora.getUTCMonth(), ahora.getUTCDate() + 1));
  try {
    return new Intl.DateTimeFormat("es-CL", { timeZone: zona, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(manana);
  } catch {
    return "00:00 UTC";
  }
}

// ───────────────────────────── enviar ─────────────────────────────

export class ErrorBoletin extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

function claveResend(env: EnvNewsletter): string {
  const clave = limpiarVariable(env.RESEND_API_KEY);
  if (!clave) throw new ErrorBoletin("El correo del sitio no está conectado (falta RESEND_API_KEY).", 503);
  if (!/^[\x21-\x7e]+$/.test(clave)) throw new ErrorBoletin("La clave de Resend tiene caracteres inválidos. Vuelve a pegarla en Cloudflare.", 503);
  return clave;
}

function remitente(env: EnvNewsletter, config: ConfigNewsletter): string {
  return limpiarVariable(env.RESEND_FROM) || config.remitentePorDefecto || "Novedades <onboarding@resend.dev>";
}

async function huella(secreto: string, email: string): Promise<string> {
  return (await hmacSha256Hex(secreto, `boletin:${email}`)).slice(0, 16);
}

interface Correo {
  para: string;
  html: string;
  cabeceras: Record<string, string>;
}

/** Una llamada a la API de lotes de Resend. */
async function enviarLote(
  env: EnvNewsletter,
  config: ConfigNewsletter,
  asunto: string,
  correos: Correo[],
  fetcher: typeof fetch
): Promise<{ ok: boolean; status: number }> {
  const clave = claveResend(env);
  const de = remitente(env, config);
  const responder = limpiarVariable(env.ADMIN_NOTIFY_EMAIL) || undefined;
  try {
    const res = await fetcher("https://api.resend.com/emails/batch", {
      method: "POST",
      headers: { Authorization: `Bearer ${clave}`, "Content-Type": "application/json" },
      body: JSON.stringify(
        correos.map((c) => ({ from: de, to: [c.para], subject: asunto, html: c.html, reply_to: responder, headers: c.cabeceras }))
      ),
    });
    if (!res.ok) console.error("[boletin:error]", res.status, (await res.text()).slice(0, 300));
    return { ok: res.ok, status: res.status };
  } catch (e) {
    console.error("[boletin:error] no se pudo contactar a Resend", e);
    return { ok: false, status: 0 };
  }
}

function secreto(env: EnvNewsletter): string {
  const s = limpiarVariable(env.NEWSLETTER_SECRET);
  if (s.length < 32) throw new ErrorBoletin("El newsletter no está activo (falta NEWSLETTER_SECRET).", 503);
  return s;
}

/** Un correo de prueba a ADMIN_NOTIFY_EMAIL, igual al que recibirán todos. */
export async function enviarPrueba(
  env: EnvNewsletter,
  config: ConfigNewsletter,
  b: Boletin,
  origen: string,
  fetcher: typeof fetch = fetch
): Promise<string> {
  const para = limpiarVariable(env.ADMIN_NOTIFY_EMAIL);
  if (!para) throw new ErrorBoletin("Falta el correo de avisos (ADMIN_NOTIFY_EMAIL) para mandarte la prueba.", 503);
  secreto(env);
  const baja = await enlaceBaja(env, origen, para, config);
  if (!baja) throw new ErrorBoletin("No se pudo armar el enlace de baja.", 500);
  const r = await enviarLote(env, config, `[Prueba] ${b.asunto}`, [{ para, html: correoBoletin(config, b, origen, baja), cabeceras: cabecerasBaja(baja) }], fetcher);
  if (!r.ok) throw new ErrorBoletin(mensajeResend(r.status), 502);
  return para;
}

function mensajeResend(status: number): string {
  if (status === 429) return "Se alcanzó el límite de correos del plan de Resend por hoy. Sigue mañana.";
  if (status === 401 || status === 403) return "Resend rechazó la clave o el remitente. Revisa RESEND_API_KEY y RESEND_FROM.";
  if (status === 422) return "Resend rechazó el correo (remitente o dominio sin verificar).";
  return "No se pudo enviar. Intenta de nuevo en un rato.";
}

export interface ProgresoEnvio {
  enviados: number;
  pendientes: number;
  total: number;
  /** Se detuvo antes de terminar (por ejemplo, el tope diario de Resend). */
  detenido?: string;
}

/**
 * Envía el boletín a los suscriptores confirmados que todavía no lo
 * recibieron, hasta `maximo` correos en esta llamada. Si algo falla, se
 * detiene: quien no lo recibió queda pendiente para "Seguir enviando".
 */
export async function enviarBoletin(
  env: EnvNewsletter,
  config: ConfigNewsletter,
  b: Boletin,
  origen: string,
  opciones: { maximo?: number; fetch?: typeof fetch; ahora?: Date } = {}
): Promise<ProgresoEnvio> {
  const s = secreto(env);
  claveResend(env);
  const fetcher = opciones.fetch ?? fetch;
  const maximo = Math.max(1, Math.min(opciones.maximo ?? LIMITES_BOLETIN.porLote, 1000));

  const activos = await listarActivos(env);
  const ya = new Set(b.entregados ?? []);
  const faltan: { email: string; h: string }[] = [];
  for (const a of activos) {
    const h = await huella(s, a.email);
    if (!ya.has(h)) faltan.push({ email: a.email, h });
  }

  let detenido: string | undefined;
  let nuevos = 0;
  const turno = faltan.slice(0, maximo);
  for (let i = 0; i < turno.length; i += LIMITES_BOLETIN.porLote) {
    const grupo = turno.slice(i, i + LIMITES_BOLETIN.porLote);
    const correos: Correo[] = [];
    for (const p of grupo) {
      const baja = (await enlaceBaja(env, origen, p.email, config))!;
      correos.push({ para: p.email, html: correoBoletin(config, b, origen, baja), cabeceras: cabecerasBaja(baja) });
    }
    const r = await enviarLote(env, config, b.asunto, correos, fetcher);
    if (!r.ok) {
      detenido = mensajeResend(r.status);
      break;
    }
    for (const p of grupo) ya.add(p.h);
    nuevos += grupo.length;
    await sumarHoy(env, grupo.length, opciones.ahora ?? new Date());
  }

  const ahora = (opciones.ahora ?? new Date()).toISOString();
  const pendientes = faltan.length - nuevos;
  b.entregados = [...ya];
  b.enviados += nuevos;
  b.estado = pendientes === 0 ? "enviado" : "enviando";
  if (pendientes === 0) b.enviado = ahora;
  b.actualizado = ahora;
  await guardarBoletin(env, b);
  return { enviados: b.enviados, pendientes, total: activos.length, detenido };
}
