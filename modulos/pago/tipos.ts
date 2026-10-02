/**
 * Tipos del módulo pago. Cada proveedor (Flow, Mercado Pago) habla distinto,
 * pero acá todo se normaliza a la misma forma: el resto del sitio no
 * necesita saber con qué proveedor se pagó.
 */

export type Proveedor = "flow" | "mercadopago";

export const PROVEEDORES: readonly Proveedor[] = ["flow", "mercadopago"];

/** Estado normalizado de un pago, igual para todos los proveedores. */
export type EstadoPago =
  | "pendiente"
  | "pagada"
  | "rechazada"
  | "anulada"
  /** Pagada en el proveedor, pero el monto/moneda NO calza con el pedido. */
  | "en-revision"
  | "desconocido";

/** Lo que devuelve un proveedor al consultar un pago, ya normalizado. */
export interface ResultadoProveedor {
  proveedor: Proveedor;
  estado: EstadoPago;
  /** Nuestro número de orden (commerceOrder en Flow, external_reference en MP). */
  orden: string;
  monto: number;
  moneda?: string;
  /** Identificador del pago en el proveedor (token Flow / payment id MP). */
  idProveedor: string;
  crudo: Record<string, unknown>;
}

/** Datos que el proveedor necesita para crear el cobro. */
export interface DatosCobro {
  orden: string;
  descripcion: string;
  /** Pesos enteros (CLP). */
  monto: number;
  email: string;
  urlConfirmacion: string;
  urlRetorno: string;
}

export interface CobroCreado {
  /** A dónde mandar el navegador del comprador. */
  redirectUrl: string;
  /** Identificador del cobro en el proveedor. */
  idProveedor: string;
}

/**
 * Error con mensaje APTO para el comprador. Si `prepararPedido` lanza uno de
 * estos (ej. "Un producto se quedó sin stock"), el mensaje se muestra tal
 * cual. Cualquier otro error se responde con un mensaje genérico, para no
 * filtrar detalles internos.
 */
export class ErrorPedido extends Error {
  constructor(mensajePublico: string) {
    super(mensajePublico);
    this.name = "ErrorPedido";
  }
}
