import type { EnvBase } from "../../core/tipos";
import type { CredencialesFlow, EstadoPagoFlow } from "./flow";

/**
 * Variables de entorno del módulo pago (Secrets en Cloudflare, nunca en el
 * código). Las llaves son de la cuenta Flow DEL CLIENTE.
 */
export interface EnvPago extends EnvBase {
  FLOW_API_KEY?: string;
  FLOW_SECRET_KEY?: string;
  /** "1" o "true" = sandbox; cualquier otra cosa = producción. */
  FLOW_SANDBOX?: string;
}

/** Pedido autoritativo a cobrar. El monto lo calcula el SERVIDOR, no el cliente. */
export interface PedidoPago {
  commerceOrder: string;
  subject: string;
  /** Monto en pesos enteros (CLP), calculado en el servidor (ej. carrito validado). */
  amount: number;
  email: string;
}

export interface ConfigPago {
  /**
   * El sitio arma el pedido autoritativo desde la petición: acá se valida
   * el carrito (ver módulo carrito) y se calcula el monto real. Nunca se
   * toma el monto de lo que manda el navegador.
   */
  prepararPedido: (request: Request, env: EnvPago) => Promise<PedidoPago> | PedidoPago;
  /** Webhook servidor-a-servidor que Flow llama al confirmar. Absoluta o (origin,env)=>url. */
  urlConfirmation: string | ((origin: string, env: EnvPago) => string);
  /** A dónde Flow devuelve el navegador del comprador. Absoluta o (origin,env)=>url. */
  urlReturn: string | ((origin: string, env: EnvPago) => string);
  /** Se llama cuando un pago queda CONFIRMADO como pagado (marcar pedido, descontar stock…). */
  onConfirmado?: (estado: EstadoPagoFlow, env: EnvPago) => Promise<void> | void;
  /** Forzar sandbox; por defecto lee FLOW_SANDBOX. */
  sandbox?: boolean;
}

/** Arma las credenciales desde el env, recortando espacios/saltos pegados a mano. */
export function credencialesDesdeEnv(
  env: EnvPago,
  sandboxOverride?: boolean
): CredencialesFlow {
  const limpiar = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const sandbox =
    sandboxOverride ??
    (env.FLOW_SANDBOX === "1" || env.FLOW_SANDBOX === "true");
  return {
    apiKey: limpiar(env.FLOW_API_KEY),
    secretKey: limpiar(env.FLOW_SECRET_KEY),
    sandbox,
  };
}
