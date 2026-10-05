/**
 * Ventas en un RANGO DE FECHAS elegido (desde / hasta), agrupadas por día,
 * semana (lunes a domingo) o mes, y comparadas con el período anterior del
 * mismo largo.
 *
 * Exactitud: los totales por día duran 400 días. Si el rango cae completo
 * dentro de ese plazo, el cálculo es exacto, día por día. Si empieza antes,
 * se usan los totales por MES (que no vencen) y el rango se ajusta a meses
 * completos: el reporte lo avisa con `exacto: false`.
 */
import { restarDias } from "./fechas";
import type { DiaMetricas, Periodo } from "./tipos";

export type Agrupar = "dia" | "semana" | "mes";

export interface ConsultaRango {
  desde: string;
  hasta: string;
  agrupar?: Agrupar;
}

export interface ConsultaNormalizada {
  desde: string;
  hasta: string;
  agrupar: Agrupar;
  exacto: boolean;
  /** Período anterior del mismo largo, si también es exacto. */
  anterior: { desde: string; hasta: string } | null;
}

export interface PuntoSerie {
  clave: string;
  etiqueta: string;
  desde: string;
  hasta: string;
  ventas: number;
  pedidos: number;
}

export interface ReporteRango {
  desde: string;
  hasta: string;
  agrupar: Agrupar;
  exacto: boolean;
  dias: number;
  periodo: Periodo;
  anterior: { desde: string; hasta: string; periodo: Periodo } | null;
  /** Variación de ventas vs. el período anterior, en % (null si no aplica). */
  variacion: number | null;
  serie: PuntoSerie[];
  topProductos: { nombre: string; unidades: number; ventas: number }[];
  medios: { proveedor: string; pedidos: number; ventas: number }[];
}

export class ErrorRango extends Error {}

/** Días que duran los totales diarios (ver almacen.ts). */
export const DIAS_EXACTOS = 400;
const MAX_DIAS = 3660; // 10 años
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const FECHA = /^(\d{4})-(\d{2})-(\d{2})$/;

/** true si "AAAA-MM-DD" es una fecha real (no 2026-02-30). */
export function fechaValida(x: unknown): x is string {
  if (typeof x !== "string") return false;
  const m = FECHA.exec(x);
  if (!m) return false;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.toISOString().slice(0, 10) === x && +m[1] >= 2000;
}

const aUTC = (dia: string) => Date.UTC(+dia.slice(0, 4), +dia.slice(5, 7) - 1, +dia.slice(8, 10));
/** Días entre dos fechas, contando ambas puntas. */
export function largoEnDias(desde: string, hasta: string): number {
  return Math.round((aUTC(hasta) - aUTC(desde)) / 86400000) + 1;
}
const sumarDias = (dia: string, n: number) => restarDias(dia, -n);
const finDeMes = (dia: string) => new Date(Date.UTC(+dia.slice(0, 4), +dia.slice(5, 7), 0)).toISOString().slice(0, 10);
const inicioDeMes = (dia: string) => `${dia.slice(0, 7)}-01`;
/** Lunes de la semana de `dia`. */
export function lunesDe(dia: string): string {
  const dow = new Date(aUTC(dia)).getUTCDay(); // 0 = domingo
  return restarDias(dia, (dow + 6) % 7);
}

export function normalizarConsulta(c: Partial<ConsultaRango>, hoy: string): ConsultaNormalizada {
  if (!fechaValida(c.desde) || !fechaValida(c.hasta)) throw new ErrorRango("Elige fechas válidas (día, mes y año).");
  let desde = c.desde;
  let hasta = c.hasta > hoy ? hoy : c.hasta;
  if (desde > hasta) throw new ErrorRango("La fecha de inicio es posterior a la de término.");
  if (largoEnDias(desde, hasta) > MAX_DIAS) throw new ErrorRango("El rango puede ser de hasta 10 años.");

  const limite = restarDias(hoy, DIAS_EXACTOS - 1);
  const exacto = desde >= limite;
  let agrupar: Agrupar = c.agrupar === "semana" || c.agrupar === "mes" ? c.agrupar : "dia";
  if (!exacto) {
    desde = inicioDeMes(desde);
    hasta = finDeMes(hasta) > hoy ? hoy : finDeMes(hasta);
    agrupar = "mes";
  }
  let anterior: ConsultaNormalizada["anterior"] = null;
  if (exacto) {
    const largo = largoEnDias(desde, hasta);
    const antHasta = restarDias(desde, 1);
    const antDesde = restarDias(desde, largo);
    if (antDesde >= limite) anterior = { desde: antDesde, hasta: antHasta };
  }
  return { desde, hasta, agrupar, exacto, anterior };
}

