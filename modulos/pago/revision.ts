/**
 * REVISIÓN DE PAGOS (Flow): compara lo que Flow cobró en los últimos días
 * con los pedidos de la tienda y avisa si algo no cuadra.
 *
 * Para qué sirve:
 *  - "Cobro que no salió de la tienda": alguien creó un cobro en Flow con
 *    las claves por fuera del sitio. Es la señal más clara de que las claves
 *    se filtraron (hay que cambiarlas en Flow).
 *  - "Monto distinto": Flow cobró otro monto que el del pedido.
 *  - "Pagado en Flow, no en la tienda": el aviso de Flow no llegó; el pedido
 *    quedó pendiente en el panel aunque el cliente pagó.
 *  - "Pagado en la tienda, Flow no lo tiene": el pedido figura pagado y
 *    Flow no lo reconoce como pagado.
 *
 * Lo que NO ve: las devoluciones (la API de Flow no las lista). Esas se
 * revisan en el portal de Flow → Reembolsos y en las liquidaciones.
 *
 * Solo LEE de Flow (payment/getPayments y payment/getStatusByCommerceId).
 * Guarda el resultado 30 minutos en KV para no consultar a Flow en cada
 * visita al panel.
 */
import { limpiarVariable } from "../../core/correo";
import type { EnvPago, PedidoGuardado } from "./config";
import { type CredencialesFlow, baseUrlFlow, firmarFlow } from "./proveedores/flow";

export type TipoAlerta = "ajeno" | "monto" | "sin-confirmar" | "no-en-flow";

export interface AlertaPago {
  tipo: TipoAlerta;
  orden: string;
  /** Monto en la tienda (si existe el pedido). */
  monto?: number;
  /** Monto que cobró Flow (si Flow lo tiene). */
  montoFlow?: number;
  /** Fecha del pago o del pedido (ISO o "AAAA-MM-DD hh:mm:ss" de Flow). */
  fecha: string;
  /** Correo de quien pagó, según Flow (solo se muestra con sesión). */
  pagador?: string;
}

export interface RevisionPagos {
  conectado: boolean;
  sandbox?: boolean;
  /** Cuándo se consultó a Flow. */
  revisado?: string;
  dias?: number;
  /** Cobros pagados en Flow en el período. */
  pagosFlow?: number;
  /** Pedidos pagados con Flow en la tienda en el período. */
  pedidosTienda?: number;
  alertas?: AlertaPago[];
  /** Flow no respondió bien: el panel lo muestra como aviso, no como alarma. */
  error?: string;
}

export interface PagoFlowListado {
  commerceOrder: string;
  flowOrder?: number;
  status: number;
  amount: number;
  requestDate?: string;
  payer?: string;
}

const CLAVE_CACHE = "pago:revision";
const CACHE_SEGUNDOS = 30 * 60;
const PREFIJO_PEDIDO = "pago:pedido:";
const PAGINAS_MAXIMAS = 5;
const CONSULTAS_EXTRA_MAXIMAS = 10;

export function credencialesRevision(env: EnvPago): CredencialesFlow | null {
  const apiKey = limpiarVariable(env.FLOW_API_KEY);
  const secretKey = limpiarVariable(env.FLOW_SECRET_KEY);
  if (!apiKey || !secretKey) return null;
  const sb = limpiarVariable(env.FLOW_SANDBOX).toLowerCase();
  return { apiKey, secretKey, sandbox: sb === "1" || sb === "true" };
}

/** Los últimos `n` días como fechas locales "AAAA-MM-DD" (Flow trabaja en hora de Chile). */
export function diasLocales(n: number, ahora = new Date(), zona = "America/Santiago"): string[] {
  const f = new Intl.DateTimeFormat("en-CA", { timeZone: zona, year: "numeric", month: "2-digit", day: "2-digit" });
  const salida = new Set<string>();
  for (let i = 0; i < n; i++) salida.add(f.format(new Date(ahora.getTime() - i * 86_400_000)));
  return [...salida];
}

