/**
 * Módulo mapa: muestra la tienda o el punto de retiro en un mapa de Google,
 * gratis y sin clave de API.
 *
 *   import { normalizarUbicacion, urlInsercion, urlComoLlegar } from "nucleo-web/mapa";
 *
 * Componente: "nucleo-web/mapa/Mapa.astro". Navegador: "nucleo-web/mapa/cliente".
 *
 * Cómo funciona:
 * - La ubicación es una dirección escrita ("Av. Providencia 1234, Providencia"),
 *   unas coordenadas ("-33.4372,-70.6506") o un enlace LARGO de Google Maps.
 *   Siempre se reduce a un texto de búsqueda: nunca se inserta tal cual un
 *   enlace que escribió una persona.
 * - El mapa NO se carga al abrir la página: se ve un recuadro con la
 *   dirección y el botón "Ver mapa". Al tocarlo se inserta el <iframe> de
 *   Google. Así la página carga rápido y Google no recibe nada de quien no
 *   lo pidió.
 * - El sitio debe permitir el origen en la CSP: `frame-src https://www.google.com`
 *   (constante ORIGEN_MAPA).
 *
 * Sin estado, sin secretos y sin dependencias: sirve en Astro, en Functions
 * y en el navegador.
 */

/** Origen del mapa insertado. Va en `frame-src` de la CSP del sitio. */
export const ORIGEN_MAPA = "https://www.google.com";

/** Inicio obligatorio de toda dirección de mapa insertado. */
const BASE_INSERCION = `${ORIGEN_MAPA}/maps?`;

/** Dominios de Google Maps aceptados en un enlace pegado. */
const HOSTS_MAPS = new Set([
  "google.com",
  "www.google.com",
  "maps.google.com",
  "google.cl",
  "www.google.cl",
  "maps.google.cl",
]);

/** Enlaces cortos de "Compartir": no traen la dirección adentro. */
const HOSTS_CORTOS = new Set(["maps.app.goo.gl", "goo.gl"]);

export const LARGO_MAXIMO_UBICACION = 200;
export const ZOOM_POR_DEFECTO = 16;

export type ResultadoUbicacion = { ok: true; valor: string } | { ok: false; error: string };

const ERROR_CORTO =
  "Ese enlace corto no trae la dirección. Escribe la dirección (ej.: Av. Providencia 1234, Providencia) o pega el enlace largo de Google Maps.";
const ERROR_OTRO_SITIO = "Solo se aceptan enlaces de Google Maps. También puedes escribir la dirección.";
const ERROR_ENLACE = "No encontramos la dirección en ese enlace. Mejor escríbela (ej.: Av. Providencia 1234, Providencia).";

