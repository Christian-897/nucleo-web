import type { EnvPago } from "../pago/config";
import type { Proveedor } from "../pago/tipos";

/**
 * Pago libre (v0.49): la persona escribe el monto que acordó con el negocio
 * (un anticipo, el saldo final o un extra) y paga con Flow o Mercado Pago,
 * en cuotas si su tarjeta lo permite. Pensado para servicios que se cotizan
 * caso a caso, donde no hay un catálogo con precios fijos.
 */
export interface ConceptoPago {
  /** Identificador estable (va en el pedido). Solo minúsculas, números y guiones. */
  id: string;
  /** Lo que ve la persona en el formulario y en los correos. */
  label: string;
}

export interface ConfigPagoLibre {
  nombreSitio: string;
  /** Proveedores habilitados. Ej: ["flow", "mercadopago"]. */
  proveedores: Proveedor[];
  /** Opciones de "¿Qué estás pagando?". Por defecto: anticipo, saldo y servicio adicional. */
  conceptos?: ConceptoPago[];
  /** Monto mínimo en pesos. Por defecto $5.000 (frena las pruebas de tarjetas robadas). */
  montoMinimo?: number;
  /** Monto máximo en pesos. Por defecto $5.000.000. */
  montoMaximo?: number;
  /** Remitente de respaldo si no hay RESEND_FROM. */
  remitentePorDefecto?: string;
  /** Colores de los correos. */
  coloresCorreo?: { acento?: string; fondo?: string; tinta?: string };
  /** Ruta del panel, para el enlace del aviso interno. Por defecto "/admin/". */
  rutaPanel?: string;
  /** Días que se guarda cada pago en el panel. Por defecto 400 (más de un año). */
  retencionDias?: number;
  /** Tope de intentos por IP (además del de `pago`). Por defecto 5 cada 10 minutos. */
  rateLimit?: { max: number; ventanaSeg: number };
}

export interface EnvPagoLibre extends EnvPago {
  TURNSTILE_SECRET_KEY?: string;
}

export const CONCEPTOS_POR_DEFECTO: ConceptoPago[] = [
  { id: "anticipo", label: "Anticipo (50 %)" },
  { id: "saldo", label: "Saldo final (50 %)" },
  { id: "extra", label: "Servicio adicional" },
];

export const MONTO_MINIMO_DEFECTO = 5_000;
export const MONTO_MAXIMO_DEFECTO = 5_000_000;

export function conceptosDe(config: ConfigPagoLibre): ConceptoPago[] {
  return config.conceptos?.length ? config.conceptos : CONCEPTOS_POR_DEFECTO;
}

export function limitesDe(config: ConfigPagoLibre): { minimo: number; maximo: number } {
  return {
    minimo: config.montoMinimo ?? MONTO_MINIMO_DEFECTO,
    maximo: config.montoMaximo ?? MONTO_MAXIMO_DEFECTO,
  };
}
