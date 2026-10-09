/**
 * Boletines desde el panel (pestaña Suscriptores): escribir, enviarse una
 * prueba y enviar a todos los suscriptores confirmados.
 *
 *   GET   → lista de boletines, cuántos suscriptores hay y a dónde va la prueba.
 *   POST  { accion: "guardar", id?, asunto, titulo, texto, imagen?, boton? }
 *         { accion: "eliminar", id }        (solo borradores)
 *         { accion: "probar", id }          (a ADMIN_NOTIFY_EMAIL)
 *         { accion: "enviar", id, confirmar: true }   (también "Seguir enviando")
 *         { accion: "ajustes", porDia }     (correos de boletín por día)
 *   foto  multipart "archivo" → { imagen: "/media/…" }
 */
import {
  ErrorBoletin,
  type Boletin,
  borrarBoletin,
  enviadosHoy,
  enviarBoletin,
  enviarPrueba,
  guardarAjustes,
  guardarBoletin,
  horaReinicio,
  idBoletinValido,
  leerAjustes,
  leerBoletin,
  listarBoletines,
  nuevoIdBoletin,
  porDiaValido,
  resumenBoletin,
  validarBoletin,
} from "../newsletter/boletin";
import type { ConfigNewsletter } from "../newsletter/config";
import { listarActivos } from "../newsletter/servidor";
import { limpiarVariable } from "../../core/correo";
import { type ConfigPanel, MAXIMO_BYTES_FOTO } from "./config";
import { type Ctx, exigirSesion, jsonResponse, leerJson } from "./http";
import { borrarFoto, direccionMediaValida, guardarFoto, medidasAceptables, tipoRealDeImagen } from "./imagenes";

export interface ConfigBoletines extends ConfigNewsletter {
  /**
   * Dirección pública del sitio para los enlaces y fotos del correo
   * ("https://mitienda.cl"). Sin ella se usa la del navegador del panel.
   */
  urlPublica?: string;
  /**
   * Correos de boletín por día, valor inicial (la dueña lo cambia en el
   * panel). Conviene dejar margen bajo el cupo del plan para las compras y
   * confirmaciones del mismo día. Por defecto 80.
   */
  maximoPorEnvio?: number;
  /** Cupo diario del plan de correos (Resend gratis: 100). null = sin tope diario. Por defecto 100. */
  limiteDiarioPlan?: number | null;
  /** Zona horaria para decir a qué hora se reinicia el cupo. Por defecto America/Santiago. */
  zonaHoraria?: string;
}

function origen(config: ConfigBoletines, request: Request): string {
  const u = config.urlPublica && /^https:\/\/[^/\s]+$/.test(config.urlPublica.replace(/\/+$/, "")) ? config.urlPublica : "";
  return (u || new URL(request.url).origin).replace(/\/+$/, "");
}

/** El correo de prueba se muestra a medias: a*****@gmail.com. */
function ocultar(email: string): string {
  const [u, d] = email.split("@");
  if (!u || !d) return "";
  return `${u[0]}${"*".repeat(Math.min(5, Math.max(1, u.length - 1)))}@${d}`;
}

