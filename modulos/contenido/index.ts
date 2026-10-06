/**
 * Módulo contenido: todo el sitio editable desde el panel (textos, fotos,
 * colores y tipografías), sin reconstruir y sin que nada escrito por una
 * persona se convierta en HTML o CSS.
 *
 *   const contenido = crearContenidoEditable(esquema, valoresIniciales, { derivar, contraste });
 *   export const bordeContenido = crearBordeContenido(contenido);   // middleware
 *   export const temaCss = crearTemaCss(contenido);                 // functions/tema.css.ts
 *   crearPanel({ ..., contenido })                                  // pestaña "Diseño y textos"
 */
export * from "./tipos";
export * from "./fuentes";
export * from "./color";
export { imagenValida, limpiarTexto, validarValor, validarCambios } from "./validar";
export { variablesTema, cssTema } from "./tema";
export { crearContenidoEditable, huella, CLAVE_CONTENIDO, type FuenteContenido, type EstadoContenido, type OpcionesContenido } from "./almacen";
export { crearBordeContenido, crearTemaCss, hrefDe, jsonLdFaq, enlacesTema } from "./borde";

import type { Campo } from "./tipos";

/**
 * Campos repetidos para listas de largo fijo (preguntas, beneficios…):
 * repetir("faq", 3, (n) => [{ clave: "pregunta", … }]) → faq.1.pregunta, faq.2.pregunta…
 * Los espacios vacíos se ocultan en el sitio.
 */
export function repetir(prefijo: string, n: number, crear: (i: number) => Campo[]): Campo[] {
  const salida: Campo[] = [];
  for (let i = 1; i <= n; i++) {
    for (const c of crear(i)) salida.push({ ...c, clave: `${prefijo}.${i}.${c.clave}` });
  }
  return salida;
}
