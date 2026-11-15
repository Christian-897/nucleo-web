/**
 * Lado del navegador del pago libre: no arrastra código del servidor.
 *
 *   import { pagarLibre, leerMonto } from "nucleo-web/pago-libre/cliente";
 *   const r = await pagarLibre({ proveedor: "flow", nombre, email, concepto, monto, detalle, aceptaTerminos: true, turnstileToken });
 *   if (!r.ok) mostrar(r.message, r.fieldErrors);   // si sale bien, el navegador ya se fue a Flow / Mercado Pago
 */
import { irAPagar, type ResultadoIniciarPago } from "../pago/cliente";
import type { Proveedor } from "../pago/tipos";

export { leerMonto, formatearMonto } from "./monto";
export type { ResultadoIniciarPago };

export interface DatosPagoLibreCliente {
  proveedor: Proveedor;
  nombre: string;
  email: string;
  concepto: string;
  /** Como lo escribió la persona ("154.700") o ya como número: el servidor lo valida igual. */
  monto: string | number;
  detalle?: string;
  aceptaTerminos: boolean;
  turnstileToken: string;
  [k: string]: unknown;
}

export function pagarLibre(datos: DatosPagoLibreCliente, opciones: { endpoint?: string } = {}): Promise<ResultadoIniciarPago> {
  return irAPagar(datos, opciones);
}
