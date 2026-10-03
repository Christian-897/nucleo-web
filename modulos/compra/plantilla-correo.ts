import { escapeHtml } from "../../core/validar";
import { formatearPrecio } from "../carrito/formato";
import type { LineaValidada } from "../carrito/tipos";
import type { ConfigCompra } from "./config";
import type { Comprador } from "./esquema";

export interface DatosCorreoPedido {
  orden: string;
  monto: number;
  lineas: LineaValidada[];
  comprador: Comprador;
  requiereDespacho: boolean;
  tieneDigitales: boolean;
}

function marco(config: ConfigCompra, cuerpo: string): string {
  const acento = config.coloresCorreo?.acento ?? "#B5577A";
  const fondo = config.coloresCorreo?.fondo ?? "#FBF5F2";
  return `<!doctype html><html lang="es"><body style="margin:0;background:${fondo};font-family:Arial,sans-serif;color:#3a2a33">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" style="max-width:560px;background:#ffffff;border-radius:12px;padding:28px">
<tr><td><h1 style="margin:0 0 16px;font-size:22px;color:${acento}">${escapeHtml(config.nombreSitio)}</h1>
${cuerpo}</td></tr></table></td></tr></table></body></html>`;
}

function tablaLineas(d: DatosCorreoPedido): string {
  const filas = d.lineas
    .map(
      (l) => `<tr><td style="padding:6px 0">${escapeHtml(l.nombre)} × ${l.cantidad}</td>
<td style="padding:6px 0;text-align:right">${formatearPrecio(l.subtotal)}</td></tr>`
    )
    .join("");
  return `<table role="presentation" width="100%" style="border-collapse:collapse;font-size:15px;border-top:1px solid #eee;border-bottom:1px solid #eee;margin:12px 0">
${filas}<tr><td style="padding:8px 0;font-weight:bold">Total pagado</td>
<td style="padding:8px 0;text-align:right;font-weight:bold">${formatearPrecio(d.monto)}</td></tr></table>`;
}

const p = (t: string) => `<p style="font-size:15px;line-height:1.5;margin:8px 0">${t}</p>`;

export function correoComprador(config: ConfigCompra, d: DatosCorreoPedido) {
  const partes = [
    p(`Hola ${escapeHtml(d.comprador.nombre)}, ¡gracias por tu compra!`),
    p(`Tu pago fue confirmado. Número de pedido: <strong>${escapeHtml(d.orden)}</strong>`),
    tablaLineas(d),
  ];
  if (d.requiereDespacho) {
    partes.push(
      p(`<strong>${escapeHtml(config.envio.modalidad)}</strong>: ${escapeHtml(config.envio.detalle)}`),
      p(
        `Dirección: ${escapeHtml(d.comprador.direccion ?? "")}, ${escapeHtml(d.comprador.comuna ?? "")}, ${escapeHtml(d.comprador.region ?? "")}.`
      )
    );
  }
  if (d.tieneDigitales) {
    partes.push(
      p(
        escapeHtml(
          config.mensajeDigital ??
            "Te enviaremos el material de tus cursos y patrones a este mismo correo dentro de las próximas 24 horas hábiles."
        )
      )
    );
  }
  partes.push(p("Si tienes cualquier duda, responde este correo."));
  return {
    asunto: `Tu pedido en ${config.nombreSitio} está confirmado`,
    html: marco(config, partes.join("\n")),
  };
}

export function correoTienda(config: ConfigCompra, d: DatosCorreoPedido) {
  const c = d.comprador;
  const datos = [
    `Nombre: ${escapeHtml(c.nombre)}`,
    `Correo: ${escapeHtml(c.email)}`,
    `Teléfono: ${escapeHtml(c.telefono)}`,
    d.requiereDespacho
      ? `Despacho: ${escapeHtml(c.direccion ?? "")}, ${escapeHtml(c.comuna ?? "")}, ${escapeHtml(c.region ?? "")}`
      : "Sin despacho (solo productos digitales)",
    c.notas ? `Notas: ${escapeHtml(c.notas)}` : "",
  ]
    .filter(Boolean)
    .join("<br>");
  const pendientes = [
    d.requiereDespacho ? "Preparar y despachar los productos físicos." : "",
    d.tieneDigitales ? "Enviar por correo el material de los cursos o patrones." : "",
  ]
    .filter(Boolean)
    .map((t) => `<li>${t}</li>`)
    .join("");
  return {
    asunto: `Nueva venta ${formatearPrecio(d.monto)} — pedido ${d.orden}`,
    html: marco(
      config,
      [
        p(`¡Nueva venta pagada! Pedido <strong>${escapeHtml(d.orden)}</strong>`),
        tablaLineas(d),
        p(datos),
        pendientes ? `<ul style="font-size:15px;line-height:1.5">${pendientes}</ul>` : "",
      ].join("\n")
    ),
  };
}
