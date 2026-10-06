/**
 * Colores: formato cerrado (#rrggbb), contraste WCAG y derivados (versión
 * más oscura o más clara de un color). Funciones puras: las usan el
 * servidor (validar y armar el CSS) y el panel (avisos en vivo).
 */
const HEX = /^#[0-9a-fA-F]{6}$/;

export function esColor(v: unknown): v is string {
  return typeof v === "string" && HEX.test(v);
}

function rgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function hex([r, g, b]: number[]): string {
  return "#" + [r, g, b].map((x) => Math.round(Math.min(255, Math.max(0, x))).toString(16).padStart(2, "0")).join("");
}

/** Luminancia relativa (WCAG 2). */
export function luminancia(color: string): number {
  return rgb(color)
    .map((c) => {
      const s = c / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    })
    .reduce((acc, v, i) => acc + v * [0.2126, 0.7152, 0.0722][i], 0);
}

/** Contraste entre dos colores (1 a 21). */
export function contraste(a: string, b: string): number {
  const [x, y] = [luminancia(a), luminancia(b)].sort((m, n) => n - m);
  return Math.round(((x + 0.05) / (y + 0.05)) * 100) / 100;
}

/** Mezcla dos colores: t = 0 → a, t = 1 → b. */
export function mezclar(a: string, b: string, t: number): string {
  const [ra, ga, ba] = rgb(a);
  const [rb, gb, bb] = rgb(b);
  return hex([ra + (rb - ra) * t, ga + (gb - ga) * t, ba + (bb - ba) * t]);
}

export const oscurecer = (c: string, t: number) => mezclar(c, "#000000", t);
export const aclarar = (c: string, t: number) => mezclar(c, "#ffffff", t);

/**
 * Oscurece un color lo justo para alcanzar un contraste mínimo contra el
 * fondo. Sirve para corregir un acento demasiado claro sin cambiar su tono.
 */
export function ajustarContraste(color: string, fondo: string, minimo: number): string {
  if (contraste(color, fondo) >= minimo) return color;
  const haciaNegro = luminancia(fondo) > 0.4;
  for (let t = 0.05; t <= 1; t += 0.05) {
    const c = haciaNegro ? oscurecer(color, t) : aclarar(color, t);
    if (contraste(c, fondo) >= minimo) return c;
  }
  return haciaNegro ? "#000000" : "#ffffff";
}

/** Una revisión de contraste: "este texto sobre este fondo". */
export interface ParContraste {
  texto: string;
  fondo: string;
  /** 4.5 para texto normal, 3 para texto grande o elementos gráficos. */
  minimo: number;
  descripcion: string;
}

/**
 * Revisa pares de contraste. En cada par, `texto` y `fondo` pueden ser un
 * color fijo ("#ffffff") o la clave de un campo ("colores.acento").
 */
export function revisarContraste(
  pares: ParContraste[],
  valores: Record<string, string>
): { campos: string[]; mensaje: string; contraste: number; minimo: number }[] {
  const resolver = (x: string) => (esColor(x) ? x : valores[x]);
  const avisos = [];
  for (const p of pares) {
    const t = resolver(p.texto);
    const f = resolver(p.fondo);
    if (!esColor(t) || !esColor(f)) continue;
    const c = contraste(t, f);
    if (c < p.minimo) {
      avisos.push({
        campos: [p.texto, p.fondo].filter((x) => !esColor(x)),
        mensaje: `${p.descripcion}: contraste ${c.toFixed(1)}:1 (mínimo ${p.minimo}:1). Se va a leer con dificultad.`,
        contraste: c,
        minimo: p.minimo,
      });
    }
  }
  return avisos;
}
