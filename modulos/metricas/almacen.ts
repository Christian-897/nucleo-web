/**
 * Totales diarios en KV. Se suman UNA vez por pedido (marca por orden), así
 * que se puede llamar al confirmar el pago y también "ponerse al día" desde
 * los pedidos guardados sin contar dos veces.
 *
 * Por qué totales y no recorrer pedidos: los pedidos vencen en KV (90 días
 * por defecto). Los totales por día duran 400 días (gráfico de 30 días y
 * comparación "año a la fecha") y los totales por MES no vencen nunca, para
 * comparar un año con otro. Son 12 claves por año: caben décadas.
 *
 * Limitación conocida: KV no es transaccional. Dos pagos confirmados en el
 * mismo instante podrían pisarse un total. Para una tienda chica es
 * aceptable; si crece, esto se mueve a D1 sin cambiar la pantalla.
 */
import type { AlmacenKV } from "../../core/tipos";
import { diaLocal, ultimosDias, ZONA_POR_DEFECTO } from "./fechas";
import type { DiaMetricas, PedidoParaMetricas } from "./tipos";

export const PREFIJO_DIA = "metricas:dia:";
export const PREFIJO_CONTADO = "metricas:contado:";
/** Totales por mes: NO vencen, para comparar años. */
export const PREFIJO_MES = "metricas:mes:";
const DURACION = 400 * 86400;
const MAX_PRODUCTOS_POR_DIA = 200;
const ORDEN_VALIDA = /^[A-Za-z0-9_-]{1,64}$/;

function leerDia(crudo: string | null): DiaMetricas {
  try {
    const d = crudo ? JSON.parse(crudo) : null;
    if (d && typeof d.v === "number" && typeof d.n === "number") {
      return { v: d.v, n: d.n, p: d.p && typeof d.p === "object" ? d.p : {}, m: d.m && typeof d.m === "object" ? d.m : {} };
    }
  } catch {
    /* dato dañado: se parte de cero ese día */
  }
  return { v: 0, n: 0, p: {}, m: {} };
}

const entero = (x: unknown) => (typeof x === "number" && Number.isFinite(x) && x > 0 ? Math.round(x) : 0);

/** Suma un pedido pagado a su día. Devuelve false si ya estaba contado o no sirve. */
export async function registrarPedido(
  kv: AlmacenKV | undefined,
  pedido: PedidoParaMetricas,
  zona = ZONA_POR_DEFECTO
): Promise<boolean> {
  if (!kv || !ORDEN_VALIDA.test(pedido.orden)) return false;
  const dia = diaLocal(pedido.creado, zona);
  if (!dia) return false;
  if (await kv.get(PREFIJO_CONTADO + pedido.orden)) return false;
  // La marca va primero: si algo falla después, se pierde una venta en el
  // gráfico, pero nunca se cuenta doble.
  await kv.put(PREFIJO_CONTADO + pedido.orden, dia, { expirationTtl: DURACION });

  const sumar = (t: DiaMetricas) => {
    const monto = entero(pedido.monto);
    t.v += monto;
    t.n += 1;
    const prov = String(pedido.proveedor || "otro").slice(0, 30);
    const [mn, mv] = t.m[prov] ?? [0, 0];
    t.m[prov] = [mn + 1, mv + monto];
    for (const l of pedido.lineas ?? []) {
      const nombre = String(l.nombre ?? "").trim().slice(0, 120);
      if (!nombre) continue;
      if (!t.p[nombre] && Object.keys(t.p).length >= MAX_PRODUCTOS_POR_DIA) continue;
      const [u, v] = t.p[nombre] ?? [0, 0];
      t.p[nombre] = [u + entero(l.cantidad), v + entero(l.subtotal)];
    }
    return JSON.stringify(t);
  };
  await kv.put(PREFIJO_DIA + dia, sumar(leerDia(await kv.get(PREFIJO_DIA + dia))), { expirationTtl: DURACION });
  const mes = dia.slice(0, 7);
  await kv.put(PREFIJO_MES + mes, sumar(leerDia(await kv.get(PREFIJO_MES + mes))));
  return true;
}

/** Lee días puntuales (por ejemplo, el mismo mes del año pasado). */
export async function leerDias(kv: AlmacenKV | undefined, dias: string[]): Promise<Record<string, DiaMetricas>> {
  const salida: Record<string, DiaMetricas> = {};
  if (!kv || !dias.length) return salida;
  const crudos = await Promise.all(dias.map((d) => kv.get(PREFIJO_DIA + d)));
  dias.forEach((d, i) => {
    if (crudos[i]) salida[d] = leerDia(crudos[i]);
  });
  return salida;
}

/** Lee todos los totales mensuales guardados ("AAAA-MM" → totales). */
export async function leerMeses(kv: AlmacenKV | undefined): Promise<Record<string, DiaMetricas>> {
  const salida: Record<string, DiaMetricas> = {};
  if (!kv) return salida;
  const nombres = await listarClaves(kv, PREFIJO_MES);
  const validos = nombres.filter((n) => /^\d{4}-\d{2}$/.test(n.slice(PREFIJO_MES.length)));
  const crudos = await Promise.all(validos.map((n) => kv.get(n)));
  validos.forEach((n, i) => {
    if (crudos[i]) salida[n.slice(PREFIJO_MES.length)] = leerDia(crudos[i]);
  });
  return salida;
}

/** Lee los totales de los últimos `n` días (por defecto 30). */
export async function leerTotales(
  kv: AlmacenKV | undefined,
  hoy: string,
  n = 30
): Promise<Record<string, DiaMetricas>> {
  const salida: Record<string, DiaMetricas> = {};
  if (!kv) return salida;
  const dias = ultimosDias(hoy, n);
  const crudos = await Promise.all(dias.map((d) => kv.get(PREFIJO_DIA + d)));
  dias.forEach((d, i) => {
    if (crudos[i]) salida[d] = leerDia(crudos[i]);
  });
  return salida;
}

/** Nombres de clave bajo un prefijo (con paginación del KV real). */
async function listarClaves(kv: AlmacenKV, prefijo: string, maximo = 5000): Promise<string[]> {
  const nombres: string[] = [];
  let cursor: string | undefined;
  do {
    const r = (await kv.list({ prefix: prefijo, limit: 1000, ...(cursor ? { cursor } : {}) } as Parameters<AlmacenKV["list"]>[0])) as {
      keys: { name: string }[];
      list_complete?: boolean;
      cursor?: string;
    };
    nombres.push(...r.keys.map((k) => k.name));
    cursor = r.list_complete === false ? r.cursor : undefined;
  } while (cursor && nombres.length < maximo);
  return nombres;
}

/**
 * Totales diarios entre dos fechas. Primero LISTA qué días tienen ventas y
 * solo lee esos: un rango de un año sin muchas ventas son pocas lecturas
 * (Cloudflare limita las operaciones por petición).
 */
export async function leerRangoDias(kv: AlmacenKV | undefined, desde: string, hasta: string): Promise<Record<string, DiaMetricas>> {
  if (!kv) return {};
  const dias = (await listarClaves(kv, PREFIJO_DIA))
    .map((n) => n.slice(PREFIJO_DIA.length))
    .filter((d) => d >= desde && d <= hasta);
  return leerDias(kv, dias);
}

/** Órdenes ya contadas en métricas (una sola operación de listado por cada 1000). */
export async function ordenesContadas(kv: AlmacenKV | undefined): Promise<Set<string>> {
  if (!kv) return new Set();
  return new Set((await listarClaves(kv, PREFIJO_CONTADO, 100000)).map((n) => n.slice(PREFIJO_CONTADO.length)));
}
