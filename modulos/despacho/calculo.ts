/**
 * CÁLCULO DEL DESPACHO. Funciones puras: las usa el servidor (que es el que
 * cobra) y el navegador (que solo muestra). El navegador nunca decide el
 * monto: el servidor lo recalcula con la región y comuna validadas.
 *
 * Cuatro zonas fijas, pensadas para que la dueña solo marque casillas:
 *  - Región Metropolitana: "zona centro" (comunas marcadas) y "zona alejada" (el resto).
 *  - Resto de Chile: "zona cercana" (regiones marcadas) y "zona extrema" (el resto).
 */
import { formatearPrecio } from "../carrito/formato";
import { REGIONES_CHILE } from "../compra/regiones";
import { normalizeInput } from "../../core/validar";

export type ZonaDespacho = "centro" | "alejada" | "cercana" | "extrema";
/**
 * Cómo recibe y paga el comprador: despacho pagado con la compra, despacho
 * por pagar al recibir, o retiro sin costo (sin despacho).
 */
export type FormaDespacho = "ahora" | "al-recibir" | "retiro";

export const IDS_ZONAS: readonly ZonaDespacho[] = ["centro", "alejada", "cercana", "extrema"];

/** Nombres que la dueña puede elegir para el retiro (el que se ve en la tienda). */
export const NOMBRES_RETIRO = [
  "Retiro coordinado",
  "Retiro en punto de encuentro",
  "Punto de retiro",
  "Retiro presencial",
  "Retiro en domicilio",
] as const;
export type NombreRetiro = (typeof NOMBRES_RETIRO)[number];

/**
 * Retiro sin costo (para quien no tiene tienda física). En la tienda se ve el
 * nombre y la comuna; la dirección exacta, si `direccionSoloEnCorreo`, solo va
 * en el correo de confirmación (después de pagar), para no publicarla.
 */
export interface RetiroDespacho {
  activo: boolean;
  nombre: NombreRetiro;
  comuna: string;
  direccion: string;
  instrucciones: string;
  direccionSoloEnCorreo: boolean;
}

export const RETIRO_POR_DEFECTO: RetiroDespacho = {
  activo: false,
  nombre: "Retiro coordinado",
  comuna: "",
  direccion: "",
  instrucciones: "",
  direccionSoloEnCorreo: true,
};

export interface TarifasDespacho {
  /**
   * true: se cobra según la zona y el comprador SIEMPRE elige en el carrito si
   * lo paga con la compra o al recibir. false: todo "por pagar" (como antes).
   */
  pagarAhora: boolean;
  /** true si en alguna zona se puede pagar al recibir (resumen de `alRecibirZonas`). */
  pagarAlRecibir: boolean;
  /**
   * Zonas donde el comprador puede elegir pagar el despacho al recibir. En
   * las demás se paga con la compra (p. ej. el courier de Santiago lo exige
   * pagado). Solo cuenta con `pagarAhora`: sin él, todo es por pagar.
   */
  alRecibirZonas: ZonaDespacho[];
  /** Retiro sin costo (opcional). */
  retiro: RetiroDespacho;
  /** Pesos chilenos, enteros. 0 = gratis en esa zona. */
  centro: number;
  alejada: number;
  cercana: number;
  extrema: number;
  /** Comunas de la RM que son "zona centro". Las demás de la RM son "zona alejada". */
  comunasCentro: string[];
  /** Regiones (sin la RM) que son "zona cercana". Las demás son "zona extrema". */
  regionesCercanas: string[];
  /** Compras de este monto o más (en productos) no pagan despacho. null = sin esa regla. */
  gratisDesde: number | null;
  /**
   * true (por defecto): los avisos de la tienda (ficha, términos, nota del
   * carrito) muestran la tabla de valores por zona. false: no muestran
   * montos; el valor aparece solo en el carrito, al elegir región y comuna,
   * sumado al total antes de pagar (lo exige la Ley 19.496).
   */
  mostrarValores: boolean;
}

export const ZONAS: { id: ZonaDespacho; nombre: string }[] = [
  { id: "centro", nombre: "Santiago zona centro" },
  { id: "alejada", nombre: "Santiago zona alejada" },
  { id: "cercana", nombre: "Regiones zona cercana" },
  { id: "extrema", nombre: "Regiones zona extrema" },
];
export const nombreZona = (z?: string) => ZONAS.find((x) => x.id === z)?.nombre ?? "";

