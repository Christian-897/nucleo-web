/**
 * MOTOR del pago libre: arma la config del módulo `pago` para cobros de
 * monto acordado (anticipo, saldo o extra). `pago` ya se encarga de lo
 * delicado: orden aleatoria, monto esperado guardado en KV, verificación
 * del monto al confirmar, firmas de los webhooks e idempotencia.
 *
 * Aquí se suma lo propio de un monto escrito por una persona:
 *  - Turnstile y un monto mínimo: un formulario de monto libre es el blanco
 *    favorito de quienes prueban tarjetas robadas con cobros chicos.
 *  - El monto lo valida el servidor (entero, mínimo y máximo) y queda
 *    guardado; lo que se confirma es exactamente ese monto.
 *  - Al confirmarse: queda en el panel y sale un correo al negocio y otro a
 *    quien pagó. Los correos nunca hacen fallar la confirmación.
 */
import { checkRateLimit, getClientIp, verifyTurnstile } from "../../core/seguridad";
import { enviarCorreo, sendNotificationEmail } from "../../core/correo";
import { HONEYPOT_FIELD } from "../../core/validar";
import type { ConfigPago, PedidoGuardado } from "../pago/config";
import { ErrorPedido, type Proveedor } from "../pago/tipos";
import { conceptosDe, type ConfigPagoLibre, type EnvPagoLibre } from "./config";
import { validarPagoLibre } from "./esquema";
import { correoNegocio, correoPagador } from "./plantilla-correo";

/** Lo que queda guardado de cada pago confirmado (lo ve el panel). */
export interface PagoLibreRegistrado {
  orden: string;
  fecha: string;
  nombre: string;
  email: string;
  concepto: string;
  conceptoLabel: string;
  detalle: string;
  monto: number;
  proveedor: Proveedor;
}

interface MetadataPagoLibre {
  tipo: "pago-libre";
  nombre: string;
  concepto: string;
  conceptoLabel: string;
  detalle: string;
  origen: string;
  [k: string]: unknown;
}

const PREFIJO = "pagolibre:reg:";
const claveHecho = (orden: string) => `pagolibre-hecho:${orden}`;
/** Las claves de KV se listan en orden alfabético: así salen primero los más nuevos. */
const claveRegistro = (fechaMs: number, orden: string) => `${PREFIJO}${String(9_999_999_999_999 - fechaMs).padStart(13, "0")}:${orden}`;

