/**
 * Módulo carrusel: portada con varias diapositivas que avanzan solas,
 * editable desde el panel.
 *
 *   import { crearCarruselEditable, crearBordeCarrusel } from "nucleo-web/carrusel";
 *
 * Componente: "nucleo-web/carrusel/Carrusel.astro". Navegador: "nucleo-web/carrusel/cliente".
 */
export * from "./tipos";
export { validarCarrusel, imagenValida, enlaceValido, nuevoIdDiapositiva } from "./validar";
export { htmlCarrusel, atributosCarrusel, escapar } from "./marcado";
export { crearCarruselEditable, CLAVE_CARRUSEL, ErrorCarrusel, type FuenteCarrusel } from "./almacen";
export { crearBordeCarrusel, type OpcionesBordeCarrusel } from "./borde";