export const REGION_RM = "Metropolitana de Santiago";

/** Las 52 comunas de la Región Metropolitana, por provincia. */
export const COMUNAS_RM = [
  // Provincia de Santiago
  "Cerrillos", "Cerro Navia", "Conchalí", "El Bosque", "Estación Central", "Huechuraba", "Independencia",
  "La Cisterna", "La Florida", "La Granja", "La Pintana", "La Reina", "Las Condes", "Lo Barnechea",
  "Lo Espejo", "Lo Prado", "Macul", "Maipú", "Ñuñoa", "Pedro Aguirre Cerda", "Peñalolén", "Providencia",
  "Pudahuel", "Quilicura", "Quinta Normal", "Recoleta", "Renca", "San Joaquín", "San Miguel", "San Ramón",
  "Santiago", "Vitacura",
  // Cordillera
  "Puente Alto", "Pirque", "San José de Maipo",
  // Chacabuco
  "Colina", "Lampa", "Tiltil",
  // Maipo
  "San Bernardo", "Buin", "Calera de Tango", "Paine",
  // Melipilla
  "Melipilla", "Alhué", "Curacaví", "María Pinto", "San Pedro",
  // Talagante
  "Talagante", "El Monte", "Isla de Maipo", "Padre Hurtado", "Peñaflor",
] as const;

/** Las regiones que no son la RM (las que se marcan como cercanas o extremas). */
export const REGIONES_FUERA_RM = REGIONES_CHILE.filter((r) => r !== REGION_RM);

/** De fábrica: el Gran Santiago (provincia de Santiago + Puente Alto + San Bernardo). */
export const COMUNAS_CENTRO_POR_DEFECTO = [...COMUNAS_RM.slice(0, 32), "Puente Alto", "San Bernardo"];
/** De fábrica: todas menos Arica y Parinacota, Aysén y Magallanes. */
export const REGIONES_CERCANAS_POR_DEFECTO = REGIONES_FUERA_RM.filter(
  (r) => !["Arica y Parinacota", "Aysén del General Carlos Ibáñez del Campo", "Magallanes y de la Antártica Chilena"].includes(r)
);

export const TARIFAS_POR_DEFECTO: TarifasDespacho = {
  pagarAhora: false,
  pagarAlRecibir: true,
  alRecibirZonas: [...IDS_ZONAS],
  retiro: RETIRO_POR_DEFECTO,
  centro: 0,
  alejada: 0,
  cercana: 0,
  extrema: 0,
  comunasCentro: COMUNAS_CENTRO_POR_DEFECTO,
  regionesCercanas: REGIONES_CERCANAS_POR_DEFECTO,
  gratisDesde: null,
  mostrarValores: true,
};

export const MAXIMO_TARIFA = 200_000;
export const MAXIMO_GRATIS_DESDE = 10_000_000;

export const esComunaRM = (comuna: string) => (COMUNAS_RM as readonly string[]).includes(comuna);

export function zonaDe(t: Pick<TarifasDespacho, "comunasCentro" | "regionesCercanas">, region: string, comuna = ""): ZonaDespacho {
  if (region === REGION_RM) return t.comunasCentro.includes(comuna) ? "centro" : "alejada";
  return t.regionesCercanas.includes(region) ? "cercana" : "extrema";
}

/** ¿En esta zona el comprador puede pagar el despacho al recibir? */
export function alRecibirPermitido(t: Pick<TarifasDespacho, "pagarAhora" | "alRecibirZonas">, zona: ZonaDespacho): boolean {
  // Sin cobro por zona, todo el despacho es por pagar.
  if (!t.pagarAhora) return true;
  return t.alRecibirZonas.includes(zona);
}

/** ¿El comprador pidió retiro y está ofrecido? */
export const esRetiro = (t: Pick<TarifasDespacho, "retiro">, pedida?: unknown) => pedida === "retiro" && t.retiro.activo === true;

/** La forma que rige en esa zona: la pedida si está permitida; si no, la que haya. */
export function formaValida(t: TarifasDespacho, pedida?: unknown, zona?: ZonaDespacho): FormaDespacho {
  if (esRetiro(t, pedida)) return "retiro";
  const alRecibir = zona ? alRecibirPermitido(t, zona) : t.pagarAlRecibir;
  if (pedida === "ahora" && t.pagarAhora) return "ahora";
  if (pedida === "al-recibir" && alRecibir) return "al-recibir";
  return t.pagarAhora ? "ahora" : "al-recibir";
}

