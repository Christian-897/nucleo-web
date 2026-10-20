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
  aceptarInvitacion,
  anularInvitacion,
  crearInvitacion,
  esDueno,
  invitacionVigente,
  listarInvitaciones,
  listarUsuarios,
  OPCIONES_VIGENCIA,
  quitarUsuario,
  cambiarPermisoPedidos,
  restablecerDobleFactor,
  tokenValido,
  vigenciaValida,
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

const MENSAJE_USUARIO = "El usuario debe tener entre 3 y 40 caracteres: letras, números, punto, guion o guion bajo.";

/**
 * POST con `invitacion`: revisa el enlace (accion "revisar") o crea el
 * usuario invitado. No necesita ADMIN_SETUP_TOKEN: la invitación hace de llave.
 */
async function usarInvitacion(ctx: Ctx, cuerpo: Record<string, unknown>): Promise<Response> {
  const { request, env } = ctx;
  if (!listo(ctx)) return jsonResponse(503, { message: "El panel no está disponible." });
  if (!(await checkRateLimit(env.REVIEWS_KV, `admin-invitacion:${getClientIp(request)}`, 10, 600))) {
    return jsonResponse(429, { message: "Demasiados intentos. Espera unos minutos." });
  }
  const { invitacion, usuario, derivado } = cuerpo;
  const VENCIDA = { message: "Este enlace ya se usó o venció. Pide uno nuevo a quien te invitó." };
  if (!tokenValido(invitacion)) return jsonResponse(410, VENCIDA);
  if (cuerpo.accion === "revisar") {
    return (await invitacionVigente(env, invitacion)) ? jsonResponse(200, { ok: true }) : jsonResponse(410, VENCIDA);
  }
  if (typeof usuario !== "string" || !/^[a-zA-Z0-9._-]{3,40}$/.test(usuario)) return jsonResponse(400, { message: MENSAJE_USUARIO });
  if (!derivadoValido(derivado)) return jsonResponse(400, { message: "La contraseña no llegó correctamente." });
  const r = await aceptarInvitacion(env, invitacion, usuario, derivado);
  if (!r.ok) return jsonResponse(r.status || 400, { message: r.motivo });
  return jsonResponse(200, { ok: true });
}

