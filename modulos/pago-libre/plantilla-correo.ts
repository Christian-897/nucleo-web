import { escapeHtml } from "../../core/validar";
import type { ConfigPagoLibre } from "./config";
import { formatearMonto } from "./monto";
import type { PagoLibreRegistrado } from "./servidor";

const PROVEEDOR: Record<string, string> = { flow: "Flow", mercadopago: "Mercado Pago" };

function marco(config: ConfigPagoLibre, titulo: string, filas: [string, string][], pie: string): string {
  const c = { acento: "#111111", fondo: "#F7F6F4", tinta: "#111111", ...config.coloresCorreo };
  const tabla = filas
    .filter(([, v]) => v)
    .map(
      ([k, v]) =>
        `<tr><td style="padding:6px 12px 6px 0;color:#666;white-space:nowrap;vertical-align:top">${escapeHtml(k)}</td><td style="padding:6px 0;color:${c.tinta}">${escapeHtml(v)}</td></tr>`
    )
    .join("");
  return `<!doctype html><html lang="es"><body style="margin:0;background:${c.fondo};font-family:Arial,Helvetica,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fff;border-radius:12px;padding:28px">
<tr><td style="border-top:4px solid ${c.acento};padding-top:18px"><h1 style="margin:0 0 16px;font-size:20px;color:${c.tinta}">${escapeHtml(titulo)}</h1>
<table role="presentation" cellpadding="0" cellspacing="0" style="font-size:15px">${tabla}</table>
<p style="margin:20px 0 0;font-size:14px;color:#555">${pie}</p></td></tr></table>
<p style="font-size:12px;color:#888">${escapeHtml(config.nombreSitio)}</p></td></tr></table></body></html>`;
}

export function correoNegocio(config: ConfigPagoLibre, p: PagoLibreRegistrado, origen: string) {
  const panel = escapeHtml(origen + (config.rutaPanel ?? "/admin/"));
  return {
    asunto: `Pago recibido: ${formatearMonto(p.monto)} de ${p.nombre}`,
    html: marco(
      config,
      `Pago recibido: ${formatearMonto(p.monto)}`,
      [
        ["Nombre", p.nombre],
        ["Correo", p.email],
        ["Concepto", p.conceptoLabel],
        ["Detalle", p.detalle],
        ["Medio", PROVEEDOR[p.proveedor] ?? p.proveedor],
        ["Orden", p.orden],
      ],
      `El pago ya está confirmado por ${escapeHtml(PROVEEDOR[p.proveedor] ?? p.proveedor)}. También lo ves en <a href="${panel}">el panel</a>.`
    ),
  };
}

export function correoPagador(config: ConfigPagoLibre, p: PagoLibreRegistrado) {
  return {
    asunto: `Recibimos tu pago de ${formatearMonto(p.monto)} — ${config.nombreSitio}`,
    html: marco(
      config,
      `¡Gracias, ${p.nombre.split(" ")[0]}! Recibimos tu pago`,
      [
        ["Monto", formatearMonto(p.monto)],
        ["Concepto", p.conceptoLabel],
        ["Detalle", p.detalle],
        ["Medio", PROVEEDOR[p.proveedor] ?? p.proveedor],
        ["N.º de orden", p.orden],
      ],
      "Guarda este correo como comprobante. Si tienes dudas, responde este mensaje."
    ),
  };
}
