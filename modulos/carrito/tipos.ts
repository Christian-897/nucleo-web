/**
 * Tipos del módulo carrito.
 *
 * Distinción clave de seguridad: lo que el navegador manda al servidor son
 * solo `productoId` y `cantidad` (`LineaCarritoEntrada`). El PRECIO nunca
 * viaja desde el cliente como algo en lo que se confíe: el servidor lo
 * recalcula desde la fuente real (ver servidor.ts). El cliente guarda un
 * precio solo como "foto" para mostrar mientras navega.
 */

/** Producto autoritativo (lo entrega la fuente del sitio en el servidor). */
export interface Producto {
  id: string;
  nombre: string;
  /** Precio en pesos enteros (CLP). */
  precio: number;
  /** Stock disponible. Si se omite, se asume disponible sin límite. */
  stock?: number;
  imagen?: string;
  [extra: string]: unknown;
}

/** Lo que el cliente envía al servidor para validar/pagar. Sin precio. */
export interface LineaCarritoEntrada {
  productoId: string;
  cantidad: number;
}

/** Ítem del carrito en el navegador: lleva una foto de nombre/precio para mostrar. */
export interface ItemCarrito {
  productoId: string;
  nombre: string;
  /** Foto del precio para mostrar; el total real lo confirma el servidor. */
  precio: number;
  cantidad: number;
  imagen?: string;
}

/** Línea ya validada por el servidor, con precio autoritativo. */
export interface LineaValidada {
  productoId: string;
  nombre: string;
  precioUnitario: number;
  cantidad: number;
  subtotal: number;
}

export type TipoProblema =
  | "no-existe"
  | "sin-stock"
  | "stock-ajustado"
  | "cantidad-invalida";

export interface ProblemaCarrito {
  productoId: string;
  tipo: TipoProblema;
  mensaje: string;
  /** Cuando aplica (sin-stock / stock-ajustado), cuánto había disponible. */
  cantidadDisponible?: number;
}

/** Resultado de validar un carrito en el servidor. */
export interface CarritoValidado {
  lineas: LineaValidada[];
  total: number;
  cantidadTotal: number;
  /** Ajustes o rechazos que la cara debe mostrarle al comprador. */
  problemas: ProblemaCarrito[];
  /** true si no hay problemas y hay al menos una línea: listo para pagar. */
  listoParaPagar: boolean;
}