function etiqueta(agrupar: Agrupar, desde: string, variosAnios: boolean): string {
  const [a, m, d] = desde.split("-").map(Number);
  const anio = variosAnios ? ` ${String(a).slice(2)}` : "";
  if (agrupar === "mes") return `${MESES[m - 1]} ${a}`;
  if (agrupar === "semana") return `sem. ${d} ${MESES[m - 1]}${anio}`;
  return `${d} ${MESES[m - 1]}${anio}`;
}

const vacio = (): DiaMetricas => ({ v: 0, n: 0, p: {}, m: {} });
function periodo(lista: DiaMetricas[]): Periodo {
  const ventas = lista.reduce((s, d) => s + d.v, 0);
  const pedidos = lista.reduce((s, d) => s + d.n, 0);
  return { ventas, pedidos, ticket: pedidos ? Math.round(ventas / pedidos) : 0 };
}

/** Claves de datos (días "AAAA-MM-DD" o meses "AAAA-MM") que cubre un rango. */
export function clavesDelRango(desde: string, hasta: string, exacto: boolean): string[] {
  const salida: string[] = [];
  if (exacto) {
    for (let d = desde; d <= hasta; d = sumarDias(d, 1)) salida.push(d);
  } else {
    for (let d = inicioDeMes(desde); d <= hasta; d = sumarDias(finDeMes(d), 1)) salida.push(d.slice(0, 7));
  }
  return salida;
}

/**
 * Cálculo puro. `datos`: totales por día (si `exacto`) o por mes (si no),
 * incluido el período anterior cuando corresponde.
 */
export function calcularRango(datos: Record<string, DiaMetricas | undefined>, q: ConsultaNormalizada): ReporteRango {
  const claves = clavesDelRango(q.desde, q.hasta, q.exacto);
  const de = (k: string) => datos[k] ?? vacio();
  const variosAnios = q.desde.slice(0, 4) !== q.hasta.slice(0, 4);

  // Agrupar en baldes (día, semana o mes), recortados al rango.
  const baldes = new Map<string, PuntoSerie>();
  for (const k of claves) {
    const dia = q.exacto ? k : `${k}-01`;
    const inicio = q.agrupar === "dia" ? dia : q.agrupar === "semana" ? lunesDe(dia) : inicioDeMes(dia);
    const b =
      baldes.get(inicio) ??
      (() => {
        const desdeB = inicio < q.desde ? q.desde : inicio;
        const finB = q.agrupar === "dia" ? dia : q.agrupar === "semana" ? sumarDias(inicio, 6) : finDeMes(inicio);
        const nuevo: PuntoSerie = { clave: inicio, etiqueta: etiqueta(q.agrupar, desdeB, variosAnios), desde: desdeB, hasta: finB > q.hasta ? q.hasta : finB, ventas: 0, pedidos: 0 };
        baldes.set(inicio, nuevo);
        return nuevo;
      })();
    b.ventas += de(k).v;
    b.pedidos += de(k).n;
  }

  const productos = new Map<string, { unidades: number; ventas: number }>();
  const medios = new Map<string, { pedidos: number; ventas: number }>();
  for (const k of claves) {
    for (const [nombre, [u, v]] of Object.entries(de(k).p)) {
      const x = productos.get(nombre) ?? { unidades: 0, ventas: 0 };
      x.unidades += u;
      x.ventas += v;
      productos.set(nombre, x);
    }
    for (const [prov, [n, v]] of Object.entries(de(k).m)) {
      const x = medios.get(prov) ?? { pedidos: 0, ventas: 0 };
      x.pedidos += n;
      x.ventas += v;
      medios.set(prov, x);
    }
  }

  const actual = periodo(claves.map(de));
  const anterior = q.anterior
    ? { ...q.anterior, periodo: periodo(clavesDelRango(q.anterior.desde, q.anterior.hasta, true).map(de)) }
    : null;

  return {
    desde: q.desde,
    hasta: q.hasta,
    agrupar: q.agrupar,
    exacto: q.exacto,
    dias: largoEnDias(q.desde, q.hasta),
    periodo: actual,
    anterior,
    variacion: anterior && anterior.periodo.ventas ? Math.round(((actual.ventas - anterior.periodo.ventas) / anterior.periodo.ventas) * 100) : null,
    serie: [...baldes.values()],
    topProductos: [...productos.entries()]
      .map(([nombre, x]) => ({ nombre, ...x }))
      .sort((a, b) => b.unidades - a.unidades || b.ventas - a.ventas || a.nombre.localeCompare(b.nombre))
      .slice(0, 10),
    medios: [...medios.entries()].map(([proveedor, x]) => ({ proveedor, ...x })).sort((a, b) => b.ventas - a.ventas),
  };
}
