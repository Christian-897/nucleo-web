/**
 * Interruptor "Sitio en construcción" del panel (cuadro en Resumen).
 *
 *  GET   estado (encendido, quién y cuándo, si lo fuerza Cloudflare). Si el
 *        aviso está encendido, de paso deja la cookie de vista previa: quien
 *        tiene sesión ve la tienda real con "Ver tienda".
 *  POST  { accion: "cambiar", activo: boolean }
 *
 * Quién lo cambia (v0.41):
 *  - El dueño del panel: siempre, sin clave.
 *  - Una persona invitada: con SU clave, que crea al usar un código de un
 *    solo uso que le da el dueño (ver clave-construccion.ts).
 *  POST { accion: "activar", codigo, clave }  → usa el código y crea su clave.
 * El GET dice `puedeCambiar`, `pideClave` y `puedeActivar`. Los intentos con
 * clave o código van con límite (5 cada 15 min por IP y por usuario).
 */
import { getClientIp } from "../../core/seguridad";
import { cambiarEstado, cookieVistaPrevia, obtenerEstado } from "../construccion/estado";
import { esDueno, obtenerUsuario } from "./auth";
import { activarConCodigo, anotarRegistroConstruccion, claveConstruccionCorrecta, tieneClaveConstruccion } from "./clave-construccion";
import { type Ctx, exigirSesion, jsonConCookies, jsonResponse, leerJson } from "./http";

interface Permiso { puedeCambiar: boolean; pideClave: boolean; puedeActivar: boolean }

/** Qué puede hacer este usuario con el interruptor. */
async function permisoDe(c: Ctx, usuario: string): Promise<Permiso> {
  if (esDueno(await obtenerUsuario(c.env, usuario))) return { puedeCambiar: true, pideClave: false, puedeActivar: false };
  return (await tieneClaveConstruccion(c.env, usuario))
    ? { puedeCambiar: true, pideClave: true, puedeActivar: false }
    : { puedeCambiar: false, pideClave: false, puedeActivar: true };
}

/** Solo cuentan los intentos FALLIDOS (clave o código malo): 5 cada 15 min, por IP y por usuario. */
const MAXIMO_FALLOS = 5;
const VENTANA_FALLOS = 900;
const llavesFallos = (c: Ctx, usuario: string) => [`admin-construccion:${getClientIp(c.request)}`, `admin-construccion-u:${usuario}`];

async function bloqueado(c: Ctx, usuario: string): Promise<boolean> {
  for (const k of llavesFallos(c, usuario)) {
    if (Number((await c.env.REVIEWS_KV?.get(k)) || 0) >= MAXIMO_FALLOS) return true;
  }
  return false;
}

async function anotarFallo(c: Ctx, usuario: string): Promise<void> {
  for (const k of llavesFallos(c, usuario)) {
    const n = Number((await c.env.REVIEWS_KV?.get(k)) || 0) + 1;
    await c.env.REVIEWS_KV?.put(k, String(n), { expirationTtl: VENTANA_FALLOS });
  }
}

export async function construccionGet(c: Ctx): Promise<Response> {
  const s = await exigirSesion(c, false);
  if (s instanceof Response) return s;
  const estado = await obtenerEstado(c.env);
  const cookie = estado.activo ? await cookieVistaPrevia(c.env) : null;
  return jsonConCookies(200, { ...estado, ...(await permisoDe(c, s.usuario)) }, [cookie]);
}

export async function construccionPost(c: Ctx): Promise<Response> {
  const s = await exigirSesion(c, true);
  if (s instanceof Response) return s;
  const cuerpo = await leerJson(c.request);
  if (!c.env.REVIEWS_KV) return jsonResponse(503, { message: "El almacén del sitio no está disponible." });
  if (cuerpo?.accion === "activar") {
    const permiso = await permisoDe(c, s.usuario);
    if (!permiso.puedeActivar) return jsonResponse(400, { message: "Ya puedes abrir y cerrar la tienda." });
    if (await bloqueado(c, s.usuario)) return jsonResponse(429, { message: "Demasiados intentos. Espera 15 minutos." });
    const r = await activarConCodigo(c.env, s.usuario, cuerpo.codigo, cuerpo.clave);
    if (!r.ok) {
      if (r.codigoMalo) await anotarFallo(c, s.usuario);
      return jsonResponse(400, { message: r.motivo });
    }
    const estado = await obtenerEstado(c.env);
    return jsonResponse(200, { ...estado, ...(await permisoDe(c, s.usuario)) });
  }
  if (cuerpo?.accion !== "cambiar" || typeof cuerpo.activo !== "boolean") {
    return jsonResponse(400, { message: "Acción no válida." });
  }
  const permiso = await permisoDe(c, s.usuario);
  if (!permiso.puedeCambiar) {
    return jsonResponse(403, { message: "Para abrir o cerrar la tienda necesitas un código del dueño del panel." });
  }
  if (permiso.pideClave) {
    if (await bloqueado(c, s.usuario)) return jsonResponse(429, { message: "Demasiados intentos. Espera 15 minutos." });
    if (typeof cuerpo.clave !== "string" || !cuerpo.clave.trim()) {
      return jsonResponse(400, { message: "Escribe tu clave para abrir o cerrar la tienda." });
    }
    if (!(await claveConstruccionCorrecta(c.env, s.usuario, cuerpo.clave))) {
      await anotarFallo(c, s.usuario);
      // 400 y no 401: el panel entiende 401 como "sesión cerrada" y la sacaría.
      return jsonResponse(400, { message: "La clave no es correcta." });
    }
  }
  const antes = await obtenerEstado(c.env);
  if (!cuerpo.activo && antes.forzado) {
    return jsonResponse(409, {
      message: "El aviso está encendido desde Cloudflare (variable CONSTRUCCION). Pide a quien administra el sitio que la quite.",
    });
  }
  await cambiarEstado(c.env, cuerpo.activo, s.usuario);
  if (antes.activo !== cuerpo.activo) {
    await anotarRegistroConstruccion(c.env, { tipo: cuerpo.activo ? "tienda-cerrada" : "tienda-abierta", por: s.usuario });
  }
  const estado = await obtenerEstado(c.env);
  const cookie = estado.activo ? await cookieVistaPrevia(c.env) : null;
  return jsonConCookies(200, { ...estado, ...permiso }, [cookie]);
}
