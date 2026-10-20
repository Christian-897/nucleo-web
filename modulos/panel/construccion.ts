/**
 * Interruptor "Sitio en construcción" del panel (cuadro en Resumen).
 *
 *  GET   estado (encendido, quién y cuándo, si lo fuerza Cloudflare). Si el
 *        aviso está encendido, de paso deja la cookie de vista previa: quien
 *        tiene sesión ve la tienda real con "Ver tienda".
 *  POST  { accion: "cambiar", activo: boolean }
 *
 * Lo puede usar cualquier usuario del panel (dueño o invitado): no borra
 * nada y se deshace con el mismo botón.
 */
import { cambiarEstado, cookieVistaPrevia, obtenerEstado } from "../construccion/estado";
import { type Ctx, exigirSesion, jsonConCookies, jsonResponse, leerJson } from "./http";

export async function construccionGet(c: Ctx): Promise<Response> {
  const s = await exigirSesion(c, false);
  if (s instanceof Response) return s;
  const estado = await obtenerEstado(c.env);
  const cookie = estado.activo ? await cookieVistaPrevia(c.env) : null;
  return jsonConCookies(200, estado, [cookie]);
}

export async function construccionPost(c: Ctx): Promise<Response> {
  const s = await exigirSesion(c, true);
  if (s instanceof Response) return s;
  const cuerpo = await leerJson(c.request);
  if (cuerpo?.accion !== "cambiar" || typeof cuerpo.activo !== "boolean") {
    return jsonResponse(400, { message: "Acción no válida." });
  }
  if (!c.env.REVIEWS_KV) return jsonResponse(503, { message: "El almacén del sitio no está disponible." });
  const antes = await obtenerEstado(c.env);
  if (!cuerpo.activo && antes.forzado) {
    return jsonResponse(409, {
      message: "El aviso está encendido desde Cloudflare (variable CONSTRUCCION). Pide a quien administra el sitio que la quite.",
    });
  }
  await cambiarEstado(c.env, cuerpo.activo, s.usuario);
  const estado = await obtenerEstado(c.env);
  const cookie = estado.activo ? await cookieVistaPrevia(c.env) : null;
  return jsonConCookies(200, estado, [cookie]);
}
