/**
 * Textos del stock para el panel ("2 disponibles", "1 vendido"). Funciones
 * puras, sin DOM: las usa la pantalla del panel y se prueban aparte.
 *
 * "Vendidos" cuenta desde el último ajuste de stock: al cambiar el número
 * de disponibles en el panel, el contador vuelve a 0 (ver productos.ts).
 */

export interface TextoStock {
  /** "Sin límite", "Agotado", "1 disponible", "5 disponibles". */
  disponible: string;
  /** true cuando está agotado (para pintarlo de alerta). */
  agotado: boolean;
  /** "1 vendido", "3 vendidos", o "" si no hay ventas o no se cuentan. */
  vendidos: string;
}

function plural(n: number, uno: string, varios: string): string {
  return `${n} ${n === 1 ? uno : varios}`;
}

function entero(n: number | null | undefined): number | null {
  return typeof n === "number" && Number.isFinite(n) && n >= 0 ? Math.floor(n) : null;
}

export function textoStock(disponible: number | null | undefined, vendidos: number | null | undefined): TextoStock {
  const d = entero(disponible);
  const v = entero(vendidos);
  if (d === null) return { disponible: "Sin límite", agotado: false, vendidos: "" };
  return {
    disponible: d === 0 ? "Agotado" : plural(d, "disponible", "disponibles"),
    agotado: d === 0,
    vendidos: v ? plural(v, "vendido", "vendidos") : "",
  };
}

/** Ayuda bajo el campo "Disponible" del editor. "" si no aplica. */
export function ayudaVendidos(disponible: number | null | undefined, vendidos: number | null | undefined): string {
  if (entero(disponible) === null) return "";
  const v = entero(vendidos) ?? 0;
  return `Vendidos desde el último ajuste: ${v}. Si cambias "Disponible", este contador vuelve a 0.`;
}
