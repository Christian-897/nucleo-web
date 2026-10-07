/**
 * Módulo visitas: las visitas de Cloudflare Web Analytics dentro del panel,
 * para que el dueño de la tienda no tenga que entrar a Cloudflare.
 *
 * Lee la API de análisis de Cloudflare (GraphQL, conjunto
 * rumPageloadEventsAdaptiveGroups, sin robots) con una clave de SOLO
 * LECTURA guardada como Secret, y guarda el resultado 10 minutos en KV
 * (la API tiene límites de uso y los números no cambian tan rápido).
 *
 * Variables (Secrets en Cloudflare):
 *   ANALITICA_TOKEN   clave de API con permiso "Account Analytics: Read"
 *   ANALITICA_CUENTA  identificador de la cuenta (Account ID, 32 caracteres)
 *   ANALITICA_SITIO   identificador del sitio en Web Analytics (site tag, 32 caracteres)
 */
import type { EnvBase } from "../../core/tipos";
import { limpiarVariable } from "../../core/correo";

export interface EnvVisitas extends EnvBase {
  ANALITICA_TOKEN?: string;
  ANALITICA_CUENTA?: string;
  ANALITICA_SITIO?: string;
}

export const PERIODOS_VISITAS = [7, 30] as const;
export type PeriodoVisitas = (typeof PERIODOS_VISITAS)[number];

export interface Parte {
  nombre: string;
  /** Páginas vistas. */
  valor: number;
}

export interface ReporteVisitas {
  dias: PeriodoVisitas;
  desde: string;
  hasta: string;
  /** Visitas (personas que llegan al sitio, cada llegada cuenta una vez). */
  visitas: number;
  /** Páginas vistas en total. */
  paginas: number;
  porDia: { dia: string; visitas: number; paginas: number }[];
  masVistas: Parte[];
  /** Código de país de 2 letras (el panel lo traduce). */
  paises: Parte[];
  /** "desktop", "mobile", "tablet"… (el panel lo traduce). */
  dispositivos: Parte[];
  /** Sitio desde el que llegaron; "" = directo. */
  origenes: Parte[];
  /** Hora en que se pidió a Cloudflare (los datos se guardan 10 minutos). */
  generado: string;
}

export class ErrorVisitas extends Error {}

const HEX32 = /^[0-9a-f]{32}$/;
const ENDPOINT = "https://api.cloudflare.com/client/v4/graphql";
const CACHE_SEGUNDOS = 600;
/** Rutas que no son de visitantes (panel, API, fotos). */
const RUTAS_INTERNAS = /^\/(admin|api|media|cdn-cgi)(\/|$)/;

/** ¿Están las 3 variables y con buena forma? */
export function visitasConfiguradas(env: EnvVisitas): boolean {
  const token = limpiarVariable(env.ANALITICA_TOKEN);
  return (
    /^[\x21-\x7e]{20,200}$/.test(token) &&
    HEX32.test(limpiarVariable(env.ANALITICA_CUENTA).toLowerCase()) &&
    HEX32.test(limpiarVariable(env.ANALITICA_SITIO).toLowerCase())
  );
}

/** Una sola petición con varios grupos (con alias). Solo lectura. */
export const CONSULTA = `query Visitas($cuenta: String!, $sitio: String!, $desde: Date!, $hasta: Date!) {
  viewer {
    accounts(filter: { accountTag: $cuenta }) {
      total: rumPageloadEventsAdaptiveGroups(limit: 1, filter: { siteTag: $sitio, date_geq: $desde, date_leq: $hasta, bot: 0 }) { count sum { visits } }
      dias: rumPageloadEventsAdaptiveGroups(limit: 100, filter: { siteTag: $sitio, date_geq: $desde, date_leq: $hasta, bot: 0 }, orderBy: [date_ASC]) { count sum { visits } dimensions { date } }
      paginas: rumPageloadEventsAdaptiveGroups(limit: 25, filter: { siteTag: $sitio, date_geq: $desde, date_leq: $hasta, bot: 0 }, orderBy: [count_DESC]) { count dimensions { requestPath } }
      paises: rumPageloadEventsAdaptiveGroups(limit: 10, filter: { siteTag: $sitio, date_geq: $desde, date_leq: $hasta, bot: 0 }, orderBy: [count_DESC]) { count dimensions { countryName } }
      dispositivos: rumPageloadEventsAdaptiveGroups(limit: 10, filter: { siteTag: $sitio, date_geq: $desde, date_leq: $hasta, bot: 0 }, orderBy: [count_DESC]) { count dimensions { deviceType } }
      origenes: rumPageloadEventsAdaptiveGroups(limit: 10, filter: { siteTag: $sitio, date_geq: $desde, date_leq: $hasta, bot: 0 }, orderBy: [count_DESC]) { count dimensions { refererHost } }
    }
  }
}`;

interface Grupo {
  count?: number;
  sum?: { visits?: number };
  dimensions?: Record<string, string>;
}

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.round(v) : 0);
const texto = (v: unknown) => (typeof v === "string" ? v.slice(0, 200) : "");

