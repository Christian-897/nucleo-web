/**
 * Montos escritos por una persona: "154.700", "$154.700", "154 700" o
 * "154700" → 154700. Sin decimales (pesos chilenos). Se usa igual en el
 * navegador y en el servidor. Devuelve null si no es un monto entero válido.
 */
export function leerMonto(valor: unknown): number | null {
  if (typeof valor === "number") return Number.isSafeInteger(valor) && valor > 0 ? valor : null;
  if (typeof valor !== "string") return null;
  const limpio = valor.trim().replace(/^\$\s*/, "").replace(/[.\s]/g, "");
  if (!/^\d{1,10}$/.test(limpio)) return null;
  const n = Number(limpio);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

/** 154700 → "$154.700". */
export function formatearMonto(n: number): string {
  return "$" + Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}
