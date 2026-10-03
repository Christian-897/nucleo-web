/**
 * DOBLE FACTOR (TOTP, RFC 6238) con códigos de respaldo. Trasladado desde
 * Muebles Crea. Activar son dos pasos (proponer → activar con un código)
 * para que nadie quede fuera del panel si cierra la ventana a mitad.
 */
import { compararSeguro } from "../../core/cripto";
import { limpiarVariable } from "../../core/correo";
import { guardarUsuario, obtenerUsuario, type UsuarioAdmin } from "./auth";
import { enGrupos } from "./base32";
import type { EnvPanel } from "./config";
import { qrComoSvg } from "./qr";
import {
  CANTIDAD_RESPALDOS,
  cifrarSecreto,
  comprobar,
  descifrarSecreto,
  direccionOtp,
  normalizarRespaldo,
  nuevoSecreto,
  nuevosRespaldos,
  resumenRespaldo,
} from "./totp";

export { CANTIDAD_RESPALDOS };

const pepper = (env: EnvPanel) => limpiarVariable(env.ADMIN_PEPPER);
const SIN_CONFIG = { ok: false, motivo: "Falta configuración en el servidor." } as const;

export interface EstadoSeguridad {
  activo: boolean;
  respaldosRestantes: number;
  activado?: string;
}

export function estadoDe(usuario: UsuarioAdmin | null): EstadoSeguridad {
  const df = usuario?.dosFactores;
  return { activo: Boolean(df), respaldosRestantes: df ? df.respaldos.length : 0, activado: df?.activado };
}

export interface Propuesta {
  ok: boolean;
  motivo?: string;
  /** SVG del código QR (se muestra como imagen, nunca como HTML). */
  qr?: string;
  secretoLegible?: string;
}

export async function proponer(env: EnvPanel, nombreSitio: string): Promise<Propuesta> {
  const p = pepper(env);
  if (!p) return SIN_CONFIG;
  const registro = await obtenerUsuario(env);
  if (!registro) return { ok: false, motivo: "No hay usuario configurado." };
  if (registro.dosFactores) return { ok: false, motivo: "El doble factor ya está activo." };
  const secreto = nuevoSecreto();
  registro.propuesta = { secreto: await cifrarSecreto(secreto, p), creada: new Date().toISOString() };
  if (!(await guardarUsuario(env, registro))) return { ok: false, motivo: "No se pudo guardar. Intenta de nuevo." };
  const qr = qrComoSvg(direccionOtp(secreto, registro.usuario, nombreSitio), "Código para configurar el doble factor");
  if (!qr) return { ok: false, motivo: "No se pudo generar el código." };
  return { ok: true, qr, secretoLegible: enGrupos(secreto) };
}

export interface Activacion {
  ok: boolean;
  motivo?: string;
  /** En claro, se muestran UNA vez. */
  respaldos?: string[];
}

async function resumenes(codigos: string[], p: string) {
  return Promise.all(codigos.map((c) => resumenRespaldo(c, p)));
}

export async function activar(env: EnvPanel, codigo: string): Promise<Activacion> {
  const p = pepper(env);
  if (!p) return SIN_CONFIG;
  const registro = await obtenerUsuario(env);
  if (!registro) return { ok: false, motivo: "No hay usuario configurado." };
  if (registro.dosFactores) return { ok: false, motivo: "El doble factor ya está activo." };
  if (!registro.propuesta) return { ok: false, motivo: "Vuelve a empezar: no hay una configuración en curso." };
  const secreto = await descifrarSecreto(registro.propuesta.secreto, p);
  if (!secreto) return { ok: false, motivo: "Vuelve a empezar: la configuración se perdió." };
  const r = await comprobar(secreto, codigo);
  if (!r.ok) {
    return {
      ok: false,
      motivo: r.motivo === "formato" ? "El código son seis dígitos." : "Ese código no corresponde. Revisa que la hora de tu teléfono esté correcta.",
    };
  }
  const respaldos = nuevosRespaldos();
  registro.dosFactores = {
    secreto: registro.propuesta.secreto,
    ultimoPeriodo: r.periodo || 0,
    respaldos: await resumenes(respaldos, p),
    activado: new Date().toISOString(),
  };
  delete registro.propuesta;
  if (!(await guardarUsuario(env, registro))) return { ok: false, motivo: "No se pudo guardar. Intenta de nuevo." };
  return { ok: true, respaldos };
}

