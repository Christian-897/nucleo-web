/**
 * Endpoints de acceso: parámetros, instalación, entrada (con doble factor),
 * salida, sesión, actividad y seguridad. Trasladados de Muebles Crea.
 */
import { compararSeguro } from "../../core/cripto";
import { limpiarVariable } from "../../core/correo";
import { checkRateLimit, getClientIp, isSameOrigin, jsonResponse } from "../../core/seguridad";
import {
  abrirPaso2,
  abrirSesion,
  cambiarClave,
  cerrarOtrasSesiones,
  cerrarPaso2,
  cerrarSesion,
  claveCorrecta,
  credencialesValidas,
  crearUsuario,
  derivadoValido,
  duracionSesion,
  guardarUsuario,
  hayUsuario,
  inactividadValida,
  obtenerSalPublica,
  obtenerUsuario,
  OPCIONES_INACTIVIDAD,
  reajustarSesion,
  renovarSesion,
  REPETICIONES,
  sesionActual,
  usuarioDelPaso2,
} from "./auth";
import type { ConfigPanel } from "./config";
import {
  activar,
  CANTIDAD_RESPALDOS,
  comprobarSegundoFactor,
  desactivar,
  estadoDe,
  proponer,
  renovarRespaldos,
} from "./dos-factores";
import { type Ctx, exigirSesion, jsonConCookies, leerJson } from "./http";

const listo = (ctx: Ctx) => Boolean(ctx.env.REVIEWS_KV && limpiarVariable(ctx.env.ADMIN_PEPPER));

/** GET: sal pública y repeticiones para que el navegador derive la clave. */
export async function parametros({ env }: Ctx): Promise<Response> {
  if (!env.REVIEWS_KV) return jsonResponse(503, { message: "El panel no está disponible: falta la base de datos." });
  try {
    return jsonResponse(200, {
      sal: await obtenerSalPublica(env),
      repeticiones: REPETICIONES,
      configurado: await hayUsuario(env),
      listoParaConfigurar: Boolean(limpiarVariable(env.ADMIN_PEPPER) && limpiarVariable(env.ADMIN_SETUP_TOKEN)),
    });
  } catch {
    return jsonResponse(503, { message: "El panel no está disponible en este momento." });
  }
}

/** POST: crea el único usuario con la clave de instalación. */
export async function instalar(ctx: Ctx): Promise<Response> {
  const { request, env } = ctx;
  if (!isSameOrigin(request)) return jsonResponse(403, { message: "Origen no permitido." });
  const token = limpiarVariable(env.ADMIN_SETUP_TOKEN);
  if (!listo(ctx) || !token) {
    return jsonResponse(503, {
      message: "Falta configuración en el servidor. Revisa ADMIN_PEPPER y ADMIN_SETUP_TOKEN en Cloudflare.",
    });
  }
  if (!(await checkRateLimit(env.REVIEWS_KV, `admin-setup:${getClientIp(request)}`, 5, 600))) {
    return jsonResponse(429, { message: "Demasiados intentos. Espera unos minutos." });
  }
  if (await hayUsuario(env)) {
    return jsonResponse(409, { message: "El panel ya está configurado. Entra con tu usuario y contraseña." });
  }
  const cuerpo = await leerJson(request);
  if (!cuerpo) return jsonResponse(400, { message: "Solicitud inválida." });
  const { usuario, derivado, claveInstalacion } = cuerpo;
  // Comparación en tiempo constante (en Muebles Crea era `!==`).
  if (typeof claveInstalacion !== "string" || !compararSeguro(claveInstalacion.trim(), token)) {
    return jsonResponse(401, { message: "Clave de instalación incorrecta." });
  }
  if (typeof usuario !== "string" || !/^[a-zA-Z0-9._-]{3,40}$/.test(usuario)) {
    return jsonResponse(400, {
      message: "El usuario debe tener entre 3 y 40 caracteres: letras, números, punto, guion o guion bajo.",
    });
  }
  if (!derivadoValido(derivado)) return jsonResponse(400, { message: "La contraseña no llegó correctamente." });
  if (!(await crearUsuario(env, usuario, derivado))) {
    return jsonResponse(409, { message: "El panel ya está configurado." });
  }
  return jsonResponse(200, { ok: true });
}

