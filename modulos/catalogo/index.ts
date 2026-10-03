/**
 * Módulo catálogo: productos desde una lista + stock real en KV.
 *
 *   import { crearCatalogo, fuenteCarrito, registrarVenta } from "nucleo-web/catalogo";
 */
export * from "./tipos";
export { crearCatalogo, validarCatalogo, ErrorCatalogo, ID_VALIDO } from "./catalogo";
export {
  fuenteCarrito,
  productoDisponible,
  registrarVenta,
  stockDisponible,
  PREFIJO_VENDIDOS,
  reponerStock,
  unidadesVendidas,
} from "./stock";
export {
  crearCatalogoEditable,
  resolverCatalogo,
  esDinamico,
  CLAVE_CATALOGO,
  type FuenteCatalogo,
  type CatalogoODinamico,
} from "./almacen";
export { crearEndpointCatalogoPublico, type ProductoPublico } from "./publico";
export { crearEndpointStock } from "./endpoint";
export { consultarStock } from "./cliente";
export {
  crearBordeCatalogo,
  crearFichaProducto,
  productosDeLista,
  imagenSegura,
  idDeRuta,
  type OpcionesBorde,
  type EnvBorde,
} from "./borde";
export { crearSitemap } from "./sitemap";
