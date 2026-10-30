/** Reseñas de compradores verificados (v0.45). Ver README.md. */
export { type ConfigResenas, LIMITES_RESENA, RESENAS_VISIBLES } from "./config";
export { crearResenas, nombreCorto, type Resenas, type ProductoAResenar } from "./servidor";
export {
  type Resena,
  type ResenaPublica,
  type ResumenResenas,
  type EstadoResena,
  leerPublicas,
  listarResenas,
  recalcularPublicas,
} from "./almacen";
export { htmlEstrellas, htmlEstrellasFicha, htmlListaResenas, jsonLdResenas, textoResumen, fechaResena, numeroResena } from "./html";
