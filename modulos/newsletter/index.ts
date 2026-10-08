/**
 * Módulo newsletter: suscripción con doble confirmación y baja con un clic.
 *
 *   import { crearEndpointsNewsletter, suscribirNewsletter } from "nucleo-web/newsletter";
 */
export * from "./config";
export { crearEndpointsNewsletter } from "./endpoint";
export {
  suscribir,
  confirmar,
  darDeBaja,
  pedirBaja,
  exportar,
  enlaceBaja,
  normalizarEmail,
  codificarEmail,
  decodificarEmail,
  celdaCsv,
  listarActivos,
  quitarPorCorreo,
  respuestaCsv,
  type Suscriptor,
} from "./servidor";
export { suscribirNewsletter, confirmarNewsletter, bajaNewsletter, pedirBajaNewsletter, type ResultadoNewsletter } from "./cliente";
