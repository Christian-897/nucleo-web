import type { EnvBase } from "../../core/tipos";
import type { EstadoPago, Proveedor } from "./tipos";

/**
 * Variables de entorno del módulo pago. TODAS son Secrets en Cloudflare, de
 * las cuentas DEL CLIENTE. Nunca en el código, nunca en el chat.
 */
export interface EnvPago extends EnvBase {
  FLOW_API_KEY?: string;
  FLOW_SECRET_KEY?: string;
  /** "1"/"true" = sandbox de Flow. Cualquier otra cosa = producción. */
  FLOW_SANDBOX?: string;
  /** Access token de Mercado Pago (de prueba o de producción). */
  MP_ACCESS_TOKEN?: string;
  /** Clave secreta de los webhooks de Mercado Pago (valida x-signature). */
  MP_WEBHOOK_SECRET?: string;
}

/** Lo que el sitio entrega desde `prepararPedido`. El monto es AUTORITATIVO. */
export interface PedidoPago {
  /** Si se omite, el módulo genera una orden aleatoria e impredecible. */
  orden?: string;
  descripcion: string;
  /** Pesos enteros (CLP), calculados en el servidor (ej. carrito validado). */
  monto: number;
  email: string;
  /** Datos extra que vuelven en `onConfirmado` (ej. las líneas del carrito). */
  metadata?: Record<string, unknown>;
}

/** Registro que el módulo guarda en KV para verificar la confirmación. */
export interface PedidoGuardado {
  orden: string;
  descripcion: string;
  monto: number;
  moneda: "CLP";
  email: string;
  proveedor: Proveedor;
  estado: EstadoPago;
  idProveedor?: string;
  creado: string;
  actualizado: string;
  metadata?: Record<string, unknown>;
}

/** Lo que recibe el sitio cuando un pago queda confirmado y VERIFICADO. */
export interface ConfirmacionPago {
  orden: string;
  monto: number;
  proveedor: Proveedor;
  idProveedor: string;
  /** El pedido guardado (con su metadata), si hay KV. */
  pedido: PedidoGuardado | null;
}

export interface ConfigPago {
  /** Proveedores habilitados en este sitio. Ej: ["flow", "mercadopago"]. */
  proveedores: Proveedor[];

  /**
   * Arma el pedido con el monto REAL. Recibe el cuerpo ya leído de la
   * petición (lo que mandó el navegador, que NO es confiable) para que el
   * sitio valide el carrito y calcule el total en el servidor.
   */
  prepararPedido: (
    cuerpo: Record<string, unknown>,
    env: EnvPago,
    request: Request
  ) => PedidoPago | Promise<PedidoPago>;

  /**
   * Se llama UNA vez por pedido, solo cuando el proveedor confirma el pago Y
   * el monto/moneda coinciden con lo esperado. Acá se marca el pedido como
   * pagado, se descuenta stock, se avisa por correo. Si lanza error, se
   * responde 500 y el proveedor reintenta.
   */
  onConfirmado: (confirmacion: ConfirmacionPago, env: EnvPago) => void | Promise<void>;

  /**
   * Opcional. Si el sitio guarda sus pedidos en otra parte (D1), puede decir
   * cuánto se esperaba cobrar. Si no se da, se usa el registro en KV que el
   * módulo guarda al iniciar el pago. Sin ninguno de los dos, NO se confirma
   * ningún pago (seguro por defecto).
   */
  verificarPedido?: (
    orden: string,
    env: EnvPago
  ) => { monto: number } | null | Promise<{ monto: number } | null>;

  /** Rutas del sitio. Todas tienen valor por defecto. */
  rutas?: {
    webhookFlow?: string;
    webhookMercadoPago?: string;
    retorno?: string;
    /** Flow vuelve al sitio con un POST (no un GET): esta ruta lo recibe y
     *  redirige a `retorno` con el token en la URL. */
    retornoFlow?: string;
  };

  /** Forzar sandbox de Flow (por defecto lee FLOW_SANDBOX). */
  sandboxFlow?: boolean;

  /** Tope de intentos de pago por IP. Por defecto 10 cada 10 minutos. */
  rateLimit?: { max: number; ventanaSeg: number };

  /** Días que se guarda el registro del pedido en KV. Por defecto 30. */
  retencionDias?: number;
}

export const RUTAS_POR_DEFECTO = {
  webhookFlow: "/api/pago/webhook-flow",
  webhookMercadoPago: "/api/pago/webhook-mercadopago",
  retorno: "/pago/retorno",
  retornoFlow: "/api/pago/retorno-flow",
} as const;

const limpiar = (v: unknown) => (typeof v === "string" ? v.trim() : "");

export function credencialesFlow(env: EnvPago, sandboxOverride?: boolean) {
  return {
    apiKey: limpiar(env.FLOW_API_KEY),
    secretKey: limpiar(env.FLOW_SECRET_KEY),
    sandbox:
      sandboxOverride ?? (env.FLOW_SANDBOX === "1" || env.FLOW_SANDBOX === "true"),
  };
}

export function tokenMercadoPago(env: EnvPago): string {
  return limpiar(env.MP_ACCESS_TOKEN);
}

export function secretoWebhookMercadoPago(env: EnvPago): string {
  return limpiar(env.MP_WEBHOOK_SECRET);
}

/** ¿Tiene este proveedor sus credenciales cargadas? */
export function proveedorConfigurado(proveedor: Proveedor, env: EnvPago): boolean {
  if (proveedor === "flow") {
    const c = credencialesFlow(env);
    return Boolean(c.apiKey && c.secretKey);
  }
  return Boolean(tokenMercadoPago(env));
}
