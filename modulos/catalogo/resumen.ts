/**
 * RESUMEN PARA GOOGLE (v0.44). La descripción que se pone en
 * <meta name="description"> y og:description sale del texto que se escribe en
 * el panel, que suele traer emojis, saltos de línea y varios párrafos.
 * Google muestra unos 155 caracteres: se quitan emojis y saltos y se corta en
 * una palabra completa, con «…» si se cortó.
 */

/** Emojis, sus variantes y uniones (💗, ✨, 👍🏽, 👩‍👧). Las letras con tilde y la ñ no se tocan. */
const EMOJI = /[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}\u{1F3FB}-\u{1F3FF}\u{FE0E}\u{FE0F}\u{200D}\u{20E3}]/gu;

/** Texto plano en una línea: sin emojis, sin saltos y sin espacios repetidos. */
export function textoPlano(texto: string): string {
  return texto
    .replace(EMOJI, " ")
    .replace(/\s+/g, " ")
    .replace(/\s+([.,;:!?)])/g, "$1")
    .trim();
}

/**
 * Resumen corto para buscadores: hasta `maximo` caracteres, cortado en una
 * palabra completa. Vacío si el texto no tiene nada que decir.
 */
export function resumenParaGoogle(texto: string | undefined | null, maximo = 155): string {
  const plano = textoPlano(texto ?? "");
  if (plano.length <= maximo) return plano;
  const corte = plano.slice(0, maximo - 1);
  const espacio = corte.lastIndexOf(" ");
  // Si no hay un espacio razonable (una palabra larguísima), se corta igual.
  const base = espacio > maximo * 0.6 ? corte.slice(0, espacio) : corte;
  return `${base.replace(/[\s,;:.\-–—]+$/u, "")}…`;
}
