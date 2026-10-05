/** Totales de un día (en la zona horaria del negocio). */
export interface DiaMetricas {
  /** Ventas en CLP. */
  v: number;
  /** Pedidos pagados. */
  n: number;
  /** Por producto: nombre → [unidades, CLP]. */
  p: Record<string, [number, number]>;
  /** Por medio de pago: proveedor → [pedidos, CLP]. */
  m: Record<string, [number, number]>;
}

/** Lo mínimo de un pedido pagado que necesitan las métricas. */
export interface PedidoParaMetricas {
  orden: string;
  /** Fecha ISO de creación del pedido. */
  creado: string;
  monto: number;
  proveedor: string;
  lineas?: { nombre: string; cantidad: number; subtotal: number }[];
}

export interface Periodo {
  ventas: number;
  pedidos: number;
  /** Venta promedio por pedido (0 si no hay pedidos). */
  ticket: number;
}

export interface ResumenAnual {
  /** Año en curso. */
  anio: number;
  /** Día de hoy (AAAA-MM-DD), para saber qué mes está en curso. */
  hoy: string;
  /** Año en curso, del 1 de enero a hoy. */
  aFecha: Periodo;
  /** Año anterior, del 1 de enero al mismo día de hoy. */
  aFechaAnterior: Periodo;
  /** Variación de ventas año a la fecha vs. el anterior, en % (null si antes era 0). */
  variacionAnual: number | null;
  /** Totales por mes de todos los años con ventas: "AAAA-MM" → ventas y pedidos. */
  meses: Record<string, { ventas: number; pedidos: number }>;
  /** Totales por año, del más nuevo al más antiguo. */
  anios: { anio: number; ventas: number; pedidos: number; ticket: number }[];
}

export interface Resumen {
  /** Día de hoy (AAAA-MM-DD) en la zona del negocio. */
  hoy: string;
  zona: string;
  periodos: { hoy: Periodo; d7: Periodo; d7Anterior: Periodo; d30: Periodo };
  /** Variación de ventas 7 días vs. los 7 anteriores, en % (null si antes era 0). */
  variacion7: number | null;
  /** Los últimos 30 días, del más antiguo al de hoy. */
  serie: { dia: string; ventas: number; pedidos: number }[];
  /** Hasta 5 productos más vendidos en 30 días (por unidades). */
  topProductos: { nombre: string; unidades: number; ventas: number }[];
  /** Pedidos y ventas por medio de pago en 30 días. */
  medios: { proveedor: string; pedidos: number; ventas: number }[];
  /** Comparación por años y meses. */
  anual: ResumenAnual;
}