/** POST: crea el usuario dueño con la clave de instalación, o uno invitado con su enlace. */
export async function instalar(ctx: Ctx): Promise<Response> {
  const { request, env } = ctx;
  if (!isSameOrigin(request)) return jsonResponse(403, { message: "Origen no permitido." });
  const cuerpo = await leerJson(request);
  if (cuerpo && "invitacion" in cuerpo) return usarInvitacion(ctx, cuerpo);
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
  if (!cuerpo) return jsonResponse(400, { message: "Solicitud inválida." });
  const { usuario, derivado, claveInstalacion } = cuerpo;
  // Comparación en tiempo constante (en Muebles Crea era `!==`).
  if (typeof claveInstalacion !== "string" || !compararSeguro(claveInstalacion.trim(), token)) {
    return jsonResponse(401, { message: "Clave de instalación incorrecta." });
  }
  if (typeof usuario !== "string" || !/^[a-zA-Z0-9._-]{3,40}$/.test(usuario)) {
    return jsonResponse(400, { message: MENSAJE_USUARIO });
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
  const registro = await obtenerUsuario(env, usuario);
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
  const registro = await obtenerUsuario(env, usuario);
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
  return jsonResponse(200, { autenticado: true, usuario: s.usuario, inactividadSegundos: await duracionSesion(env, s.usuario) });
}

/** POST: la pantalla avisa que hubo movimiento real; renueva el plazo. */
export async function actividad(ctx: Ctx): Promise<Response> {
  const s = await exigirSesion(ctx, true);
  if (s instanceof Response) return s;
  const cookie = await renovarSesion(ctx.env, ctx.request);
  return jsonConCookies(200, { autenticado: true, segundosRestantes: await duracionSesion(ctx.env, s.usuario) }, [cookie]);
}

export async function seguridadGet(ctx: Ctx): Promise<Response> {
  const s = await exigirSesion(ctx, false);
  if (s instanceof Response) return s;
  const registro = await obtenerUsuario(ctx.env, s.usuario);
  const dueno = esDueno(registro);
  return jsonResponse(200, {
    ...estadoDe(registro),
    cantidadRespaldos: CANTIDAD_RESPALDOS,
    usuario: registro?.usuario || "",
    inactividadMinutos: Math.round((await duracionSesion(ctx.env, s.usuario)) / 60),
    opcionesInactividad: OPCIONES_INACTIVIDAD,
    dueno,
    // Solo el dueño ve y maneja a los demás usuarios.
    ...(dueno
      ? { usuarios: await listarUsuarios(ctx.env), invitaciones: await listarInvitaciones(ctx.env), opcionesVigencia: OPCIONES_VIGENCIA }
      : {}),
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
  const yo = s.usuario;

  switch (cuerpo.accion) {
    case "proponer": {
      const r = await proponer(env, config.nombreSitio, yo);
      return r.ok ? jsonResponse(200, { ok: true, qr: r.qr, secretoLegible: r.secretoLegible }) : jsonResponse(400, { message: r.motivo });
    }
    case "activar": {
      const r = await activar(env, codigo, yo);
      return r.ok ? jsonResponse(200, { ok: true, respaldos: r.respaldos }) : jsonResponse(400, { message: r.motivo });
    }
    case "desactivar": {
      if (!derivadoValido(cuerpo.derivado)) return jsonResponse(400, { message: "Escribe tu contraseña." });
      if (!(await claveCorrecta(env, cuerpo.derivado, yo))) return jsonResponse(400, { message: "La contraseña no es correcta." });
      const r = await desactivar(env, codigo, yo);
      return r.ok ? jsonResponse(200, { ok: true }) : jsonResponse(400, { message: r.motivo });
    }
    case "renovar-respaldos": {
      const r = await renovarRespaldos(env, codigo, yo);
      return r.ok ? jsonResponse(200, { ok: true, respaldos: r.respaldos }) : jsonResponse(400, { message: r.motivo });
    }
    case "cambiar-clave": {
      const { derivadoActual, derivadoNuevo } = cuerpo;
      if (!derivadoValido(derivadoActual) || !derivadoValido(derivadoNuevo)) {
        return jsonResponse(400, { message: "Completa las dos contraseñas." });
      }
      const registro = await obtenerUsuario(env, yo);
      if (registro?.dosFactores) {
        const segundo = await comprobarSegundoFactor(env, registro, codigo);
        if (!segundo.ok) return jsonResponse(400, { message: segundo.motivo });
      }
      const r = await cambiarClave(env, derivadoActual, derivadoNuevo, yo);
      if (!r.ok) return jsonResponse(400, { message: r.motivo });
      return jsonResponse(200, { ok: true, sesionesCerradas: await cerrarOtrasSesiones(env, request, yo) });
    }
    case "inactividad": {
      if (!inactividadValida(cuerpo.minutos)) return jsonResponse(400, { message: "Ese plazo no es una de las opciones." });
      const registro = await obtenerUsuario(env, yo);
      if (!registro) return jsonResponse(400, { message: "No hay usuario configurado." });
      registro.inactividadMinutos = cuerpo.minutos;
      if (!(await guardarUsuario(env, registro))) return jsonResponse(400, { message: "No se pudo guardar. Intenta de nuevo." });
      return jsonConCookies(200, { ok: true, minutos: cuerpo.minutos }, [await reajustarSesion(env, request)]);
    }
    case "invitar":
    case "anular-invitacion":
    case "quitar-usuario":
    case "restablecer-2fa":
    case "permiso-pedidos": {
      const registro = await obtenerUsuario(env, yo);
      if (!registro || !esDueno(registro)) return jsonResponse(403, { message: "Solo el dueño del panel puede manejar los usuarios." });
      if (cuerpo.accion === "anular-invitacion") {
        return (await anularInvitacion(env, String(cuerpo.id || "")))
          ? jsonResponse(200, { ok: true })
          : jsonResponse(404, { message: "Esa invitación ya no existe." });
      }
      if (cuerpo.accion === "permiso-pedidos") {
        if (typeof cuerpo.valor !== "boolean") return jsonResponse(400, { message: "Solicitud inválida." });
        const r = await cambiarPermisoPedidos(env, String(cuerpo.usuario || ""), cuerpo.valor);
        return r.ok ? jsonResponse(200, { ok: true }) : jsonResponse(400, { message: r.motivo });
      }
      if (cuerpo.accion === "restablecer-2fa") {
        const r = await restablecerDobleFactor(env, String(cuerpo.usuario || ""));
        return r.ok ? jsonResponse(200, { ok: true }) : jsonResponse(400, { message: r.motivo });
      }
      if (cuerpo.accion === "quitar-usuario") {
        const r = await quitarUsuario(env, String(cuerpo.usuario || ""));
        return r.ok ? jsonResponse(200, { ok: true }) : jsonResponse(400, { message: r.motivo });
      }
      // Invitar da acceso a la tienda: se confirma con la contraseña (y el código, si hay doble factor),
      // para que una sesión olvidada abierta no baste para meter a alguien.
      if (!vigenciaValida(cuerpo.horas)) return jsonResponse(400, { message: "Elige cuánto dura el enlace." });
      if (!derivadoValido(cuerpo.derivado) || !(await claveCorrecta(env, cuerpo.derivado, yo))) {
        return jsonResponse(400, { message: "La contraseña no es correcta." });
      }
      if (registro.dosFactores) {
        const segundo = await comprobarSegundoFactor(env, registro, codigo);
        if (!segundo.ok) return jsonResponse(400, { message: segundo.motivo });
      }
      const token = await crearInvitacion(env, yo, cuerpo.horas);
      return jsonResponse(200, { ok: true, token, horas: cuerpo.horas });
    }
    default:
      return jsonResponse(400, { message: "Esa acción no existe." });
  }
}