export async function desactivar(env: EnvPanel, codigo: string): Promise<{ ok: boolean; motivo?: string }> {
  if (!pepper(env)) return SIN_CONFIG;
  const registro = await obtenerUsuario(env);
  if (!registro?.dosFactores) return { ok: false, motivo: "El doble factor no está activo." };
  const c = await comprobarSegundoFactor(env, registro, codigo);
  if (!c.ok) return { ok: false, motivo: c.motivo };
  delete registro.dosFactores;
  delete registro.propuesta;
  if (!(await guardarUsuario(env, registro))) return { ok: false, motivo: "No se pudo guardar. Intenta de nuevo." };
  return { ok: true };
}

export async function renovarRespaldos(env: EnvPanel, codigo: string): Promise<Activacion> {
  const p = pepper(env);
  if (!p) return SIN_CONFIG;
  const registro = await obtenerUsuario(env);
  if (!registro?.dosFactores) return { ok: false, motivo: "El doble factor no está activo." };
  const c = await comprobarSegundoFactor(env, registro, codigo);
  if (!c.ok) return { ok: false, motivo: c.motivo };
  const respaldos = nuevosRespaldos();
  registro.dosFactores.respaldos = await resumenes(respaldos, p);
  if (!(await guardarUsuario(env, registro))) return { ok: false, motivo: "No se pudo guardar. Intenta de nuevo." };
  return { ok: true, respaldos };
}

export interface ResultadoSegundoFactor {
  ok: boolean;
  motivo?: string;
  fueRespaldo?: boolean;
  respaldosRestantes?: number;
}

/** Acepta el código del teléfono o un código de respaldo (que se gasta). */
export async function comprobarSegundoFactor(
  env: EnvPanel,
  registro: UsuarioAdmin,
  entrante: string
): Promise<ResultadoSegundoFactor> {
  const df = registro.dosFactores;
  const p = pepper(env);
  if (!df || !p) return { ok: false, motivo: "El doble factor no está activo." };

  const texto = String(entrante || "").trim();
  const normalizado = normalizarRespaldo(texto);
  if (/^[A-Z0-9]{10}$/.test(normalizado) && !/^\d{10}$/.test(normalizado)) {
    const resumen = await resumenRespaldo(normalizado, p);
    const quedan: string[] = [];
    let usado = false;
    for (const guardado of df.respaldos) {
      if (!usado && compararSeguro(guardado, resumen)) {
        usado = true;
        continue;
      }
      quedan.push(guardado);
    }
    if (!usado) return { ok: false, motivo: "Ese código de respaldo no es válido." };
    df.respaldos = quedan;
    await guardarUsuario(env, registro);
    return { ok: true, fueRespaldo: true, respaldosRestantes: quedan.length };
  }

  const secreto = await descifrarSecreto(df.secreto, p);
  if (!secreto) return { ok: false, motivo: "No se pudo comprobar el código. Avisa a quien mantiene el sitio." };
  const r = await comprobar(secreto, texto, df.ultimoPeriodo);
  if (!r.ok) {
    const motivos: Record<string, string> = {
      formato: "El código son seis dígitos, o uno de tus códigos de respaldo.",
      usado: "Ese código ya se usó. Espera el siguiente.",
      incorrecto: "Ese código no corresponde. Revisa la hora de tu teléfono.",
    };
    return { ok: false, motivo: motivos[r.motivo || "incorrecto"] };
  }
  df.ultimoPeriodo = r.periodo || df.ultimoPeriodo;
  await guardarUsuario(env, registro);
  return { ok: true, respaldosRestantes: df.respaldos.length };
}
