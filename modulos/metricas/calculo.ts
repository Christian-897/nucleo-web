/**
 * Cálculo puro del resumen a partir de los totales diarios. Sin KV ni red:
 * se prueba con datos inventados.
 */
import { ultimosDias } from "./fechas";
import type { DiaMetricas, Periodo, Resumen, ResumenAnual } from "./tipos";

const vacio = (): DiaMetricas => ({ v: 0, n: 0, p: {}, m: {} });

function periodo(dias: DiaMetricas[]): Periodo {
  const ventas = dias.reduce((s, d) => s + d.v, 0);
  const pedidos = dias.reduce((s, d) => s + d.n, 0);
  return { ventas, pedidos, ticket: pedidos ? Math.round(ventas / pedidos) : 0 };
}

/** Días del 1 al `dia` (o fin de mes) del mes `anio-mes`, como "AAAA-MM-DD". */
export function diasDelMesHasta(anio: number, mes: number, dia: number): string[] {
  const fin = new Date(Date.UTC(anio, mes, 0)).getUTCDate(); // días del mes
  const tope = Math.min(dia, fin);
  const mm = String(mes).padStart(2, "0");
  return Array.from({ length: tope }, (_, i) => `${anio}-${mm}-${String(i + 1).padStart(2, "0")}`);
}

/**
 * Comparación por años. `meses` son los totales mensuales; `diasMesAnterior`
 * los días del mes actual pero del AÑO ANTERIOR (para cortar "a la fecha"
 * en el mismo día y no comparar un mes a medias con uno completo).
 */
export function calcularAnual(
  meses: Record<string, DiaMetricas | undefined>,
  diasMesAnterior: Record<string, DiaMetricas | undefined>,
  hoy: string
): ResumenAnual {
  const [anio, mes] = hoy.split("-").map(Number);
  const deMes = (clave: string) => meses[clave];
  const sumar = (lista: (DiaMetricas | undefined)[]): Periodo => periodo(lista.map((d) => d ?? vacio()));
  const mm = (m: number) => String(m).padStart(2, "0");

  // Año en curso: todos sus meses guardados (no hay meses futuros con ventas).
  const aFecha = sumar(Array.from({ length: mes }, (_, i) => deMes(`${anio}-${mm(i + 1)}`)));
  // Año anterior: meses completos antes del actual + días del mes actual hasta hoy.
  const completos = Array.from({ length: mes - 1 }, (_, i) => deMes(`${anio - 1}-${mm(i + 1)}`));
  const aFechaAnterior = sumar([...completos, ...Object.values(diasMesAnterior)]);

  const porAnio = new Map<number, DiaMetricas[]>();
  const salidaMeses: ResumenAnual["meses"] = {};
  for (const [clave, t] of Object.entries(meses)) {
    if (!t || !/^\d{4}-\d{2}$/.test(clave)) continue;
    salidaMeses[clave] = { ventas: t.v, pedidos: t.n };
    const a = Number(clave.slice(0, 4));
    porAnio.set(a, [...(porAnio.get(a) ?? []), t]);
  }
  const anios = [...porAnio.entries()]
    .map(([a, lista]) => ({ anio: a, ...periodo(lista) }))
    .sort((x, y) => y.anio - x.anio);

  return {
    anio,
    hoy,
    aFecha,
    aFechaAnterior,
    variacionAnual: aFechaAnterior.ventas
      ? Math.round(((aFecha.ventas - aFechaAnterior.ventas) / aFechaAnterior.ventas) * 100)
      : null,
    meses: salidaMeses,
    anios,
  };
}

export function calcularResumen(
  totales: Record<string, DiaMetricas | undefined>,
  hoy: string,
  zona: string,
  anual: ResumenAnual = calcularAnual({}, {}, hoy)
): Resumen {
  const dias30 = ultimosDias(hoy, 30);
  const dias14 = dias30.slice(-14);
  const de = (dia: string) => totales[dia] ?? vacio();

  const d7 = periodo(dias14.slice(7).map(de));
  const d7Anterior = periodo(dias14.slice(0, 7).map(de));

  const productos = new Map<string, { unidades: number; ventas: number }>();
  const medios = new Map<string, { pedidos: number; ventas: number }>();
  for (const dia of dias30) {
    const t = de(dia);
    for (const [nombre, [u, v]] of Object.entries(t.p)) {
      const x = productos.get(nombre) ?? { unidades: 0, ventas: 0 };
      x.unidades += u;
      x.ventas += v;
      productos.set(nombre, x);
    }
    for (const [prov, [n, v]] of Object.entries(t.m)) {
      const x = medios.get(prov) ?? { pedidos: 0, ventas: 0 };
      x.pedidos += n;
      x.ventas += v;
      medios.set(prov, x);
    }
  }

  return {
    hoy,
    zona,
    periodos: { hoy: periodo([de(hoy)]), d7, d7Anterior, d30: periodo(dias30.map(de)) },
    variacion7: d7Anterior.ventas ? Math.round(((d7.ventas - d7Anterior.ventas) / d7Anterior.ventas) * 100) : null,
    serie: dias30.map((dia) => ({ dia, ventas: de(dia).v, pedidos: de(dia).n })),
    topProductos: [...productos.entries()]
      .map(([nombre, x]) => ({ nombre, ...x }))
      .sort((a, b) => b.unidades - a.unidades || b.ventas - a.ventas || a.nombre.localeCompare(b.nombre))
      .slice(0, 5),
    medios: [...medios.entries()]
      .map(([proveedor, x]) => ({ proveedor, ...x }))
      .sort((a, b) => b.ventas - a.ventas),
    anual,
  };
}
