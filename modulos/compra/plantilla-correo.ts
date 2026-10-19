import { escapeHtml } from "../../core/validar";
import { formatearPrecio } from "../carrito/formato";
import type { LineaValidada } from "../carrito/tipos";
import type { ConfigCompra } from "./config";
import type { Comprador } from "./esquema";
import type { DespachoPedido } from "./servidor";
import { nombreZona, textoRetiro } from "../despacho/calculo";

export interface DatosCorreoPedido {
  orden: string;
  monto: number;
  lineas: LineaValidada[];
  comprador: Comprador;
  requiereDespacho: boolean;
  tieneDigitales: boolean;
  despacho?: DespachoPedido;
}

/** "$4.500 (Regiones)", "Gratis (compra sobre el monto)" o null si es por pagar. */
function textoDespachoCobrado(d: DatosCorreoPedido): string | null {
  const x = d.despacho;
  if (!d.requiereDespacho || !x) return null;
  if (x.forma === "retiro") return x.retiro ? `Sin costo (${textoRetiro(x.retiro)})` : "Sin costo (retiro)";
  const zona = nombreZona(x.zona);
  const enZona = zona ? ` (${zona})` : "";
  if (x.forma === "al-recibir") return `Por pagar al recibir${enZona}`;
  if (x.costo > 0) return `${formatearPrecio(x.costo)}${enZona}`;
  return x.gratisPorMonto ? "Gratis (tu compra superó el monto para despacho gratis)" : "Gratis";
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
${filas}${
    textoDespachoCobrado(d)
      ? `<tr><td style="padding:6px 0">Despacho</td><td style="padding:6px 0;text-align:right">${escapeHtml(textoDespachoCobrado(d)!)}</td></tr>`
      : ""
  }<tr><td style="padding:8px 0;font-weight:bold">Total pagado</td>
<td style="padding:8px 0;text-align:right;font-weight:bold">${formatearPrecio(d.monto)}</td></tr></table>`;
}

const p = (t: string) => `<p style="font-size:15px;line-height:1.5;margin:8px 0">${t}</p>`;

export function correoComprador(config: ConfigCompra, d: DatosCorreoPedido) {
  const partes = [
    p(`Hola ${escapeHtml(d.comprador.nombre)}, ¡gracias por tu compra!`),
    p(`Tu pago fue confirmado. Número de pedido: <strong>${escapeHtml(d.orden)}</strong>`),
    tablaLineas(d),
  ];
  const r = d.despacho?.forma === "retiro" ? d.despacho.retiro : undefined;
  if (d.requiereDespacho && d.despacho?.forma === "retiro") {
    // El retiro: aquí sí va la dirección exacta (el pago ya está confirmado).
    partes.push(
      p(`<strong>${escapeHtml(r?.nombre ?? "Retiro")}</strong>${r?.comuna ? ` en ${escapeHtml(r.comuna)}` : ""}.`),
      r?.direccion ? p(`Dirección del retiro: <strong>${escapeHtml(r.direccion)}</strong>`) : "",
      p(escapeHtml(r?.instrucciones || "Te escribiremos para coordinar el día y la hora del retiro."))
    );
  } else if (d.requiereDespacho) {
    partes.push(
      textoDespachoCobrado(d)
        ? p("Despacharemos tu pedido a la dirección que indicaste.")
        : p(`<strong>${escapeHtml(config.envio.modalidad)}</strong>: ${escapeHtml(config.envio.detalle)}`),
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
    !d.requiereDespacho
      ? "Sin despacho (solo productos digitales)"
      : d.despacho?.forma === "retiro"
        ? `Entrega: ${escapeHtml(d.despacho.retiro ? textoRetiro(d.despacho.retiro) : "retiro")} — el comprador retira (sin despacho)`
        : `Despacho: ${escapeHtml(c.direccion ?? "")}, ${escapeHtml(c.comuna ?? "")}, ${escapeHtml(c.region ?? "")}`,
    c.notas ? `Notas: ${escapeHtml(c.notas)}` : "",
  ]
    .filter(Boolean)
    .join("<br>");
  const pendientes = [
    d.requiereDespacho
      ? d.despacho?.forma === "retiro"
        ? "Preparar los productos y coordinar el retiro con el comprador."
        : "Preparar y despachar los productos físicos."
      : "",
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
