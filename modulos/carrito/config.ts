import type { Producto } from "./tipos";

/**
 * Config del carrito EN EL SERVIDOR (la que usa el endpoint de validación).
 *
 * `obtenerProducto` es la fuente autoritativa: el módulo no trae catálogo
 * adentro. El sitio decide de dónde salen los productos — una lista/JSON
 * hoy, Cloudflare D1 mañana, o un fetch. Puede ser síncrona o async.
 */
export interface ConfigCarritoServidor {
  /** Devuelve el producto real por id, o null si no existe. */
  obtenerProducto: (id: string) => Promise<Producto | null> | Producto | null;
  /** Tope de unidades por línea. Por defecto 99. */
  maxPorLinea?: number;
}

export const MAX_POR_LINEA_POR_DEFECTO = 99;

/** Opciones del carrito EN EL NAVEGADOR (las usa crearCarrito). */
export interface OpcionesCarritoCliente {
  /** URL del endpoint de validación. Por defecto "/api/carrito". */
  endpoint?: string;
  /** Clave de localStorage donde se guarda el carrito. Por defecto "carrito". */
  storageKey?: string;
  /** Tope de unidades por línea (mismo criterio que el servidor). Por defecto 99. */
  maxPorLinea?: number;
}