/** POST: usuario + contraseña. Con doble factor, abre solo el paso intermedio. */
export async function entrar(ctx: Ctx): Promise<Response> {
  const { request, env } = ctx;
  if (!isSameOrigin(request)) return jsonResponse(403, { message: "Origen no permitido." });
  if (!listo(ctx)) return jsonResponse(503, { message: "El panel no está disponible." });
  if (!(await checkRateLimit(env.REVIEWS_KV, `admin-login:${getClientIp(request)}`, 8, 600))) {
    return jsonResponse(429, { message: "Demasiados intentos. Espera unos minutos antes de volver a probar." });
  }
  const cuerpo = await leerJson(request);
  const RECHAZO = { message: "Usuario o contraseña incorrectos." };
  const usuario = cuerpo?.usuario;
  const derivado = cuerpo?.derivado;
  if (typeof usuario !== "string" || !derivadoValido(derivado)) return jsonResponse(401, RECHAZO);
  if (!(await credencialesValidas(env, usuario, derivado))) return jsonResponse(401, RECHAZO);
  const registro = await obtenerUsuario(env);
  if (registro?.dosFactores) {
    return jsonConCookies(200, { ok: true, segundoFactor: true }, [await abrirPaso2(env, usuario)]);
  }
  return jsonConCookies(200, { ok: true }, [await abrirSesion(env, usuario)]);
}

/** POST: segundo paso, código del teléfono o de respaldo. */
export async function entrarSegundoFactor(ctx: Ctx): Promise<Response> {
  const { request, env } = ctx;
  if (!isSameOrigin(request)) return jsonResponse(403, { message: "Origen no permitido." });
  if (!listo(ctx)) return jsonResponse(503, { message: "El panel no está disponible." });
  if (!(await checkRateLimit(env.REVIEWS_KV, `admin-2fa:${getClientIp(request)}`, 5, 600))) {
    return jsonResponse(429, { message: "Demasiados intentos. Espera unos minutos antes de volver a probar." });
  }
  const usuario = await usuarioDelPaso2(env, request);
  if (!usuario) return jsonResponse(440, { message: "Se venció el tiempo para escribir el código. Vuelve a entrar." });
  const cuerpo = await leerJson(request);
  const codigo = cuerpo?.codigo;
  if (typeof codigo !== "string") return jsonResponse(400, { message: "Escribe el código." });
  const registro = await obtenerUsuario(env);
  if (!registro?.dosFactores || registro.usuario !== usuario) return jsonResponse(401, { message: "Vuelve a entrar." });
  const r = await comprobarSegundoFactor(env, registro, codigo);
  if (!r.ok) return jsonResponse(401, { message: r.motivo || "Código incorrecto." });
  return jsonConCookies(
    200,
    { ok: true, usuario, fueRespaldo: Boolean(r.fueRespaldo), respaldosRestantes: r.respaldosRestantes ?? 0 },
    [await cerrarPaso2(env, request), await abrirSesion(env, usuario)]
  );
}

export async function salir({ request, env }: Ctx): Promise<Response> {
  if (!isSameOrigin(request)) return jsonResponse(403, { message: "Origen no permitido." });
  return jsonConCookies(200, { ok: true }, [await cerrarSesion(env, request)]);
}

export async function sesion({ request, env }: Ctx): Promise<Response> {
  const s = await sesionActual(env, request);
  if (!s) return jsonResponse(401, { autenticado: false });
  return jsonResponse(200, { autenticado: true, usuario: s.usuario, inactividadSegundos: await duracionSesion(env) });
}

/** POST: la pantalla avisa que hubo movimiento real; renueva el plazo. */
export async function actividad(ctx: Ctx): Promise<Response> {
  const s = await exigirSesion(ctx, true);
  if (s instanceof Response) return s;
  const cookie = await renovarSesion(ctx.env, ctx.request);
  return jsonConCookies(200, { autenticado: true, segundosRestantes: await duracionSesion(ctx.env) }, [cookie]);
}

