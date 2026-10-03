/**
 * Módulo construccion: aviso de "sitio en construcción" con vista previa
 * para el dueño. Se usa como middleware de Pages:
 *
 *   // functions/_middleware.ts
 *   export const { onRequest } = aviso;   // aviso = crearAvisoConstruccion({...})
 */
export * from "./config";
export { crearAvisoConstruccion, procesarConstruccion, avisoActivo, firmaAcceso } from "./servidor";
export { paginaConstruccion, enlaceSeguro } from "./plantilla";
