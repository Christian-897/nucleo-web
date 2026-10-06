/**
 * Validación de cada valor según su tipo. Todo lo que llega del panel pasa
 * por aquí antes de guardarse: nunca se confía en la pantalla.
 */
import { enlaceCorreo, formatearTelefono, normalizarTelefono, urlRed } from "../contacto/index";
import { esColor } from "./color";
import { fuentePorId } from "./fuentes";
import type { Campo, Esquema, Valores } from "./tipos";

const MEDIA = /^\/media\/[a-zA-Z0-9_-]{8,80}$/;
const IMG = /^\/img\/[a-zA-Z0-9/_.-]{1,150}$/;

/** Imagen aceptable: una foto subida al panel (/media/) o una del propio sitio (/img/). */
export function imagenValida(v: unknown): v is string {
  return typeof v === "string" && (MEDIA.test(v) || (IMG.test(v) && !v.includes("..")));
}

/** Limpia texto escrito por una persona: sin caracteres de control ni espacios de más. */
export function limpiarTexto(v: string, multilinea: boolean): string {
  let t = v.normalize("NFC").replace(/\r\n?/g, "\n");
  // eslint-disable-next-line no-control-regex
  t = t.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f​-‏‪-‮⁦-⁩]/g, "");
  if (!multilinea) t = t.replace(/\n+/g, " ");
  t = t
    .split("\n")
    .map((l) => l.replace(/[ \t]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n");
  return t.trim();
}

export type ResultadoValor = { ok: true; valor: string } | { ok: false; error: string };

export function validarValor(campo: Campo, entrada: unknown): ResultadoValor {
  if (typeof entrada !== "string") return { ok: false, error: "Valor inválido." };
  const crudo = entrada.trim();
  if (!crudo) {
    if (campo.opcional) return { ok: true, valor: "" };
    if (["texto", "parrafo", "color", "fuente", "imagen"].includes(campo.tipo)) return { ok: false, error: "Este campo no puede quedar vacío." };
    return { ok: true, valor: "" };
  }
  switch (campo.tipo) {
    case "texto":
    case "parrafo": {
      const multilinea = campo.tipo === "parrafo";
      const v = limpiarTexto(crudo, multilinea);
      const max = campo.max ?? (multilinea ? 1200 : 120);
      if (v.length > max) return { ok: false, error: `Máximo ${max} caracteres (tiene ${v.length}).` };
      if (!v && !campo.opcional) return { ok: false, error: "Este campo no puede quedar vacío." };
      return { ok: true, valor: v };
    }
    case "color":
      return esColor(crudo) ? { ok: true, valor: crudo.toLowerCase() } : { ok: false, error: "Color inválido (formato #rrggbb)." };
    case "fuente": {
      const f = fuentePorId(crudo);
      if (!f) return { ok: false, error: "Esa tipografía no está en la lista." };
      if (campo.rol && !f.roles.includes(campo.rol)) return { ok: false, error: "Esa tipografía no sirve para este uso." };
      return { ok: true, valor: f.id };
    }
    case "imagen":
      return imagenValida(crudo) ? { ok: true, valor: crudo } : { ok: false, error: "Imagen inválida." };
    case "url": {
      if (campo.red) {
        const u = urlRed(campo.red, crudo);
        return u ? { ok: true, valor: u } : { ok: false, error: "Pega el enlace de tu perfil o tu @usuario." };
      }
      try {
        const u = new URL(crudo);
        if (u.protocol !== "https:" || u.username || u.password) throw new Error();
        return { ok: true, valor: u.toString() };
      } catch {
        return { ok: false, error: "Debe ser un enlace que empiece con https://" };
      }
    }
    case "email":
      return enlaceCorreo(crudo) ? { ok: true, valor: crudo.toLowerCase() } : { ok: false, error: "Correo inválido." };
    case "telefono": {
      const n = normalizarTelefono(crudo);
      // Se guarda ya formateado ("+56 9 1234 5678"): así se muestra en el sitio.
      return n ? { ok: true, valor: formatearTelefono(n) } : { ok: false, error: "Teléfono inválido. Ejemplo: +56 9 1234 5678" };
    }
  }
}

/** Valida un conjunto de cambios. Ignora claves que no están en el esquema. */
export function validarCambios(
  esquema: Esquema,
  entrada: unknown
): { ok: boolean; valores: Valores; errores: Record<string, string> } {
  const valores: Valores = {};
  const errores: Record<string, string> = {};
  if (!entrada || typeof entrada !== "object" || Array.isArray(entrada)) {
    return { ok: false, valores, errores: { _: "Solicitud inválida." } };
  }
  const porClave = new Map(esquema.campos.map((c) => [c.clave, c]));
  for (const [clave, v] of Object.entries(entrada as Record<string, unknown>)) {
    const campo = porClave.get(clave);
    if (!campo) continue;
    const r = validarValor(campo, v);
    if (r.ok) valores[clave] = r.valor;
    else errores[clave] = r.error;
  }
  return { ok: Object.keys(errores).length === 0, valores, errores };
}
