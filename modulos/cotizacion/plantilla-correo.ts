/**
 * EL CORREO QUE AVISA DE UNA NUEVA SOLICITUD.
 *
 * Se lee casi siempre en el Gmail de un celular. De ahí la forma:
 *  · Tablas y estilos en línea: Gmail borra las hojas de estilo, Outlook no
 *    entiende flexbox. Lo único que se ve igual en todos es una tabla con
 *    estilos escritos en cada etiqueta.
 *  · Lo importante arriba: quién escribió, qué pide y cómo contestar. El
 *    botón de WhatsApp va primero.
 *  · Texto escapado, siempre: todo lo del formulario lo escribió un
 *    desconocido y acá se arma HTML pegando texto.
 *
 * Nada de rubro va escrito a mano: colores, nombre del sitio y nombres de
 * categoría entran por parámetro.
 */
import { escapeHtml } from "../../core/validar";
import {
  COLORES_CORREO_POR_DEFECTO,
  type ColoresCorreo,
} from "./config";

export interface DatosSolicitud {
  nombre: string;
  email: string;
  telefono?: string;
  categoria: string;
  descripcion: string;
}

export interface OpcionesCorreo {
  nombreSitio: string;
  urlPanel: string;
  /** id -> label de las categorías del sitio. */
  nombresCategoria: Record<string, string>;
  /** Colores del sitio; lo que falte se completa con los por defecto. */
  colores?: Partial<ColoresCorreo>;
}

/** Deja el teléfono como lo espera WhatsApp: solo dígitos, con código país. */
function telefonoWhatsApp(telefono?: string): string {
  if (!telefono) return "";
  const digitos = String(telefono).replace(/\D/g, "");
  if (!digitos) return "";
  if (digitos.startsWith("56") && digitos.length >= 11) return digitos;
  if (digitos.length === 9 && digitos.startsWith("9")) return "56" + digitos;
  if (digitos.length === 8) return "569" + digitos;
  return digitos;
}

/** Nombre apto para el asunto: sin etiquetas y acotado para que no corte la categoría. */
function nombreParaAsunto(nombre: string): string {
  const limpio = nombre.replace(/[<>"'`]/g, "").replace(/\s+/g, " ").trim();
  return limpio.length > 38 ? limpio.slice(0, 37) + "…" : limpio || "alguien";
}

export function asuntoSolicitud(
  datos: DatosSolicitud,
  opciones: Pick<OpcionesCorreo, "nombreSitio" | "nombresCategoria">
): string {
  const categoria =
    opciones.nombresCategoria[datos.categoria] || datos.categoria;
  return `${opciones.nombreSitio}: nueva solicitud de ${nombreParaAsunto(
    datos.nombre
  )} — ${categoria}`;
}

export function cuerpoSolicitud(
  datos: DatosSolicitud,
  opciones: OpcionesCorreo
): string {
  const C: ColoresCorreo = { ...COLORES_CORREO_POR_DEFECTO, ...opciones.colores };

  const nombre = escapeHtml(datos.nombre);
  const email = escapeHtml(datos.email);
  const telefono = escapeHtml(datos.telefono || "No indicó");
  const categoria = escapeHtml(
    opciones.nombresCategoria[datos.categoria] || datos.categoria
  );
  const descripcion = escapeHtml(datos.descripcion).replace(/\n/g, "<br>");
  const sitio = escapeHtml(opciones.nombreSitio);

  const numero = telefonoWhatsApp(datos.telefono);
  const saludo = `Hola ${datos.nombre.split(" ")[0]}, recibimos tu solicitud de presupuesto en ${opciones.nombreSitio}.`;
  const enlaceWhatsApp = numero
    ? `https://wa.me/${numero}?text=${encodeURIComponent(saludo)}`
    : "";

  const boton = (
    url: string,
    texto: string,
    fondo: string,
    textoColor: string,
    borde: string
  ) => `
    <a href="${url}" style="display:inline-block;background:${fondo};color:${textoColor};
       text-decoration:none;padding:12px 20px;border-radius:8px;font-size:15px;
       font-weight:600;font-family:Helvetica,Arial,sans-serif;border:1px solid ${borde};
       margin:0 6px 8px 0;">${texto}</a>`;

  const fila = (etiqueta: string, valor: string) => `
    <tr>
      <td style="padding:6px 0;font-size:13px;color:${C.tintaTenue};
          font-family:Helvetica,Arial,sans-serif;width:90px;vertical-align:top;">${etiqueta}</td>
      <td style="padding:6px 0;font-size:15px;color:${C.tinta};
          font-family:Helvetica,Arial,sans-serif;">${valor}</td>
    </tr>`;

  return `<!doctype html>
<html lang="es">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:${C.fondo};">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">
    ${categoria} · ${telefono} · ${descripcion.slice(0, 90)}
  </div>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
         style="background:${C.fondo};padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
             style="max-width:560px;background:${C.tarjeta};border:1px solid ${C.borde};
                    border-radius:14px;overflow:hidden;">

        <tr><td style="padding:26px 26px 0 26px;">
          <p style="margin:0 0 4px 0;font-size:13px;color:${C.tintaTenue};
                    font-family:Helvetica,Arial,sans-serif;letter-spacing:.04em;
                    text-transform:uppercase;">${sitio}</p>
          <h1 style="margin:0;font-size:21px;line-height:1.3;color:${C.tinta};
                     font-family:Helvetica,Arial,sans-serif;">
            Nueva solicitud de presupuesto
          </h1>
          <p style="margin:8px 0 0 0;font-size:15px;line-height:1.55;color:${C.tintaSuave};
                    font-family:Helvetica,Arial,sans-serif;">
            <strong>${nombre}</strong> pidió un presupuesto de ${categoria.toLowerCase()}.
          </p>
        </td></tr>

        <tr><td style="padding:20px 26px 0 26px;">
          ${
            enlaceWhatsApp
              ? boton(
                  enlaceWhatsApp,
                  "Responder por WhatsApp",
                  C.whatsapp,
                  "#FFFFFF",
                  C.whatsapp
                )
              : ""
          }
          ${boton(
            "mailto:" + datos.email,
            "Responder por correo",
            "#FFFFFF",
            C.acento,
            C.borde
          )}
        </td></tr>

        <tr><td style="padding:22px 26px 0 26px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            ${fila("Teléfono", telefono)}
            ${fila(
              "Correo",
              `<a href="mailto:${datos.email}" style="color:${C.acento};">${email}</a>`
            )}
            ${fila("Categoría", categoria)}
          </table>
        </td></tr>

        <tr><td style="padding:18px 26px 0 26px;">
          <p style="margin:0 0 6px 0;font-size:13px;color:${C.tintaTenue};
                    font-family:Helvetica,Arial,sans-serif;">Lo que necesita</p>
          <div style="background:${C.fondo};border-radius:10px;padding:14px 16px;
                      font-size:15px;line-height:1.6;color:${C.tinta};
                      font-family:Helvetica,Arial,sans-serif;">${descripcion}</div>
        </td></tr>

        <tr><td style="padding:20px 26px 26px 26px;">
          <p style="margin:0;font-size:13px;line-height:1.6;color:${C.tintaTenue};
                    font-family:Helvetica,Arial,sans-serif;">
            Al responder este correo le llegará directamente a ${nombre}.
            También puedes verla en el
            <a href="${opciones.urlPanel}" style="color:${C.acento};">panel del sitio</a>
            y marcarla como atendida.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}