export function crearConfigPagoLibre(config: ConfigPagoLibre): ConfigPago {
  const conceptos = conceptosDe(config);
  const retencionDias = config.retencionDias ?? 400;
  return {
    proveedores: config.proveedores,
    retencionDias,
    async prepararPedido(cuerpo, env, request) {
      const e = env as EnvPagoLibre;
      // Campo trampa: un bot lo llena. Se rechaza con un mensaje neutro.
      if (typeof cuerpo[HONEYPOT_FIELD] === "string" && cuerpo[HONEYPOT_FIELD]) {
        console.warn("[pago-libre] campo trampa lleno: se ignora");
        throw new ErrorPedido("No se pudo preparar el pago.");
      }
      const ip = getClientIp(request);
      const tope = config.rateLimit ?? { max: 5, ventanaSeg: 600 };
      if (!(await checkRateLimit(e.REVIEWS_KV, `pagolibre-ip:${ip}`, tope.max, tope.ventanaSeg))) {
        throw new ErrorPedido("Demasiados intentos. Espera unos minutos.");
      }
      const v = validarPagoLibre(cuerpo, config);
      if (!v.ok) {
        throw new ErrorPedido("Revisa los campos marcados.", v.fieldErrors);
      }
      const token = typeof cuerpo.turnstileToken === "string" ? cuerpo.turnstileToken : "";
      const t = await verifyTurnstile(token, e.TURNSTILE_SECRET_KEY || "", ip);
      if (!t.success) {
        console.error("[pago-libre] Turnstile rechazó:", JSON.stringify(t.errorCodes ?? ["sin-codigo"]), "| largo de la clave:", (e.TURNSTILE_SECRET_KEY || "").length);
        throw new ErrorPedido("No pudimos comprobar que no eres un robot. Espera unos segundos y vuelve a intentarlo.");
      }
      const d = v.datos;
      const conceptoLabel = conceptos.find((c) => c.id === d.concepto)?.label ?? d.concepto;
      const metadata: MetadataPagoLibre = {
        tipo: "pago-libre",
        nombre: d.nombre,
        concepto: d.concepto,
        conceptoLabel,
        detalle: d.detalle,
        origen: new URL(request.url).origin,
      };
      return {
        descripcion: `${conceptoLabel} — ${config.nombreSitio}`,
        monto: d.monto,
        email: d.email,
        metadata,
      };
    },
    async onConfirmado(confirmacion, env) {
      const pedido = confirmacion.pedido as PedidoGuardado | null;
      const meta = pedido?.metadata as MetadataPagoLibre | undefined;
      if (!pedido || meta?.tipo !== "pago-libre") {
        console.error(`[pago-libre] pago ${confirmacion.orden} confirmado sin datos guardados`);
        return;
      }
      const kv = env.REVIEWS_KV;
      // Segunda barrera de idempotencia (además de la de `pago`).
      if (kv && (await kv.get(claveHecho(confirmacion.orden)))) return;
      const ahora = Date.now();
      const registro: PagoLibreRegistrado = {
        orden: confirmacion.orden,
        fecha: new Date(ahora).toISOString(),
        nombre: meta.nombre,
        email: pedido.email,
        concepto: meta.concepto,
        conceptoLabel: meta.conceptoLabel,
        detalle: meta.detalle,
        monto: confirmacion.monto,
        proveedor: confirmacion.proveedor,
      };
      const ttl = retencionDias * 86400;
      // Si KV falla, se lanza el error: `pago` responde 500 y el proveedor reintenta.
      await kv?.put(claveRegistro(ahora, registro.orden), JSON.stringify(registro), { expirationTtl: ttl });
      await kv?.put(claveHecho(registro.orden), "1", { expirationTtl: ttl });

      try {
        const n = correoNegocio(config, registro, meta.origen);
        await sendNotificationEmail(env, { subject: n.asunto, html: n.html, replyTo: registro.email, remitentePorDefecto: config.remitentePorDefecto });
        const p = correoPagador(config, registro);
        await enviarCorreo(env, { para: registro.email, subject: p.asunto, html: p.html, replyTo: env.ADMIN_NOTIFY_EMAIL, remitentePorDefecto: config.remitentePorDefecto });
      } catch (e) {
        console.error("[pago-libre] no salió un correo (el pago igual quedó confirmado)", e);
      }
    },
  };
}

/** Pagos confirmados, del más nuevo al más antiguo (para el panel). */
export async function listarPagosLibres(
  env: EnvPagoLibre,
  limite = 100
): Promise<{ pagos: PagoLibreRegistrado[]; hayMas: boolean }> {
  const kv = env.REVIEWS_KV;
  if (!kv) return { pagos: [], hayMas: false };
  const tope = Math.min(Math.max(1, limite), 999);
  const r = await kv.list({ prefix: PREFIJO, limit: tope + 1 });
  const pagos: PagoLibreRegistrado[] = [];
  for (const k of r.keys.slice(0, tope)) {
    const crudo = await kv.get(k.name);
    if (!crudo) continue;
    try {
      const p = JSON.parse(crudo) as PagoLibreRegistrado;
      if (p && typeof p === "object" && typeof p.orden === "string") pagos.push(p);
    } catch {
      console.error("[pago-libre] registro ilegible:", k.name);
    }
  }
  return { pagos, hayMas: r.keys.length > tope };
}
