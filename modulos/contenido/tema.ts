/**
 * El "tema" (colores y tipografías) como CSS de variables. Solo salen
 * colores con formato #rrggbb y familias de la lista cerrada: nada escrito
 * por una persona llega al CSS tal cual.
 */
import { esColor } from "./color";
import { fuentePorId } from "./fuentes";
import type { Esquema, Valores } from "./tipos";

const VARIABLE = /^--[a-z0-9-]{1,40}$/;

export function variablesTema(
  esquema: Esquema,
  valores: Valores,
  derivar?: (valores: Valores) => Record<string, string>
): Record<string, string> {
  const salida: Record<string, string> = {};
  for (const c of esquema.campos) {
    if (!c.variable || !VARIABLE.test(c.variable)) continue;
    const v = valores[c.clave];
    if (c.tipo === "color" && esColor(v)) salida[c.variable] = v.toLowerCase();
    if (c.tipo === "fuente") {
      const f = v ? fuentePorId(v) : undefined;
      if (f) salida[c.variable] = f.familia;
    }
  }
  if (derivar) {
    for (const [k, v] of Object.entries(derivar(valores))) {
      // Los derivados también pasan el filtro: solo colores válidos.
      if (VARIABLE.test(k) && esColor(v)) salida[k] = v.toLowerCase();
    }
  }
  return salida;
}

export function cssTema(variables: Record<string, string>): string {
  const lineas = Object.entries(variables).map(([k, v]) => `  ${k}: ${v};`);
  return lineas.length ? `:root {\n${lineas.join("\n")}\n}\n` : "/* sin cambios */\n";
}