export function crearGestionBoletines(config: ConfigBoletines, panel: ConfigPanel) {
  const porDefecto = porDiaValido(config.maximoPorEnvio) ? config.maximoPorEnvio : 80;
  const limitePlan = config.limiteDiarioPlan === undefined ? 100 : config.limiteDiarioPlan;

  async function estadoCupo(env: Ctx["env"]) {
    const [ajustes, hoy] = await Promise.all([leerAjustes(env, porDefecto), enviadosHoy(env)]);
    return { porDia: ajustes.porDia, hoy, quedan: Math.max(0, ajustes.porDia - hoy), limitePlan, reinicio: horaReinicio(config.zonaHoraria) };
  }

  async function get(ctx: Ctx): Promise<Response> {
    const s = await exigirSesion(ctx, false);
    if (s instanceof Response) return s;
    const [boletines, activos] = await Promise.all([listarBoletines(ctx.env), listarActivos(ctx.env)]);
    const prueba = limpiarVariable(ctx.env.ADMIN_NOTIFY_EMAIL);
    return jsonResponse(200, {
      boletines: boletines.map(resumenBoletin),
      suscriptores: activos.length,
      correoPrueba: prueba ? ocultar(prueba) : null,
      correoConectado: !!limpiarVariable(ctx.env.RESEND_API_KEY),
      cupo: await estadoCupo(ctx.env),
    });
  }

  async function post(ctx: Ctx): Promise<Response> {
    const s = await exigirSesion(ctx, true);
    if (s instanceof Response) return s;
    const cuerpo = await leerJson(ctx.request);
    if (!cuerpo) return jsonResponse(400, { message: "Solicitud inválida." });
    const ahora = new Date().toISOString();

    try {
      if (cuerpo.accion === "guardar") {
        const v = validarBoletin(cuerpo);
        if (!v.ok || !v.datos) return jsonResponse(400, { message: "Revisa los campos marcados.", errores: v.errores });
        let b: Boletin;
        if (cuerpo.id !== undefined && cuerpo.id !== null && cuerpo.id !== "") {
          const previo = idBoletinValido(cuerpo.id) ? await leerBoletin(ctx.env, cuerpo.id) : null;
          if (!previo) return jsonResponse(404, { message: "Ese boletín ya no existe." });
          if (previo.estado !== "borrador") return jsonResponse(409, { message: "Ese boletín ya se empezó a enviar y no se puede cambiar." });
          if (previo.imagen && previo.imagen !== v.datos.imagen && direccionMediaValida(previo.imagen)) await borrarFoto(ctx.env, previo.imagen);
          b = { ...previo, ...v.datos, actualizado: ahora };
          if (!v.datos.imagen) delete b.imagen;
          if (!v.datos.boton) delete b.boton;
        } else {
          b = { id: nuevoIdBoletin(), ...v.datos, estado: "borrador", creado: ahora, actualizado: ahora, enviados: 0 };
          if (!b.imagen) delete b.imagen;
          if (!b.boton) delete b.boton;
        }
        await guardarBoletin(ctx.env, b);
        return jsonResponse(200, { ok: true, boletin: resumenBoletin(b) });
      }

      if (cuerpo.accion === "ajustes") {
        const n = Number(cuerpo.porDia);
        if (!porDiaValido(n)) return jsonResponse(400, { message: "Escribe un número entero entre 1 y 1000." });
        await guardarAjustes(ctx.env, { porDia: n });
        return jsonResponse(200, { ok: true, cupo: await estadoCupo(ctx.env) });
      }

      const b = idBoletinValido(cuerpo.id) ? await leerBoletin(ctx.env, cuerpo.id) : null;
      if (!b) return jsonResponse(404, { message: "Ese boletín ya no existe." });

      if (cuerpo.accion === "eliminar") {
        if (b.estado !== "borrador") return jsonResponse(409, { message: "Un boletín enviado queda en el historial." });
        if (b.imagen && direccionMediaValida(b.imagen)) await borrarFoto(ctx.env, b.imagen);
        await borrarBoletin(ctx.env, b.id);
        return jsonResponse(200, { ok: true });
      }

      if (cuerpo.accion === "probar") {
        const para = await enviarPrueba(ctx.env, config, b, origen(config, ctx.request));
        return jsonResponse(200, { ok: true, para: ocultar(para) });
      }

      if (cuerpo.accion === "enviar") {
        if (cuerpo.confirmar !== true) return jsonResponse(400, { message: "Falta confirmar el envío." });
        if (b.estado === "enviado") return jsonResponse(409, { message: "Ese boletín ya se envió a todos." });
        const activos = await listarActivos(ctx.env);
        if (!activos.length) return jsonResponse(409, { message: "Todavía no hay suscriptores confirmados." });
        const cupo = await estadoCupo(ctx.env);
        if (cupo.quedan === 0) {
          return jsonResponse(409, { message: `Ya se enviaron los ${cupo.porDia} correos de boletín de hoy. Sigue después de las ${cupo.reinicio}.` });
        }
        const progreso = await enviarBoletin(ctx.env, config, b, origen(config, ctx.request), { maximo: cupo.quedan });
        return jsonResponse(200, { ok: true, progreso, boletin: resumenBoletin(b), cupo: await estadoCupo(ctx.env) });
      }
    } catch (e) {
      if (e instanceof ErrorBoletin) return jsonResponse(e.status, { message: e.message });
      throw e;
    }
    return jsonResponse(400, { message: "Esa acción no existe." });
  }

  /** POST multipart "archivo": la foto del boletín (ya reducida en el navegador). */
  async function foto(ctx: Ctx): Promise<Response> {
    const s = await exigirSesion(ctx, true);
    if (s instanceof Response) return s;
    const maximo = panel.maximoBytesFoto ?? MAXIMO_BYTES_FOTO;
    if (Number(ctx.request.headers.get("Content-Length") || "0") > maximo + 64 * 1024) {
      return jsonResponse(413, { message: "La foto pesa demasiado. Intenta con otra." });
    }
    let form: FormData;
    try {
      form = await ctx.request.formData();
    } catch {
      return jsonResponse(400, { message: "Solicitud inválida." });
    }
    const archivo = form.get("archivo");
    if (!archivo || typeof archivo === "string" || archivo.size === 0) return jsonResponse(400, { message: "No llegó ninguna foto." });
    if (archivo.size > maximo) return jsonResponse(413, { message: "La foto pesa demasiado. Intenta con otra." });
    const datos = await archivo.arrayBuffer();
    const bytes = new Uint8Array(datos);
    // En los correos, WebP no se ve en todos los programas: solo JPG o PNG.
    const tipo = tipoRealDeImagen(bytes);
    if (tipo !== "image/jpeg" && tipo !== "image/png") return jsonResponse(400, { message: "Para el correo usa una foto JPG o PNG." });
    const medidas = medidasAceptables(bytes, panel.maximoLadoFoto);
    if (!medidas.ok) return jsonResponse(400, { message: medidas.motivo || "Esa foto no se puede usar." });
    const guardada = await guardarFoto(ctx.env, "boletin", datos, tipo);
    if (!guardada.ok || !guardada.direccion) return jsonResponse(500, { message: "No se pudo guardar la foto." });
    return jsonResponse(200, { ok: true, imagen: guardada.direccion });
  }

  return { get, post, foto };
}
