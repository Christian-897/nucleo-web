/**
 * BASE32, EL ALFABETO DE LOS CÓDIGOS DE AUTENTICACIÓN.
 *
 * El secreto del doble factor se comparte con la aplicación del teléfono
 * escrito en base32 (RFC 4648): 32 símbolos, las letras A–Z y los
 * dígitos 2–7.
 *
 * ¿Por qué ese alfabeto y no el habitual base64? Porque este texto lo
 * lee y a veces lo escribe una persona. No hay minúsculas que confundir
 * con mayúsculas, y están fuera el 0, el 1 y el 8, que se confunden con
 * la O, la I y la B. Es el mismo criterio de los códigos de producto
 * escritos a mano.
 *
 * No lleva relleno con "=": las aplicaciones de autenticación no lo
 * esperan y ensucia el código QR.
 */

const ALFABETO = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function aBase32(datos: Uint8Array): string {
  let bits = 0;
  let acumulado = 0;
  let salida = "";
  for (const byte of datos) {
    acumulado = (acumulado << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      salida += ALFABETO[(acumulado >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  // Los bits que sobran se completan con ceros a la derecha.
  if (bits > 0) salida += ALFABETO[(acumulado << (5 - bits)) & 31];
  return salida;
}

/**
 * Devuelve los bytes, o null si el texto no es base32 válido.
 *
 * Se aceptan minúsculas, espacios y el relleno con "=": si alguien
 * escribe el secreto a mano, lo va a hacer en grupos separados y quizá
 * sin fijarse en las mayúsculas. Rechazarlo por eso sería una molestia
 * sin ninguna ganancia de seguridad.
 */
export function desdeBase32(texto: string): Uint8Array | null {
  const limpio = texto.toUpperCase().replace(/[\s=]/g, "");
  if (limpio.length === 0) return null;

  let bits = 0;
  let acumulado = 0;
  const salida: number[] = [];
  for (const caracter of limpio) {
    const valor = ALFABETO.indexOf(caracter);
    if (valor < 0) return null;
    acumulado = (acumulado << 5) | valor;
    bits += 5;
    if (bits >= 8) {
      salida.push((acumulado >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return new Uint8Array(salida);
}

/** El secreto en grupos de cuatro, para escribirlo a mano sin perderse. */
export function enGrupos(texto: string, tamano = 4): string {
  return (texto.match(new RegExp(`.{1,${tamano}}`, "g")) || []).join(" ");
}
