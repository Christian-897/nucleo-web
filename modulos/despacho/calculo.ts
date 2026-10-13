/**
 * CÁLCULO DEL DESPACHO. Funciones puras: las usa el servidor (que es el que
 * cobra) y el navegador (que solo muestra). El navegador nunca decide el
 * monto: el servidor lo recalcula con la región validada del comprador.
 */
import { formatearPrecio } from "../carrito/formato";

export type ModoDespacho = "por-pagar" | "tarifa";
export type ZonaDespacho = "rm" | "regiones" | "extremas";

export interface TarifasDespacho {
  /** "por-pagar": el comprador paga al recibir. "tarifa": se suma al total según la zona. */
  modo: ModoDespacho;
  /** Pesos chilenos, enteros. 0 = gratis en esa zona. */
  rm: number;
  regiones: number;
  extremas: number;
  /** Compras de este monto o más (en productos) no pagan despacho. null = sin esa regla. */
  gratisDesde: number | null;
}

export const ZONAS: { id: ZonaDespacho; nombre: string }[] = [
  { id: "rm", nombre: "Región Metropolitana" },
  { id: "regiones", nombre: "Regiones" },
  { id: "extremas", nombre: "Zonas extremas" },
];

/** Regiones que cuentan como zona extrema si el sitio no dice otra cosa. */
export const ZONAS_EXTREMAS_POR_DEFECTO = [
  "Arica y Parinacota",
  "Aysén del General Carlos Ibáñez del Campo",
  "Magallanes y de la Antártica Chilena",
] as const;

export const REGION_RM = "Metropolitana de Santiago";

export const MAXIMO_TARIFA = 200_000;
export const MAXIMO_GRATIS_DESDE = 10_000_000;

export function zonaDe(region: string, extremas: readonly string[] = ZONAS_EXTREMAS_POR_DEFECTO): ZonaDespacho {
  if (region === REGION_RM) return "rm";
  return extremas.includes(region) ? "extremas" : "regiones";
}

export interface CalculoDespacho {
  modo: ModoDespacho;
  /** Lo que se suma al total. Siempre 0 en "por-pagar". */
  costo: number;
  zona?: ZonaDespacho;
  /** true si sería pagado pero la compra llegó al monto de despacho gratis. */
  gratisPorMonto: boolean;
}

/** `subtotal` = suma de los productos (sin despacho). */
export function calcularDespacho(
  t: TarifasDespacho,
  region: string | undefined,
  subtotal: number,
  extremas?: readonly string[]
): CalculoDespacho {
  if (t.modo !== "tarifa") return { modo: "por-pagar", costo: 0, gratisPorMonto: false };
  const zona = zonaDe(region ?? "", extremas);
  const base = t[zona];
  if (base > 0 && t.gratisDesde !== null && subtotal >= t.gratisDesde) {
    return { modo: "tarifa", costo: 0, zona, gratisPorMonto: true };
  }
  return { modo: "tarifa", costo: base, zona, gratisPorMonto: false };
}

export interface TextosDespacho {
  /** Para franjas y listas cortas: "Despacho gratis a todo Chile". */
  corto: string;
  /** Para la ficha del producto: con los valores, antes de llegar al carrito. */
  ficha: string;
  /** Explicación para el carrito, preguntas frecuentes y términos. */
  detalle: string;
  /** Lo que dice la fila "Despacho" del carrito antes de elegir región. */
  filaSinRegion: string;
}

const pesos = (n: number) => (n === 0 ? "gratis" : formatearPrecio(n));

/**
 * Los avisos del sitio salen de la configuración: nunca dicen "gratis" si
 * hay cobro, y la ficha muestra el valor antes del carrito (sin sorpresas).
 */
