/** Correos de las reseñas: la invitación al comprador y el aviso a la tienda. */
import { escapeHtml } from "../../core/validar";
import type { ConfigResenas } from "./config";

function marco(config: ConfigResenas, cuerpo: string): string {
  const acento = config.coloresCorreo?.acento ?? "#B5577A";
  const fondo = config.coloresCorreo?.fondo ?? "#FBF5F2";
  return `<!doctype html><html lang="es"><body style="margin:0;background:${fondo};font-family:Arial,sans-serif;color:#3a2a33">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" style="max-width:560px;background:#ffffff;border-radius:12px;padding:28px">
<tr><td><h1 style="margin:0 0 16px;font-size:22px;color:${acento}">${escapeHtml(config.nombreSitio)}</h1>
${cuerpo}</td></tr></table></td></tr></table></body></html>`;
}

export function correoInvitacion(config: ConfigResenas, d: { nombre: string; productos: string[]; enlace: string }): string {
  const acento = config.coloresCorreo?.acento ?? "#B5577A";
  const saludo = d.nombre ? `Hola, ${escapeHtml(d.nombre)}:` : "Hola:";
  const lista = d.productos.map((p) => `<li style="margin:0 0 4px">${escapeHtml(p)}</li>`).join("");
  return marco(
    config,
    `<p style="margin:0 0 12px">${saludo}</p>
<p style="margin:0 0 12px">Tu pedido ya va en camino. Cuando lo recibas y lo pruebes, nos encantaría saber qué te pareció:</p>
<ul style="margin:0 0 16px;padding-left:20px">${lista}</ul>
<p style="margin:0 0 20px"><a href="${escapeHtml(d.enlace)}" style="display:inline-block;background:${acento};color:#ffffff;text-decoration:none;font-weight:bold;padding:12px 22px;border-radius:999px">Dar mi opinión</a></p>
<p style="margin:0 0 8px;font-size:13px;color:#7a6a72">Toma menos de un minuto. Tu opinión se publica con tu nombre y la inicial de tu apellido, y ayuda a otras personas a elegir.</p>
<p style="margin:0;font-size:13px;color:#7a6a72">Este enlace es solo para ti; no lo compartas.</p>`
  );
}

export function correoAvisoTienda(config: ConfigResenas, d: { nombre: string; resenas: { producto: string; estrellas: number; texto: string }[] }): string {
  const items = d.resenas
    .map((r) => `<li style="margin:0 0 10px"><strong>${escapeHtml(r.producto)}</strong> · ${"★".repeat(r.estrellas)}${"☆".repeat(5 - r.estrellas)}<br><span style="color:#5a4a52">${escapeHtml(r.texto)}</span></li>`)
    .join("");
  return marco(
    config,
    `<p style="margin:0 0 12px"><strong>${escapeHtml(d.nombre)}</strong> dejó ${d.resenas.length === 1 ? "una reseña" : `${d.resenas.length} reseñas`}:</p>
<ul style="margin:0 0 16px;padding-left:20px">${items}</ul>
<p style="margin:0;font-size:13px;color:#7a6a72">No se publica hasta que la apruebes en el panel, pestaña <strong>Reseñas</strong>.</p>`
  );
}