export async function seguridadGet(ctx: Ctx): Promise<Response> {
  const s = await exigirSesion(ctx, false);
  if (s instanceof Response) return s;
  const registro = await obtenerUsuario(ctx.env);
  return jsonResponse(200, {
    ...estadoDe(registro),
    cantidadRespaldos: CANTIDAD_RESPALDOS,
    usuario: registro?.usuario || "",
    inactividadMinutos: Math.round((await duracionSesion(ctx.env)) / 60),
    opcionesInactividad: OPCIONES_INACTIVIDAD,
  });
}

export async function seguridadPost(ctx: Ctx, config: ConfigPanel): Promise<Response> {
  const s = await exigirSesion(ctx, true);
  if (s instanceof Response) return s;
  const { env, request } = ctx;
  if (!limpiarVariable(env.ADMIN_PEPPER)) return jsonResponse(503, { message: "Falta configuración en el servidor." });
  const cuerpo = await leerJson(request);
  if (!cuerpo) return jsonResponse(400, { message: "Solicitud inválida." });
  const codigo = typeof cuerpo.codigo === "string" ? cuerpo.codigo : "";

  switch (cuerpo.accion) {
    case "proponer": {
      const r = await proponer(env, config.nombreSitio);
      return r.ok ? jsonResponse(200, { ok: true, qr: r.qr, secretoLegible: r.secretoLegible }) : jsonResponse(400, { message: r.motivo });
    }
    case "activar": {
      const r = await activar(env, codigo);
      return r.ok ? jsonResponse(200, { ok: true, respaldos: r.respaldos }) : jsonResponse(400, { message: r.motivo });
    }
    case "desactivar": {
      if (!derivadoValido(cuerpo.derivado)) return jsonResponse(400, { message: "Escribe tu contraseña." });
      if (!(await claveCorrecta(env, cuerpo.derivado))) return jsonResponse(400, { message: "La contraseña no es correcta." });
      const r = await desactivar(env, codigo);
      return r.ok ? jsonResponse(200, { ok: true }) : jsonResponse(400, { message: r.motivo });
    }
    case "renovar-respaldos": {
      const r = await renovarRespaldos(env, codigo);
      return r.ok ? jsonResponse(200, { ok: true, respaldos: r.respaldos }) : jsonResponse(400, { message: r.motivo });
    }
    case "cambiar-clave": {
      const { derivadoActual, derivadoNuevo } = cuerpo;
      if (!derivadoValido(derivadoActual) || !derivadoValido(derivadoNuevo)) {
        return jsonResponse(400, { message: "Completa las dos contraseñas." });
      }
      const registro = await obtenerUsuario(env);
      if (registro?.dosFactores) {
        const segundo = await comprobarSegundoFactor(env, registro, codigo);
        if (!segundo.ok) return jsonResponse(400, { message: segundo.motivo });
      }
      const r = await cambiarClave(env, derivadoActual, derivadoNuevo);
      if (!r.ok) return jsonResponse(400, { message: r.motivo });
      return jsonResponse(200, { ok: true, sesionesCerradas: await cerrarOtrasSesiones(env, request) });
    }
    case "inactividad": {
      if (!inactividadValida(cuerpo.minutos)) return jsonResponse(400, { message: "Ese plazo no es una de las opciones." });
      const registro = await obtenerUsuario(env);
      if (!registro) return jsonResponse(400, { message: "No hay usuario configurado." });
      registro.inactividadMinutos = cuerpo.minutos;
      if (!(await guardarUsuario(env, registro))) return jsonResponse(400, { message: "No se pudo guardar. Intenta de nuevo." });
      return jsonConCookies(200, { ok: true, minutos: cuerpo.minutos }, [await reajustarSesion(env, request)]);
    }
    default:
      return jsonResponse(400, { message: "Esa acción no existe." });
  }
}