function partes(grupos: Grupo[] | undefined, campo: string, filtrar?: (nombre: string) => boolean, tope = 10): Parte[] {
  const salida: Parte[] = [];
  for (const g of grupos ?? []) {
    const nombre = texto(g.dimensions?.[campo]);
    if (filtrar && !filtrar(nombre)) continue;
    salida.push({ nombre, valor: num(g.count) });
    if (salida.length >= tope) break;
  }
  return salida;
}

/** "AAAA-MM-DD" de los últimos n días (hasta hoy, en UTC, como los entrega Cloudflare). */
export function diasHasta(hoy: Date, n: number): string[] {
  const base = Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), hoy.getUTCDate());
  return Array.from({ length: n }, (_, i) => new Date(base - (n - 1 - i) * 86_400_000).toISOString().slice(0, 10));
}

/** Convierte la respuesta de Cloudflare al reporte del panel. Puro: se prueba aparte. */
export function armarReporte(respuesta: unknown, dias: PeriodoVisitas, ahora: Date): ReporteVisitas {
  const r = respuesta as { data?: { viewer?: { accounts?: Record<string, Grupo[]>[] } }; errors?: { message?: string }[] } | null;
  if (!r || (r.errors && r.errors.length)) {
    const m = r?.errors?.[0]?.message ?? "";
    // El detalle va al registro; la pantalla recibe un mensaje claro.
    console.error("[visitas] Cloudflare respondió con error:", m.slice(0, 300));
    if (/auth|permission|token/i.test(m)) throw new ErrorVisitas("La clave de Cloudflare no tiene permiso para leer las visitas.");
    throw new ErrorVisitas("Cloudflare no entregó las visitas. Intenta más tarde.");
  }
  const cuenta = r.data?.viewer?.accounts?.[0];
  if (!cuenta) throw new ErrorVisitas("No se encontró la cuenta de Cloudflare. Revisa ANALITICA_CUENTA.");

  const total = cuenta.total?.[0];
  const porFecha = new Map((cuenta.dias ?? []).map((g) => [texto(g.dimensions?.date), g]));
  const lista = diasHasta(ahora, dias);
  return {
    dias,
    desde: lista[0],
    hasta: lista[lista.length - 1],
    visitas: num(total?.sum?.visits),
    paginas: num(total?.count),
    porDia: lista.map((dia) => {
      const g = porFecha.get(dia);
      return { dia, visitas: num(g?.sum?.visits), paginas: num(g?.count) };
    }),
    masVistas: partes(cuenta.paginas, "requestPath", (p) => p.startsWith("/") && !RUTAS_INTERNAS.test(p)),
    paises: partes(cuenta.paises, "countryName"),
    dispositivos: partes(cuenta.dispositivos, "deviceType"),
    origenes: partes(cuenta.origenes, "refererHost"),
    generado: ahora.toISOString(),
  };
}

export interface OpcionesVisitas {
  /** Para pruebas. */
  fetch?: typeof fetch;
  ahora?: Date;
}

/** Visitas de los últimos 7 o 30 días (con 10 minutos de caché en KV). */
export async function consultarVisitas(env: EnvVisitas, dias: PeriodoVisitas, op: OpcionesVisitas = {}): Promise<ReporteVisitas> {
  if (!visitasConfiguradas(env)) throw new ErrorVisitas("Las visitas no están conectadas todavía.");
  const clave = `visitas:${dias}`;
  try {
    const guardado = await env.REVIEWS_KV?.get(clave);
    if (guardado) return JSON.parse(guardado) as ReporteVisitas;
  } catch {
    /* sin caché: se pide de nuevo */
  }

  const ahora = op.ahora ?? new Date();
  const lista = diasHasta(ahora, dias);
  const variables = {
    cuenta: limpiarVariable(env.ANALITICA_CUENTA).toLowerCase(),
    sitio: limpiarVariable(env.ANALITICA_SITIO).toLowerCase(),
    desde: lista[0],
    hasta: lista[lista.length - 1],
  };
  let respuesta: unknown;
  try {
    const res = await (op.fetch ?? fetch)(ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Bearer ${limpiarVariable(env.ANALITICA_TOKEN)}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query: CONSULTA, variables }),
    });
    if (res.status === 401 || res.status === 403) throw new ErrorVisitas("La clave de Cloudflare no es válida o no tiene permiso.");
    respuesta = await res.json();
  } catch (e) {
    if (e instanceof ErrorVisitas) throw e;
    throw new ErrorVisitas("No se pudo conectar con Cloudflare. Intenta más tarde.");
  }
  const reporte = armarReporte(respuesta, dias, ahora);
  try {
    await env.REVIEWS_KV?.put(clave, JSON.stringify(reporte), { expirationTtl: CACHE_SEGUNDOS });
  } catch {
    /* sin caché: no pasa nada */
  }
  return reporte;
}
