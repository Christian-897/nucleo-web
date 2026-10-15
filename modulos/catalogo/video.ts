/**
 * VIDEO DEL PRODUCTO (opcional, uno por producto): un video de YouTube.
 *
 * La dueña pega el enlace tal como lo copia (youtu.be/…, youtube.com/watch?v=…,
 * youtube.com/shorts/…). Se guarda SOLO el código del video (11 letras,
 * números, - y _), nunca la dirección: así lo que llega a la página no puede
 * apuntar a otro sitio ni meter marcado.
 *
 * En la ficha se inserta desde youtube-nocookie.com (sin cookies de
 * seguimiento hasta que se reproduce), y solo cuando el comprador lo toca.
 * El sitio debe permitirlo en su CSP:  frame-src https://www.youtube-nocookie.com
 */

export const ID_VIDEO = /^[A-Za-z0-9_-]{11}$/;
const HOSTS = new Set(["youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com", "youtube-nocookie.com", "www.youtube-nocookie.com"]);

/** Código del video a partir de un enlace de YouTube (o del código solo). null si no es de YouTube. */
export function idVideoYoutube(texto: unknown): string | null {
  if (typeof texto !== "string") return null;
  const t = texto.trim();
  if (ID_VIDEO.test(t)) return t;
  if (t.length > 300) return null;
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(t) ? t : `https://${t}`);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  const host = url.hostname.toLowerCase();
  let id: string | null = null;
  if (host === "youtu.be" || host === "www.youtu.be") {
    id = url.pathname.split("/")[1] ?? null;
  } else if (HOSTS.has(host)) {
    const partes = url.pathname.split("/").filter(Boolean);
    if (partes[0] === "watch") id = url.searchParams.get("v");
    else if (["shorts", "embed", "live", "v"].includes(partes[0] ?? "")) id = partes[1] ?? null;
  }
  return id && ID_VIDEO.test(id) ? id : null;
}

/** Dirección para insertar el video (sin cookies, sin videos ajenos al final). */
export function urlInsercionVideo(id: string): string {
  if (!ID_VIDEO.test(id)) throw new Error("código de video inválido");
  return `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0&playsinline=1`;
}

/** Enlace para mostrarle a la dueña en el panel. */
export function enlaceVideo(id: string): string {
  return `https://youtu.be/${id}`;
}
