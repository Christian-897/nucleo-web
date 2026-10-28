/**
 * Módulo catálogo: productos desde una lista + stock real en KV.
 *
 *   import { crearCatalogo, fuenteCarrito, registrarVenta } from "nucleo-web/catalogo";
 */
export * from "./tipos";
export { crearCatalogo, validarCatalogo, ErrorCatalogo, ID_VALIDO, MAXIMO_FOTOS } from "./catalogo";
export {
  fuenteCarrito,
  productoDisponible,
  registrarVenta,
  devolverUnidades,
  stockDisponible,
  PREFIJO_VENDIDOS,
  reponerStock,
  unidadesVendidas,
  stockDeColores,
} from "./stock";
export {
  SEPARADOR_COLOR,
  MAXIMO_COLORES,
  ID_COLOR,
  partirId,
  idBase,
  idConColor,
  tieneColores,
  idColorDesdeNombre,
  buscarColor,
  imagenPrincipal,
  type ColorProducto,
  type TituloColores,
} from "./colores";
export {
  crearCatalogoEditable,
  resolverCatalogo,
  esDinamico,
  CLAVE_CATALOGO,
  type FuenteCatalogo,
  type CatalogoODinamico,
} from "./almacen";
export {
  CLAVE_CATEGORIAS,
  CLAVE_ESTRUCTURA,
  MAXIMO_NUEVAS,
  limpiarEstructura,
  categoriasVigentes,
  type CategoriaNueva,
  type EstructuraCategorias,
  LIMITES_CATEGORIA,
  MAXIMO_SUBCATEGORIAS,
  idSubcategoria,
  limpiarSubcategorias,
  erroresSubcategorias,
  subcategoriaDe,
  validarCambioCategoria,
  limpiarCambios,
  aplicarCambios,
  imagenCategoriaValida,
  limpiarTextoLargo,
  type CambioCategoria,
  type CambiosCategorias,
} from "./categorias";
export { resumenParaGoogle, textoPlano } from "./resumen";
export { crearEndpointCatalogoPublico, type ProductoPublico } from "./publico";
export { crearEndpointStock } from "./endpoint";
export { consultarStock, consultarStockColores } from "./cliente";
export {
  crearBordeCatalogo,
  crearFichaProducto,
  crearPaginaCategoria,
  categoriaDeRuta,
  productosDeLista,
  itemsDeLista,
  htmlSubcategorias,
  subcategoriaDeRuta,
  htmlMuestras,
  type ItemLista,
  imagenSegura,
  rellenarPlantilla,
  idDeRuta,
  type OpcionesBorde,
  type EnvBorde,
} from "./borde";
export { crearSitemap } from "./sitemap";
export {
  CLAVE_VISTA_LISTAS,
  VISTAS_LISTA,
  VISTA_LISTAS_POR_DEFECTO,
  limpiarVistaListas,
  vistaDeFiltro,
  obtenerVistaListas,
  guardarVistaListas,
  type VistaLista,
  type VistaListas,
} from "./vista-listas";
export { ID_VIDEO, idVideoYoutube, urlInsercionVideo, miniaturaVideo, enlaceVideo } from "./video";