/** Flow documenta `data` como arreglo, pero su ejemplo lo muestra como texto JSON: se aceptan los dos. */
export function leerListaFlow(data: unknown): Record<string, unknown>[] {
  let d = data;
  if (typeof d === "string") {
    try {
      d = JSON.parse(d);
    } catch {
      return [];
    }
  }
  return Array.isArray(d) ? d.filter((x): x is Record<string, unknown> => !!x && typeof x === "object") : [];
}

function aPago(x: Record<string, unknown>): PagoFlowListado | null {
  const commerceOrder = typeof x.commerceOrder === "string" ? x.commerceOrder : String(x.commerceOrder ?? "");
  const status = Number(x.status);
  const amount = Number(x.amount);
  if (!commerceOrder || !Number.isFinite(status) || !Number.isFinite(amount)) return null;
  return {
    commerceOrder: commerceOrder.slice(0, 80),
    flowOrder: Number(x.flowOrder) || undefined,
    status,
    amount,
    requestDate: typeof x.requestDate === "string" ? x.requestDate.slice(0, 30) : undefined,
    payer: typeof x.payer === "string" ? x.payer.slice(0, 200) : undefined,
  };
}

async function getFlow(cred: CredencialesFlow, ruta: string, params: Record<string, string>, fetcher: typeof fetch) {
  const todos = { apiKey: cred.apiKey, ...params };
  const s = await firmarFlow(todos, cred.secretKey);
  const res = await fetcher(`${baseUrlFlow(cred.sandbox)}/${ruta}?${new URLSearchParams({ ...todos, s })}`, { method: "GET" });
  if (!res.ok) throw new Error(`Flow ${ruta} respondió ${res.status}`);
  return (await res.json()) as Record<string, unknown>;
}

/** Todos los pagos que Flow registró en un día (paginado, con tope). */
export async function pagosFlowDelDia(cred: CredencialesFlow, fecha: string, fetcher: typeof fetch = fetch): Promise<PagoFlowListado[]> {
  const salida: PagoFlowListado[] = [];
  for (let pagina = 0; pagina < PAGINAS_MAXIMAS; pagina++) {
    const r = await getFlow(cred, "payment/getPayments", { date: fecha, start: String(pagina * 100), limit: "100" }, fetcher);
    for (const x of leerListaFlow(r.data)) {
      const p = aPago(x);
      if (p) salida.push(p);
    }
    if (!(Number(r.hasMore) === 1 || r.hasMore === true)) break;
  }
  return salida;
}

async function pedidosTienda(env: EnvPago): Promise<Map<string, PedidoGuardado>> {
  const mapa = new Map<string, PedidoGuardado>();
  const kv = env.REVIEWS_KV;
  if (!kv) return mapa;
  const { keys } = await kv.list({ prefix: PREFIJO_PEDIDO, limit: 1000 });
  for (const { name } of keys) {
    try {
      const p = JSON.parse((await kv.get(name)) ?? "null") as PedidoGuardado | null;
      if (p?.orden) mapa.set(p.orden, p);
    } catch {
      /* registro dañado: se ignora */
    }
  }
  return mapa;
}

/** Compara (puro): se prueba aparte. */
export function compararPagos(
  pagosFlow: PagoFlowListado[],
  tienda: Map<string, PedidoGuardado>,
  desdeIso: string
): { alertas: AlertaPago[]; dudosos: PedidoGuardado[]; pagados: number; pedidos: number } {
  const alertas: AlertaPago[] = [];
  const pagadosFlow = new Map<string, PagoFlowListado>();
  for (const p of pagosFlow) if (p.status === 2) pagadosFlow.set(p.commerceOrder, p);

  for (const p of pagadosFlow.values()) {
    const pedido = tienda.get(p.commerceOrder);
    const fecha = p.requestDate ?? "";
    if (!pedido) alertas.push({ tipo: "ajeno", orden: p.commerceOrder, montoFlow: p.amount, fecha, pagador: p.payer });
    else if (Math.round(pedido.monto) !== Math.round(p.amount))
      alertas.push({ tipo: "monto", orden: p.commerceOrder, monto: pedido.monto, montoFlow: p.amount, fecha, pagador: p.payer });
    else if (pedido.estado !== "pagada" && pedido.estado !== "en-revision")
      alertas.push({ tipo: "sin-confirmar", orden: p.commerceOrder, monto: pedido.monto, montoFlow: p.amount, fecha, pagador: p.payer });
  }

  // Pedidos pagados con Flow en el período que no aparecen pagados en la lista.
  const dudosos: PedidoGuardado[] = [];
  let pedidos = 0;
  for (const pedido of tienda.values()) {
    if (pedido.proveedor !== "flow" || pedido.estado !== "pagada" || pedido.creado < desdeIso) continue;
    pedidos++;
    if (!pagadosFlow.has(pedido.orden)) dudosos.push(pedido);
  }
  return { alertas, dudosos, pagados: pagadosFlow.size, pedidos };
}