export interface CalculoDespacho {
  forma: FormaDespacho;
  /** Lo que se suma al total. 0 si es al recibir o gratis. */
  costo: number;
  /** Lo que costaría pagarlo ahora en esta zona (para mostrar la opción). */
  valorZona: number;
  zona: ZonaDespacho;
  /** true si la compra llegó al monto de despacho gratis (y la zona cobraba). */
  gratisPorMonto: boolean;
  /** true si en esta zona se puede elegir pagar al recibir (para mostrar la opción). */
  puedeAlRecibir: boolean;
}

/** `subtotal` = suma de los productos (sin despacho). */
export function calcularDespacho(
  t: TarifasDespacho,
  destino: { region?: string; comuna?: string },
  subtotal: number,
  formaPedida?: unknown
): CalculoDespacho {
  const zona = zonaDe(t, destino.region ?? "", destino.comuna ?? "");
  const puedeAlRecibir = alRecibirPermitido(t, zona);
  // Retiro: sin despacho, no se cobra nada por él.
  if (esRetiro(t, formaPedida)) return { forma: "retiro", costo: 0, valorZona: 0, zona, gratisPorMonto: false, puedeAlRecibir };
  const base = t[zona];
  const gratisPorMonto = base > 0 && t.gratisDesde !== null && subtotal >= t.gratisDesde;
  const valorZona = gratisPorMonto ? 0 : base;
  // Gratis (por zona o por monto) y se puede pagar ahora: no hay nada que elegir.
  const forma = t.pagarAhora && valorZona === 0 ? "ahora" : formaValida(t, formaPedida, zona);
  return { forma, costo: forma === "ahora" ? valorZona : 0, valorZona, zona, gratisPorMonto, puedeAlRecibir };
}

