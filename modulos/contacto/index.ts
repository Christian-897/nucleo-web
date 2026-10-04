/**
 * Módulo contacto: arma los enlaces de WhatsApp, teléfono, correo y redes
 * sociales de un sitio a partir de sus datos, validándolos. Sin estado, sin
 * secretos y sin dependencias: sirve igual en páginas Astro, en Functions
 * de Cloudflare o en el navegador.
 *
 *   import { enlacesContacto } from "nucleo-web/contacto";
 *   const { whatsapp, redes } = enlacesContacto(sitio.contacto);
 *
 * Los datos de cada cliente (su número, sus redes) van en la configuración
 * del SITIO, nunca aquí: este repositorio es público y se reutiliza.
 */

export type RedSocial =
  | "instagram"
  | "facebook"
  | "tiktok"
  | "youtube"
  | "x"
  | "linkedin"
  | "pinterest";

export interface DatosContacto {
  /** Número de WhatsApp en cualquier formato: "+56 9 1234 5678", "912345678"… */
  whatsapp?: string;
  /** Texto con el que se abre la conversación de WhatsApp. */
  mensajeWhatsapp?: string;
  /** Teléfono para llamar (si es distinto del WhatsApp). */
  telefono?: string;
  email?: string;
  /** Enlace completo o "@usuario". Vacío = no se muestra. */
  redes?: Partial<Record<RedSocial, string>>;
  /** Código de país para números sin él. Por defecto 56 (Chile). */
  codigoPais?: string;
}

export interface Enlace {
  /** Clave estable, útil para elegir el ícono: "whatsapp", "instagram"… */
  id: string;
  etiqueta: string;
  url: string;
  /** Texto para mostrar: el número con espacios, el correo, el @usuario. */
  texto: string;
  /** true = abrir en otra pestaña (target="_blank" rel="noopener noreferrer"). */
  externo: boolean;
}

export interface EnlacesContacto {
  whatsapp: Enlace | null;
  telefono: Enlace | null;
  correo: Enlace | null;
  redes: Enlace[];
  /** Todo junto en orden: WhatsApp, teléfono, correo, redes. */
  todos: Enlace[];
}

const REDES: Record<RedSocial, { etiqueta: string; dominios: string[]; base: string }> = {
  instagram: { etiqueta: "Instagram", dominios: ["instagram.com"], base: "https://www.instagram.com/" },
  facebook: { etiqueta: "Facebook", dominios: ["facebook.com", "fb.com"], base: "https://www.facebook.com/" },
  tiktok: { etiqueta: "TikTok", dominios: ["tiktok.com"], base: "https://www.tiktok.com/@" },
  youtube: { etiqueta: "YouTube", dominios: ["youtube.com", "youtu.be"], base: "https://www.youtube.com/@" },
  x: { etiqueta: "X", dominios: ["x.com", "twitter.com"], base: "https://x.com/" },
  linkedin: { etiqueta: "LinkedIn", dominios: ["linkedin.com"], base: "https://www.linkedin.com/in/" },
  pinterest: { etiqueta: "Pinterest", dominios: ["pinterest.com", "pinterest.cl"], base: "https://www.pinterest.com/" },
};

/** Orden en que se muestran las redes. */
export const ORDEN_REDES: RedSocial[] = ["instagram", "facebook", "tiktok", "youtube", "x", "linkedin", "pinterest"];

export function etiquetaRed(red: RedSocial): string {
  return REDES[red].etiqueta;
}

/**
 * Deja un teléfono como solo dígitos con código de país ("56988887777").
 * Devuelve "" si no parece un número válido (largo E.164: 8 a 15 dígitos).
 */
