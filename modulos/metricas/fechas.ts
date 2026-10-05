/** Zona horaria por defecto: Chile continental. */
export const ZONA_POR_DEFECTO = "America/Santiago";

/** "AAAA-MM-DD" de una fecha, en la zona indicada. */
export function diaLocal(fecha: Date | string, zona = ZONA_POR_DEFECTO): string {
  const d = typeof fecha === "string" ? new Date(fecha) : fecha;
  if (Number.isNaN(d.getTime())) return "";
  // en-CA da el formato AAAA-MM-DD.
  return new Intl.DateTimeFormat("en-CA", { timeZone: zona, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

/** Resta días a un "AAAA-MM-DD" (aritmética de calendario, sin horas). */
export function restarDias(dia: string, n: number): string {
  const [a, m, d] = dia.split("-").map(Number);
  const t = Date.UTC(a, m - 1, d) - n * 86400000;
  return new Date(t).toISOString().slice(0, 10);
}

/** Los últimos `n` días terminando en `hoy`, del más antiguo al más nuevo. */
export function ultimosDias(hoy: string, n: number): string[] {
  return Array.from({ length: n }, (_, i) => restarDias(hoy, n - 1 - i));
}
