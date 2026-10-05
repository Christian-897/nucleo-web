/**
 * Módulo metricas: ventas por día, ticket promedio, productos más vendidos y
 * medios de pago, para mostrar un resumen tipo "inicio" en el panel.
 *
 *   import { registrarPedido, obtenerResumen } from "nucleo-web/metricas";
 *
 * `compra` registra cada pedido al confirmarse el pago; el `panel` lo muestra
 * en la pestaña Resumen. Las visitas no se miden aquí: para eso se usa
 * Cloudflare Web Analytics (gratis, sin cookies).
 */
import type { AlmacenKV } from "../../core/tipos";
import { leerDias, leerMeses, leerRangoDias, leerTotales } from "./almacen";
import { calcularAnual, calcularResumen, diasDelMesHasta } from "./calculo";
import { diaLocal, ZONA_POR_DEFECTO } from "./fechas";
import type { Resumen } from "./tipos";
import { calcularRango, normalizarConsulta, type ConsultaRango, type ReporteRango } from "./rango";

export * from "./tipos";
export { registrarPedido, leerTotales, leerDias, leerMeses, leerRangoDias, ordenesContadas, PREFIJO_DIA, PREFIJO_CONTADO, PREFIJO_MES } from "./almacen";
export * from "./rango";
export { calcularResumen, calcularAnual, diasDelMesHasta } from "./calculo";
export { diaLocal, restarDias, ultimosDias, ZONA_POR_DEFECTO } from "./fechas";

/** Resumen de los últimos 30 días y comparación por años, listo para la pantalla. */
export async function obtenerResumen(
  kv: AlmacenKV | undefined,
  opciones: { zona?: string; ahora?: Date } = {}
): Promise<Resumen> {
  const zona = opciones.zona ?? ZONA_POR_DEFECTO;
  const hoy = diaLocal(opciones.ahora ?? new Date(), zona);
  const [anio, mes, dia] = hoy.split("-").map(Number);
  const [totales, meses, diasMesAnterior] = await Promise.all([
    leerTotales(kv, hoy, 30),
    leerMeses(kv),
    leerDias(kv, diasDelMesHasta(anio - 1, mes, dia)),
  ]);
  return calcularResumen(totales, hoy, zona, calcularAnual(meses, diasMesAnterior, hoy));
}

/**
 * Reporte de un rango de fechas elegido. Lanza `ErrorRango` (con un mensaje
 * para mostrar) si las fechas no sirven.
 */
export async function obtenerRango(
  kv: AlmacenKV | undefined,
  consulta: Partial<ConsultaRango>,
  opciones: { zona?: string; ahora?: Date } = {}
): Promise<ReporteRango> {
  const zona = opciones.zona ?? ZONA_POR_DEFECTO;
  const hoy = diaLocal(opciones.ahora ?? new Date(), zona);
  const q = normalizarConsulta(consulta, hoy);
  if (q.exacto) {
    const inicio = q.anterior ? q.anterior.desde : q.desde;
    return calcularRango(await leerRangoDias(kv, inicio, q.hasta), q);
  }
  return calcularRango(await leerMeses(kv), q);
}