const CORTOS: Record<string, string> = {
  "Aysén del General Carlos Ibáñez del Campo": "Aysén",
  "Magallanes y de la Antártica Chilena": "Magallanes",
  "Libertador General Bernardo O'Higgins": "O'Higgins",
};
const listaRegiones = (r: readonly string[]) => {
  const n = r.map((x) => CORTOS[x] ?? x);
  return n.length > 1 ? `${n.slice(0, -1).join(", ")} y ${n[n.length - 1]}` : n.join("");
};

export function textosDespacho(
  t: TarifasDespacho,
  detallePorPagar: string,
  extremas: readonly string[] = ZONAS_EXTREMAS_POR_DEFECTO
): TextosDespacho {
  if (t.modo !== "tarifa") {
    return { corto: "Envíos a todo Chile", ficha: "Envío por pagar a todo Chile", detalle: detallePorPagar, filaSinRegion: "Por pagar" };
  }
  const valores = [t.rm, t.regiones, t.extremas];
  const todoGratis = valores.every((v) => v === 0);
  if (todoGratis) {
    return {
      corto: "Despacho gratis a todo Chile",
      ficha: "Despacho gratis a todo Chile",
      detalle: "El despacho es gratis a todo Chile. Los cursos y patrones llegan a tu correo.",
      filaSinRegion: "Gratis",
    };
  }
  const iguales = valores.every((v) => v === t.rm);
  const tabla = iguales
    ? `${formatearPrecio(t.rm)} a todo Chile`
    : ZONAS.map((z) => `${z.nombre} ${pesos(t[z.id])}`).join(" · ");
  const gratis = t.gratisDesde !== null ? ` Gratis en compras desde ${formatearPrecio(t.gratisDesde)}.` : "";
  const notaExtremas = iguales || !extremas.length ? "" : ` Zonas extremas: ${listaRegiones(extremas)}.`;
  return {
    corto: t.gratisDesde !== null ? `Despacho gratis desde ${formatearPrecio(t.gratisDesde)}` : "Envíos a todo Chile",
    ficha: `Despacho: ${tabla}.${gratis}`,
    detalle: `El despacho se suma al total según tu región: ${tabla}.${gratis}${notaExtremas} Los cursos y patrones llegan a tu correo.`,
    filaSinRegion: "Elige tu región",
  };
}

export type ResultadoTarifas = { ok: true; datos: TarifasDespacho } | { ok: false; mensaje: string; errores: Record<string, string> };

/** Valida lo que llega del panel (o lo que dejó el sitio como inicial). */
export function validarTarifas(entrada: unknown): ResultadoTarifas {
  const e = (entrada ?? {}) as Record<string, unknown>;
  const errores: Record<string, string> = {};
  const modo = e.modo === "tarifa" || e.modo === "por-pagar" ? e.modo : null;
  if (!modo) errores.modo = "Elige cómo se cobra el despacho.";
  const monto = (campo: string, max: number) => {
    const v = e[campo];
    if (typeof v !== "number" || !Number.isInteger(v) || v < 0 || v > max) {
      errores[campo] = `Escribe un monto entre $0 y ${formatearPrecio(max)}, sin decimales.`;
      return 0;
    }
    return v;
  };
  const rm = monto("rm", MAXIMO_TARIFA);
  const regiones = monto("regiones", MAXIMO_TARIFA);
  const extremas = monto("extremas", MAXIMO_TARIFA);
  let gratisDesde: number | null = null;
  if (e.gratisDesde !== null && e.gratisDesde !== undefined && e.gratisDesde !== "") {
    const v = e.gratisDesde;
    if (typeof v !== "number" || !Number.isInteger(v) || v < 1000 || v > MAXIMO_GRATIS_DESDE) {
      errores.gratisDesde = "El monto para despacho gratis va desde $1.000, sin decimales. Déjalo vacío si no lo usas.";
    } else gratisDesde = v;
  }
  if (Object.keys(errores).length) return { ok: false, mensaje: "Revisa los campos marcados.", errores };
  return { ok: true, datos: { modo: modo!, rm, regiones, extremas, gratisDesde } };
}