/**
 * Revisa los últimos `dias` días. Con `forzar`, ignora la caché.
 * Nunca lanza: si Flow falla, devuelve `error` para mostrarlo en el panel.
 */
export async function revisarPagosFlow(
  env: EnvPago,
  opciones: { dias?: number; forzar?: boolean; fetch?: typeof fetch; ahora?: Date; zona?: string } = {}
): Promise<RevisionPagos> {
  const cred = credencialesRevision(env);
  if (!cred) return { conectado: false };
  const kv = env.REVIEWS_KV;
  if (!opciones.forzar && kv) {
    try {
      const guardada = await kv.get(CLAVE_CACHE);
      if (guardada) return JSON.parse(guardada) as RevisionPagos;
    } catch {
      /* sin caché: se consulta */
    }
  }

  const fetcher = opciones.fetch ?? fetch;
  const ahora = opciones.ahora ?? new Date();
  const dias = Math.max(1, Math.min(opciones.dias ?? 7, 14));
  const fechas = diasLocales(dias, ahora, opciones.zona);
  const base: RevisionPagos = { conectado: true, sandbox: cred.sandbox, revisado: ahora.toISOString(), dias };

  let resultado: RevisionPagos;
  try {
    const pagos: PagoFlowListado[] = [];
    for (const fecha of fechas) pagos.push(...(await pagosFlowDelDia(cred, fecha, fetcher)));
    const tienda = await pedidosTienda(env);
    // Un día de margen hacia atrás: el pedido se crea antes de pagarse.
    const desde = new Date(ahora.getTime() - (dias - 1) * 86_400_000).toISOString().slice(0, 10);
    const { alertas, dudosos, pagados, pedidos } = compararPagos(pagos, tienda, desde);

    // Antes de alarmar, se pregunta a Flow por cada pedido dudoso (pudo pagarse otro día).
    for (const pedido of dudosos.slice(0, CONSULTAS_EXTRA_MAXIMAS)) {
      try {
        const r = await getFlow(cred, "payment/getStatusByCommerceId", { commerceOrder: pedido.orden }, fetcher);
        const p = aPago(r);
        if (p && p.status === 2 && Math.round(p.amount) === Math.round(pedido.monto)) continue;
        alertas.push({ tipo: p && p.status === 2 ? "monto" : "no-en-flow", orden: pedido.orden, monto: pedido.monto, montoFlow: p?.amount, fecha: pedido.creado });
      } catch {
        alertas.push({ tipo: "no-en-flow", orden: pedido.orden, monto: pedido.monto, fecha: pedido.creado });
      }
    }
    resultado = { ...base, pagosFlow: pagados, pedidosTienda: pedidos, alertas };
  } catch (e) {
    console.error("[revision-pagos]", e instanceof Error ? e.message : e);
    resultado = { ...base, error: "Flow no respondió. Se intentará de nuevo más tarde." };
  }

  if (kv) {
    try {
      await kv.put(CLAVE_CACHE, JSON.stringify(resultado), { expirationTtl: resultado.error ? 300 : CACHE_SEGUNDOS });
    } catch {
      /* sin caché: no pasa nada */
    }
  }
  return resultado;
}