/** Texto escrito por una persona: sin caracteres de control ni espacios de más. */
function limpiar(v: string): string {
  return v
    .normalize("NFC")
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f​-‏‪-‮⁦-⁩]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** "lat,lng" con rangos válidos → normalizado (hasta 6 decimales). Si no, "". */
export function coordenadas(texto: string): string {
  const m = /^\s*(-?\d{1,2}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)\s*$/.exec(texto);
  if (!m) return "";
  const lat = Number(m[1]);
  const lng = Number(m[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return "";
  const corto = (n: number) => String(Math.round(n * 1e6) / 1e6);
  return `${corto(lat)},${corto(lng)}`;
}

/** Saca la ubicación de un enlace largo de Google Maps. "" si no la trae. */
function desdeEnlace(u: URL): string {
  for (const p of ["q", "query", "destination", "daddr"]) {
    const v = u.searchParams.get(p);
    if (v && limpiar(v)) return limpiar(v);
  }
  // /maps/place/Av.+Providencia+1234,+Providencia/@-33.43,-70.61,17z
  const lugar = /\/maps\/place\/([^/]+)/.exec(u.pathname);
  if (lugar) {
    try {
      const texto = limpiar(decodeURIComponent(lugar[1].replace(/\+/g, " ")));
      if (texto) return texto;
    } catch {
      /* secuencia % inválida: se intenta con las coordenadas */
    }
  }
  const arroba = /@(-?\d{1,2}(?:\.\d+)?),(-?\d{1,3}(?:\.\d+)?)/.exec(u.pathname);
  if (arroba) return coordenadas(`${arroba[1]},${arroba[2]}`);
  return "";
}

/**
 * Valida lo que escribió la persona y lo deja como texto de búsqueda:
 * una dirección limpia o "lat,lng". Nunca devuelve un enlace.
 */
export function normalizarUbicacion(entrada: unknown): ResultadoUbicacion {
  if (typeof entrada !== "string") return { ok: false, error: "Ubicación inválida." };
  const texto = limpiar(entrada);
  if (!texto) return { ok: false, error: "Escribe la dirección." };

  // Un enlace se reconoce por "://" (o "www."). "Local: 5" sigue siendo una dirección.
  // Lo que no es enlace queda como texto de búsqueda: nunca se vuelve un enlace.
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(texto) || /^www\./i.test(texto)) {
    if (/^www\./i.test(texto)) return normalizarUbicacion(`https://${texto}`);
    let u: URL;
    try {
      u = new URL(texto);
    } catch {
      return { ok: false, error: ERROR_OTRO_SITIO };
    }
    const host = u.hostname.toLowerCase();
    if (HOSTS_CORTOS.has(host)) return { ok: false, error: ERROR_CORTO };
    if ((u.protocol !== "https:" && u.protocol !== "http:") || !HOSTS_MAPS.has(host) || u.username || u.password) {
      return { ok: false, error: ERROR_OTRO_SITIO };
    }
    if (!u.pathname.startsWith("/maps") && !(host.startsWith("maps.") && u.searchParams.has("q"))) {
      return { ok: false, error: ERROR_OTRO_SITIO };
    }
    const sacado = desdeEnlace(u);
    if (!sacado) return { ok: false, error: ERROR_ENLACE };
    return validarTexto(sacado);
  }
  return validarTexto(texto);
}

function validarTexto(texto: string): ResultadoUbicacion {
  const c = coordenadas(texto);
  if (c) return { ok: true, valor: c };
  if (texto.length < 3) return { ok: false, error: "La dirección es muy corta." };
  if (texto.length > LARGO_MAXIMO_UBICACION) {
    return { ok: false, error: `Máximo ${LARGO_MAXIMO_UBICACION} caracteres (tiene ${texto.length}).` };
  }
  if (!/[\p{L}\p{N}]/u.test(texto)) return { ok: false, error: "Escribe la dirección." };
  if (/[<>{}`\\]/.test(texto)) return { ok: false, error: "La dirección tiene caracteres que no corresponden." };
  return { ok: true, valor: texto };
}

function zoomValido(zoom: unknown): number {
  const z = Math.round(Number(zoom));
  return Number.isFinite(z) && z >= 3 && z <= 20 ? z : ZOOM_POR_DEFECTO;
}

/**
 * Dirección del mapa insertado (sin clave de API). Recibe una ubicación YA
 * normalizada; si no lo está, se normaliza aquí y, si no sirve, devuelve "".
 */
export function urlInsercion(ubicacion: string, opciones: { zoom?: number } = {}): string {
  const r = normalizarUbicacion(ubicacion);
  if (!r.ok) return "";
  return `${BASE_INSERCION}q=${encodeURIComponent(r.valor)}&z=${zoomValido(opciones.zoom)}&hl=es&output=embed`;
}

/** Enlace "Cómo llegar" (abre Google Maps con la ruta hasta la ubicación). */
export function urlComoLlegar(ubicacion: string): string {
  const r = normalizarUbicacion(ubicacion);
  return r.ok ? `${ORIGEN_MAPA}/maps/dir/?api=1&destination=${encodeURIComponent(r.valor)}` : "";
}

/** Enlace "Ver en Google Maps" (el lugar, sin ruta). */
export function urlVerEnMaps(ubicacion: string): string {
  const r = normalizarUbicacion(ubicacion);
  return r.ok ? `${ORIGEN_MAPA}/maps/search/?api=1&query=${encodeURIComponent(r.valor)}` : "";
}

/**
 * ¿Es una dirección de mapa insertado armada por este módulo? El navegador
 * lo revisa antes de crear el <iframe>: un atributo alterado no inserta
 * otra página.
 */
export function insercionPermitida(src: unknown): src is string {
  if (typeof src !== "string" || !src.startsWith(BASE_INSERCION) || src.length > 1000) return false;
  try {
    const u = new URL(src);
    return u.origin === ORIGEN_MAPA && u.pathname === "/maps" && u.searchParams.get("output") === "embed" && !!u.searchParams.get("q");
  } catch {
    return false;
  }
}
