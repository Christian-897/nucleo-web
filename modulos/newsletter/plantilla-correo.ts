import { escapeHtml } from "../../core/validar";
import type { ConfigNewsletter } from "./config";

/** Correo con el botón para confirmar la suscripción. */
export function correoConfirmacion(config: ConfigNewsletter, enlace: string): string {
  const acento = config.coloresCorreo?.acento ?? "#B5577A";
  const fondo = config.coloresCorreo?.fondo ?? "#FBF5F2";
  const nombre = escapeHtml(config.nombreSitio);
  const url = escapeHtml(enlace);
  return `<!doctype html><html lang="es"><body style="margin:0;background:${fondo};font-family:Arial,sans-serif;color:#3a2a33">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" style="max-width:520px;background:#ffffff;border-radius:12px;padding:32px">
<tr><td>
<h1 style="margin:0 0 12px;font-size:22px;color:${acento}">${nombre}</h1>
<p style="font-size:16px;line-height:1.5">Hola, gracias por querer recibir nuestras novedades.</p>
<p style="font-size:16px;line-height:1.5">Para terminar, confirma tu correo con este botón:</p>
<p style="margin:24px 0"><a href="${url}" style="background:${acento};color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:999px;font-weight:bold;display:inline-block">Confirmar suscripción</a></p>
<p style="font-size:13px;color:#7a6871;line-height:1.5">Si no fuiste tú, ignora este correo: no te suscribiremos.</p>
</td></tr></table></td></tr></table></body></html>`;
}
