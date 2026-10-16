/**
 * MENSAJES DEL FORMULARIO DE CONTACTO (o de cotización) en el panel.
 *
 * Usa el respaldo que guarda el módulo `cotizacion` en KV: aunque un correo
 * de aviso se pierda, el mensaje queda aquí. Se puede marcar como
 * respondido (o volver a pendiente) y borrar. Se borran solos al cumplir
 * el plazo de la config (`retencionDias`, por defecto 180).
 *
 * Todo lo que se muestra lo escribió un desconocido: la pantalla lo pone
 * siempre como texto (nunca como HTML).
 */
import {
  claveValida,
  eliminarCotizacion,
  listarCotizaciones,
  marcarCotizacion,
} from "../cotizacion/servidor";
import { type ConfigCotizacion, nombresCategoria } from "../cotizacion/config";
import { type Ctx, exigirSesion, jsonResponse, leerJson } from "./http";

export function crearGestionMensajes(config: ConfigCotizacion) {
  const nombres = nombresCategoria(config);

  async function get(ctx: Ctx): Promise<Response> {
    const s = await exigirSesion(ctx, false);
    if (s instanceof Response) return s;
    const r = await listarCotizaciones(ctx.env);
    return jsonResponse(200, {
      total: r.total,
      pendientes: r.pendientes,
      hayMas: r.hayMas,
      mensajes: r.cotizaciones.map((c) => ({
        clave: c.clave,
        nombre: c.nombre,
        email: c.email,
        telefono: c.telefono || "",
        motivo: nombres[c.categoria] || c.categoria,
        texto: c.descripcion,
        fecha: c.fecha,
        atendido: c.atendida || null,
        // El aviso por correo no salió (cuota, Resend caído): conviene revisarlo aquí.
        sinCorreo: c.correoEnviado === false && !c.correoSimulado,
      })),
    });
  }

  async function post(ctx: Ctx): Promise<Response> {
    const s = await exigirSesion(ctx, true);
    if (s instanceof Response) return s;
    const cuerpo = await leerJson(ctx.request);
    if (!cuerpo) return jsonResponse(400, { message: "Solicitud inválida." });
    if (!claveValida(cuerpo.clave)) return jsonResponse(400, { message: "Mensaje inválido." });
    if (cuerpo.accion === "marcar") {
      const r = await marcarCotizacion(ctx.env, cuerpo.clave, cuerpo.atendido === true, config);
      if (r.ok) return jsonResponse(200, { ok: true });
      if (r.motivo === "no-existe" || r.motivo === "ya-vencida") {
        return jsonResponse(404, { message: "Ese mensaje ya no existe. Recarga la lista." });
      }
      return jsonResponse(500, { message: "No se pudo guardar. Intenta de nuevo." });
    }
    if (cuerpo.accion === "eliminar") {
      const r = await eliminarCotizacion(ctx.env, cuerpo.clave);
      return r.ok ? jsonResponse(200, { ok: true }) : jsonResponse(500, { message: "No se pudo borrar. Intenta de nuevo." });
    }
    return jsonResponse(400, { message: "Esa acción no existe." });
  }

  return { get, post };
}
