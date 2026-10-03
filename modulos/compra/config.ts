import type { EnvPago } from "../pago/config";
import type { ConfirmacionPago, PedidoGuardado } from "../pago/config";
import type { CatalogoODinamico } from "../catalogo/almacen";
import type { Proveedor } from "../pago/tipos";

export type EnvCompra = EnvPago;

/** Lo propio de cada tienda. Todo lo demás lo resuelve el módulo. */
export interface ConfigCompra {
  nombreSitio: string;
  /** Catálogo fijo (JSON) o editable desde el panel (crearCatalogoEditable). */
  catalogo: CatalogoODinamico;
  proveedores: Proveedor[];
  envio: {
    /** Ej: "Envío por pagar". */
    modalidad: string;
    /** Explicación para el comprador. */
    detalle: string;
  };
  /** Texto del correo al comprador cuando compra productos digitales. */
  mensajeDigital?: string;
  remitentePorDefecto?: string;
  coloresCorreo?: { acento?: string; fondo?: string };
  /** Días que se guardan los datos del pedido en KV. Por defecto 90. */
  retencionDias?: number;
  /** Máximo de productos distintos por pedido. Por defecto 30. */
  maxLineas?: number;
  /** Algo extra al confirmarse un pago (ya verificado y sin repetir). */
  alConfirmar?: (pedido: PedidoGuardado, confirmacion: ConfirmacionPago, env: EnvCompra) => void | Promise<void>;
}
