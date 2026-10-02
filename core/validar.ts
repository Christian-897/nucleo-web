import { z } from "zod";

/**
 * Utilidades de validación y saneo COMPARTIDAS por todos los módulos.
 *
 * Nunca confiar solo en la validación del navegador: un atacante puede
 * llamar al endpoint directo con curl/fetch saltándose el formulario. Por
 * eso el mismo esquema corre en el cliente y en el servidor.
 */

// Nombre del campo honeypot: invisible para personas (se posiciona fuera
// de pantalla por CSS, nunca con display:none, que algunos filtros de
// spam ignoran) pero visible para bots que autocompletan todos los campos.
export const HONEYPOT_FIELD = "sitio_web";

/**
 * String con recorte y largos. El mensaje del mínimo cambia según el caso:
 * si el campo solo tiene que venir lleno, "es obligatorio" basta; si exige
 * un largo mínimo, hay que decirlo, o el visitante ve "campo obligatorio"
 * sobre un campo que sí completó.
 */
export const trimmedString = (max: number, min = 1) =>
  z
    .string()
    .trim()
    .min(
      min,
      min > 1
        ? `Escribe al menos ${min} caracteres.`
        : "Este campo es obligatorio."
    )
    .max(max, `Máximo ${max} caracteres.`);

// Teléfono chileno flexible: +56912345678, 56912345678, 912345678, 9 1234 5678…
export const telefonoChileno = z
  .string()
  .trim()
  .regex(
    /^(\+?56)?\s?9\s?\d{4}\s?\d{4}$/,
    "Ingresa un teléfono chileno válido (ej: +56 9 1234 5678)."
  );

/**
 * Escapa HTML para que un texto ingresado por un usuario nunca pueda
 * inyectar markup/scripts cuando se reutiliza dentro de un correo HTML o
 * un panel. Astro ya escapa al interpolar {variable}, pero el correo se
 * arma como string HTML plano, así que ahí sí hace falta escapar a mano.
 */
export function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Elimina caracteres de control invisibles (usados, por ejemplo, para
 * inyección de cabeceras en emails) antes de validar. Por defecto quita
 * también saltos de línea; pasar allowNewlines:true para campos de texto
 * largo (comentarios, descripciones) donde los saltos son contenido
 * legítimo.
 */
export function normalizeInput(
  input: string,
  options: { allowNewlines?: boolean } = {}
): string {
  const { allowNewlines = false } = options;
  const cleaned = Array.from(input)
    .filter((char) => {
      const code = char.codePointAt(0) ?? 0;
      if (code === 127) return false; // DEL
      if (code < 32) {
        return allowNewlines && (char === "\n" || char === "\r" || char === "\t");
      }
      return true;
    })
    .join("");
  return cleaned.trim();
}
