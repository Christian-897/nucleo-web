/**
 * Formato de precios. Por defecto pesos chilenos enteros: $12.345.
 * Se usa tanto en el cliente como al mostrar resúmenes.
 */
export function formatearPrecio(valor: number, moneda = "CLP"): string {
  const n = Math.round(Number(valor) || 0);
  try {
    return new Intl.NumberFormat("es-CL", {
      style: "currency",
      currency: moneda,
      maximumFractionDigits: 0,
    }).format(n);
  } catch {
    // Respaldo si Intl no tiene la moneda: separador de miles con punto.
    return "$" + n.toLocaleString("es-CL");
  }
}
