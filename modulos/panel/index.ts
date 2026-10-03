/**
 * Módulo panel: administración del sitio con login propio, doble factor,
 * productos con fotos, pedidos y suscriptores. Servidor:
 *
 *   import { crearPanel } from "nucleo-web/panel";
 *
 * Navegador: "nucleo-web/panel/cliente".
 */
export * from "./config";
export { crearPanel, type OpcionesPanel } from "./endpoint";
export { CABECERAS_PANEL, aplicarCabecerasPanel } from "./encabezados";
export {
  REPETICIONES,
  OPCIONES_INACTIVIDAD,
  derivadoValido,
  sesionActual,
  obtenerUsuario,
  hayUsuario,
  type UsuarioAdmin,
  type Sesion,
} from "./auth";
export { tipoRealDeImagen, medidasAceptables, direccionMediaValida, guardarFoto, borrarFoto, RUTA_MEDIA } from "./imagenes";
export { validarEntrada, idDesdeNombre, type EntradaProducto } from "./productos";
export { listarPedidos, type PedidoPanel } from "./pedidos";
export { exigirSesion, type Ctx } from "./http";