export interface TextosDespacho {
  /** Para franjas y listas cortas. */
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
 * hay cobro, y la ficha muestra los valores antes del carrito (sin sorpresas).
 */
/** "Retiro coordinado en Maipú" (nunca la dirección: esa puede ir solo en el correo). */
export function textoRetiro(r: { nombre: string; comuna: string }): string {
  return r.comuna ? `${r.nombre} en ${r.comuna}` : r.nombre;
}

/** Frase de "pagar al recibir" según las zonas marcadas. */
function fraseAlRecibir(t: TarifasDespacho): string {
  const z = t.alRecibirZonas;
  if (!z.length) return "";
  if (IDS_ZONAS.every((x) => z.includes(x))) return " También puedes pagarlo al recibir.";
  const soloRegiones = !z.includes("centro") && !z.includes("alejada");
  if (soloRegiones && z.includes("cercana") && z.includes("extrema")) return " En regiones también puedes pagarlo al recibir.";
  if (!z.includes("cercana") && !z.includes("extrema") && z.includes("centro") && z.includes("alejada")) {
    return " En la Región Metropolitana también puedes pagarlo al recibir.";
  }
  return ` En ${z.map((x) => nombreZona(x)).join(", ").replace(/, ([^,]*)$/, " y $1")} también puedes pagarlo al recibir.`;
}

export function textosDespacho(t: TarifasDespacho, detallePorPagar: string): TextosDespacho {
  const conRetiro = (x: TextosDespacho): TextosDespacho => {
    if (!t.retiro?.activo) return x;
    const frase = ` También puedes retirarlo sin costo: ${textoRetiro(t.retiro)}.`;
    return { ...x, ficha: `${x.ficha.replace(/\.?$/, ".")}${frase}`, detalle: `${x.detalle.replace(/\.?$/, ".")}${frase}` };
  };
  if (!t.pagarAhora) {
    return conRetiro({ corto: "Envíos a todo Chile", ficha: "Envío por pagar a todo Chile", detalle: detallePorPagar, filaSinRegion: "Por pagar" });
  }
  const valores = ZONAS.map((z) => t[z.id]);
  const alRecibir = fraseAlRecibir(t);
  if (valores.every((v) => v === 0)) {
    return conRetiro({
      corto: "Despacho gratis a todo Chile",
      ficha: "Despacho gratis a todo Chile",
      detalle: "El despacho es gratis a todo Chile. Los cursos y patrones llegan a tu correo.",
      filaSinRegion: "Gratis",
    });
  }
  const gratis0 = t.gratisDesde !== null ? ` Gratis en compras desde ${formatearPrecio(t.gratisDesde)}.` : "";
  if (!t.mostrarValores) {
    return conRetiro({
      corto: t.gratisDesde !== null ? `Despacho gratis desde ${formatearPrecio(t.gratisDesde)}` : "Envíos a todo Chile",
      ficha: `Despacho a todo Chile: el valor se calcula en el carrito según tu comuna.${gratis0}`,
      detalle: `El valor del despacho depende de tu comuna o región y lo verás en el carrito, antes de pagar.${gratis0}${alRecibir} Los cursos y patrones llegan a tu correo.`,
      filaSinRegion: "Elige tu región",
    });
  }
  const iguales = valores.every((v) => v === valores[0]);
  const tabla = iguales
    ? `${formatearPrecio(valores[0])} a todo Chile`
    : ZONAS.map((z) => `${z.nombre} ${pesos(t[z.id])}`).join(" · ");
  const gratis = t.gratisDesde !== null ? ` Gratis en compras desde ${formatearPrecio(t.gratisDesde)}.` : "";
  return conRetiro({
    corto: t.gratisDesde !== null ? `Despacho gratis desde ${formatearPrecio(t.gratisDesde)}` : "Envíos a todo Chile",
    ficha: `Despacho: ${tabla}.${gratis}${alRecibir}`,
    detalle: `El valor del despacho depende de tu comuna o región: ${tabla}.${gratis}${alRecibir} Los cursos y patrones llegan a tu correo.`,
    filaSinRegion: "Elige tu región",
  });
}

/**
 * Lo que puede ver cualquiera (GET /api/despacho): sin la dirección del
 * retiro si la dueña marcó que va solo en el correo.
 */
export function tarifasPublicas(t: TarifasDespacho): TarifasDespacho {
  if (!t.retiro.direccionSoloEnCorreo && t.retiro.activo) return t;
  return { ...t, retiro: { ...t.retiro, direccion: "" } };
}

export type ResultadoTarifas = { ok: true; datos: TarifasDespacho } | { ok: false; mensaje: string; errores: Record<string, string> };

/**
 * Las tarifas de la v0.19 (modo/rm/regiones/extremas) se pasan al formato
 * nuevo, para que lo guardado antes siga sirviendo.
 */
function desdeVersionAnterior(e: Record<string, unknown>): Record<string, unknown> {
  if (!("modo" in e) || "pagarAhora" in e) return e;
  const tarifa = e.modo === "tarifa";
  return {
    pagarAhora: tarifa,
    pagarAlRecibir: !tarifa,
    centro: e.rm,
    alejada: e.rm,
    cercana: e.regiones,
    extrema: e.extremas,
    gratisDesde: e.gratisDesde ?? null,
  };
}

/** Valida lo que llega del panel (o lo que dejó el sitio como inicial). */
export function validarTarifas(entrada: unknown): ResultadoTarifas {
  const crudo = (entrada && typeof entrada === "object" ? entrada : {}) as Record<string, unknown>;
  const e: Record<string, unknown> = { ...TARIFAS_POR_DEFECTO, ...desdeVersionAnterior(crudo) };
  const errores: Record<string, string> = {};
  if (typeof e.pagarAhora !== "boolean") errores.pagarAhora = "Indica si se cobra el despacho según la zona.";
  const pagarAhora = e.pagarAhora === true;
  const monto = (campo: ZonaDespacho) => {
    const v = e[campo];
    if (typeof v !== "number" || !Number.isInteger(v) || v < 0 || v > MAXIMO_TARIFA) {
      errores[campo] = `Escribe un monto entre $0 y ${formatearPrecio(MAXIMO_TARIFA)}, sin decimales.`;
      return 0;
    }
    return v;
  };
  const centro = monto("centro");
  const alejada = monto("alejada");
  const cercana = monto("cercana");
  const extrema = monto("extrema");
  const lista = (campo: string, validas: readonly string[]) => {
    const v = e[campo];
    if (!Array.isArray(v) || v.some((x) => typeof x !== "string" || !validas.includes(x))) {
      errores[campo] = "La lista trae algo que no corresponde. Recarga la página e intenta de nuevo.";
      return [];
    }
    return [...new Set(v as string[])];
  };
  const comunasCentro = lista("comunasCentro", COMUNAS_RM);
  const regionesCercanas = lista("regionesCercanas", REGIONES_FUERA_RM);
  let gratisDesde: number | null = null;
  if (e.gratisDesde !== null && e.gratisDesde !== undefined && e.gratisDesde !== "") {
    const v = e.gratisDesde;
    if (typeof v !== "number" || !Number.isInteger(v) || v < 1000 || v > MAXIMO_GRATIS_DESDE) {
      errores.gratisDesde = "El monto para despacho gratis va desde $1.000, sin decimales. Déjalo vacío si no lo usas.";
    } else gratisDesde = v;
  }
  // Lo guardado antes de esta opción no la trae: sigue mostrando valores, como antes.
  if (e.mostrarValores !== undefined && typeof e.mostrarValores !== "boolean") {
    errores.mostrarValores = "Indica si se muestran los valores del despacho en la tienda.";
  }
  const mostrarValores = e.mostrarValores !== false;
  // Lo guardado antes de esta opción no la trae: pagar al recibir en todas las zonas, como antes.
  let alRecibirZonas: ZonaDespacho[] = [...IDS_ZONAS];
  if (crudo.alRecibirZonas !== undefined) {
    const v = crudo.alRecibirZonas;
    if (!Array.isArray(v) || v.some((x) => !IDS_ZONAS.includes(x as ZonaDespacho))) {
      errores.alRecibirZonas = "Las zonas para pagar al recibir no son válidas. Recarga la página e intenta de nuevo.";
    } else alRecibirZonas = IDS_ZONAS.filter((z) => (v as string[]).includes(z));
  }
  const pagarAlRecibir = !pagarAhora || alRecibirZonas.length > 0;
  const retiro = validarRetiro(crudo.retiro, errores);
  if (Object.keys(errores).length) return { ok: false, mensaje: "Revisa los campos marcados.", errores };
  return {
    ok: true,
    datos: { pagarAhora, pagarAlRecibir, alRecibirZonas, retiro, centro, alejada, cercana, extrema, comunasCentro, regionesCercanas, gratisDesde, mostrarValores },
  };
}

function validarRetiro(entrada: unknown, errores: Record<string, string>): RetiroDespacho {
  if (entrada === undefined || entrada === null) return { ...RETIRO_POR_DEFECTO };
  if (typeof entrada !== "object" || Array.isArray(entrada)) {
    errores.retiro = "Los datos del retiro no son válidos.";
    return { ...RETIRO_POR_DEFECTO };
  }
  const e = { ...RETIRO_POR_DEFECTO, ...(entrada as Record<string, unknown>) };
  const texto = (campo: "comuna" | "direccion" | "instrucciones", max: number): string => {
    const v = e[campo];
    if (typeof v !== "string") {
      errores[`retiro.${campo}`] = "Ese dato del retiro no es válido.";
      return "";
    }
    const limpio = normalizeInput(v).replace(/\s+/g, " ").trim();
    if (limpio.length > max) errores[`retiro.${campo}`] = `Máximo ${max} caracteres.`;
    return limpio.slice(0, max);
  };
  if (typeof e.activo !== "boolean") errores["retiro.activo"] = "Indica si ofreces retiro.";
  if (typeof e.direccionSoloEnCorreo !== "boolean") errores["retiro.direccionSoloEnCorreo"] = "Indica dónde se muestra la dirección.";
  if (!NOMBRES_RETIRO.includes(e.nombre as NombreRetiro)) errores["retiro.nombre"] = "Elige un nombre para el retiro de la lista.";
  const r: RetiroDespacho = {
    activo: e.activo === true,
    nombre: NOMBRES_RETIRO.includes(e.nombre as NombreRetiro) ? (e.nombre as NombreRetiro) : RETIRO_POR_DEFECTO.nombre,
    comuna: texto("comuna", 60),
    direccion: texto("direccion", 140),
    instrucciones: texto("instrucciones", 300),
    direccionSoloEnCorreo: e.direccionSoloEnCorreo !== false,
  };
  if (r.activo) {
    if (r.comuna.length < 2) errores["retiro.comuna"] = "Escribe la comuna donde se retira (se ve en la tienda).";
    if (r.direccion.length < 5) errores["retiro.direccion"] = "Escribe la dirección o el punto exacto del retiro (va en el correo de confirmación).";
  }
  return r;
}