export function normalizarTelefono(entrada: string | undefined, codigoPais = "56"): string {
  if (!entrada) return "";
  let d = String(entrada).replace(/\D/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  // Chile: celular de 9 dígitos que empieza con 9, o fijo de 9 dígitos.
  if (codigoPais === "56" && d.length === 9) d = "56" + d;
  else if (codigoPais !== "56" && !d.startsWith(codigoPais) && d.length <= 10) d = codigoPais + d;
  if (d.length < 8 || d.length > 15 || d.startsWith("0")) return "";
  return d;
}

/** "56988887777" → "+56 9 8888 7777". Otros países: "+" y los dígitos. */
export function formatearTelefono(digitos: string): string {
  if (/^569\d{8}$/.test(digitos)) {
    return `+56 9 ${digitos.slice(3, 7)} ${digitos.slice(7)}`;
  }
  if (/^56[2-8]\d{8}$/.test(digitos)) {
    return `+56 ${digitos.slice(2, 3)} ${digitos.slice(3, 7)} ${digitos.slice(7)}`;
  }
  return digitos ? `+${digitos}` : "";
}

export function enlaceWhatsapp(numero: string | undefined, mensaje?: string, codigoPais = "56"): string {
  const d = normalizarTelefono(numero, codigoPais);
  if (!d) return "";
  const texto = mensaje?.trim() ? `?text=${encodeURIComponent(mensaje.trim())}` : "";
  return `https://wa.me/${d}${texto}`;
}

export function enlaceTelefono(numero: string | undefined, codigoPais = "56"): string {
  const d = normalizarTelefono(numero, codigoPais);
  return d ? `tel:+${d}` : "";
}

const EMAIL = /^[^\s@<>()"',;:]+@[a-z0-9-]+(\.[a-z0-9-]+)+$/i;

export function enlaceCorreo(email: string | undefined): string {
  const e = (email ?? "").trim();
  return EMAIL.test(e) && e.length <= 254 ? `mailto:${e}` : "";
}

/**
 * Valida el enlace de una red: solo https, solo el dominio de esa red y
 * con una cuenta en la ruta (un "https://instagram.com/" pelado se
 * descarta, así los marcadores de plantilla no aparecen en el sitio).
 * Acepta también "@usuario".
 */
export function urlRed(red: RedSocial, valor: string | undefined): string {
  const v = (valor ?? "").trim();
  if (!v) return "";
  const info = REDES[red];
  if (!info) return "";
  if (/^@?[\w.\-]{1,60}$/.test(v) && !v.includes("..")) {
    return info.base + v.replace(/^@/, "");
  }
  let u: URL;
  try {
    u = new URL(v);
  } catch {
    return "";
  }
  if (u.protocol !== "https:" || u.username || u.password) return "";
  const host = u.hostname.toLowerCase();
  const permitido = info.dominios.some((d) => host === d || host.endsWith("." + d));
  if (!permitido) return "";
  if (u.pathname.replace(/\/+$/, "") === "") return "";
  return u.toString();
}

function textoRed(url: string): string {
  try {
    const parte = new URL(url).pathname.split("/").filter(Boolean).pop() ?? "";
    return parte ? (parte.startsWith("@") ? parte : "@" + parte) : url;
  } catch {
    return url;
  }
}

/** Arma todos los enlaces válidos. Lo que falte o no sea válido, no aparece. */
export function enlacesContacto(datos: DatosContacto): EnlacesContacto {
  const pais = datos.codigoPais ?? "56";

  const numWa = normalizarTelefono(datos.whatsapp, pais);
  const whatsapp: Enlace | null = numWa
    ? {
        id: "whatsapp",
        etiqueta: "WhatsApp",
        url: enlaceWhatsapp(numWa, datos.mensajeWhatsapp, pais),
        texto: formatearTelefono(numWa),
        externo: true,
      }
    : null;

  const numTel = normalizarTelefono(datos.telefono, pais);
  const telefono: Enlace | null = numTel
    ? { id: "telefono", etiqueta: "Teléfono", url: `tel:+${numTel}`, texto: formatearTelefono(numTel), externo: false }
    : null;

  const urlCorreo = enlaceCorreo(datos.email);
  const correo: Enlace | null = urlCorreo
    ? { id: "correo", etiqueta: "Correo", url: urlCorreo, texto: datos.email!.trim(), externo: false }
    : null;

  const redes: Enlace[] = [];
  for (const red of ORDEN_REDES) {
    const url = urlRed(red, datos.redes?.[red]);
    if (url) redes.push({ id: red, etiqueta: REDES[red].etiqueta, url, texto: textoRed(url), externo: true });
  }

  const todos = [whatsapp, telefono, correo, ...redes].filter((e): e is Enlace => e !== null);
  return { whatsapp, telefono, correo, redes, todos };
}
