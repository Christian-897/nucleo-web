/**
 * Gráficos de la pestaña Resumen. SVG armado con DOM (nada de innerHTML ni
 * estilos en línea: cumple la CSP del panel; la posición del tooltip usa
 * CSSOM, que la CSP sí permite).
 *
 *  - graficoTiempo:       una serie en el tiempo, en barras o línea.
 *  - graficoComparacion:  dos años mes a mes, en barras lado a lado o dos líneas.
 *  - graficoPartes:       partes de un total (más vendidos, medios de pago),
 *                         en lista, barras horizontales o torta.
 *
 * Reglas: barras finas con la punta redondeada, líneas de 2px, rejilla tenue,
 * tooltip al pasar el mouse o tocar, leyenda cuando hay más de una serie y
 * los colores en orden fijo (nunca un color generado).
 */
import type { Resumen } from "../../metricas/tipos";
import type { ReporteRango } from "../../metricas/rango";

export type ResumenPanel = Resumen & { porDespachar: number; message?: string };
export type RangoPanel = ReporteRango & { message?: string };
export type TipoTiempo = "barras" | "linea";
export type TipoPartes = "lista" | "barras" | "torta";

const NS = "http://www.w3.org/2000/svg";
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
export const NOMBRES_MES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
/**
 * Colores de las partes, en orden fijo (variables CSS: cada sitio pone su
 * paleta con `coloresGraficos`). Más de 5 se juntan en "Otros".
 */
export const COLORES_PARTES = [1, 2, 3, 4, 5].map((n) => `var(--pa-serie-${n})`);
const COLOR_OTROS = "#8b8a86";

type Precio = (n: number) => string;

function svg<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>, clase?: string) {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  if (clase) el.setAttribute("class", clase);
  return el;
}
function html<K extends keyof HTMLElementTagNameMap>(tag: K, clase?: string, texto?: string) {
  const el = document.createElement(tag);
  if (clase) el.className = clase;
  if (texto !== undefined) el.textContent = texto;
  return el;
}

export function diaCorto(dia: string): string {
  const [, m, d] = dia.split("-").map(Number);
  return `${d} ${MESES[m - 1] ?? ""}`;
}

/** "▲ 12% vs. 7 días anteriores", etc. */
export function textoVariacion(v: number | null, base = "7 días anteriores"): string {
  if (v === null) return `sin datos de ${base} para comparar`;
  if (v === 0) return `igual que ${base}`;
  return `${v > 0 ? "▲" : "▼"} ${Math.abs(v)}% vs. ${base}`;
}

/** Variación en % entre dos montos, o null si el anterior es 0. */
export function variacion(actual: number, anterior: number): number | null {
  return anterior ? Math.round(((actual - anterior) / anterior) * 100) : null;
}

/** Tope "redondo" del eje: 1, 2 o 5 por potencia de 10. */
export function topeEje(max: number): number {
  if (max <= 0) return 10000;
  const p = 10 ** Math.floor(Math.log10(max));
  for (const f of [1, 2, 5, 10]) if (f * p >= max) return f * p;
  return 10 * p;
}

/** Ventas de los 12 meses de un año (0 donde no hay datos). */
export function ventasDelAnio(meses: Resumen["anual"]["meses"], anio: number): { ventas: number; pedidos: number }[] {
  return NOMBRES_MES.map((_, i) => meses[`${anio}-${String(i + 1).padStart(2, "0")}`] ?? { ventas: 0, pedidos: 0 });
}

/** Junta lo que pasa de 5 en "Otros" (los colores no se inventan). */
export function agruparPartes<T extends { nombre: string; valor: number }>(items: T[]): { nombre: string; valor: number; detalle: string; otros: boolean }[] {
  const conValor = items.filter((x) => x.valor > 0);
  const primeros = conValor.slice(0, 5).map((x) => ({ nombre: x.nombre, valor: x.valor, detalle: (x as { detalle?: string }).detalle ?? "", otros: false }));
  const resto = conValor.slice(5);
  if (resto.length) {
    primeros.push({ nombre: `Otros (${resto.length})`, valor: resto.reduce((s, x) => s + x.valor, 0), detalle: "", otros: true });
  }
  return primeros;
}

/** Barra con la punta superior redondeada (radio 4) y base plana. */
function barraVertical(x: number, y: number, w: number, h: number): string {
  const r = Math.min(4, w / 2, h);
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}

// ─────────────────────────── base de los gráficos de tiempo ───────────────────────────

interface Lienzo {
  W: number;
  H: number;
  izq: number;
  arriba: number;
  alto: number;
  paso: number;
  y: (v: number) => number;
  hijos: SVGElement[];
}

function prepararLienzo(lienzo: SVGSVGElement, n: number, maximo: number, precio: Precio, etiquetas: string[]): Lienzo {
  const W = Math.max(280, Math.round(lienzo.getBoundingClientRect().width) || 640);
  const H = 200, izq = 64, der = 12, arriba = 10, abajo = 24;
  lienzo.setAttribute("viewBox", `0 0 ${W} ${H}`);
  const ancho = W - izq - der, alto = H - arriba - abajo;
  const tope = topeEje(maximo);
  const paso = ancho / Math.max(1, n);
  const hijos: SVGElement[] = [];
  for (const f of [0, 0.5, 1]) {
    const y = arriba + alto - f * alto;
    hijos.push(svg("line", { x1: izq, x2: W - der, y1: y, y2: y }, "rejilla"));
    const t = svg("text", { x: izq - 8, y: y + 4, "text-anchor": "end" }, "eje");
    t.textContent = precio(tope * f);
    hijos.push(t);
  }
  // Etiquetas del eje X: como máximo una cada ~70px, contando desde la última.
  const cada = Math.max(1, Math.ceil(70 / paso));
  etiquetas.forEach((et, i) => {
    if ((n - 1 - i) % cada !== 0) return;
    const t = svg("text", { x: izq + paso * i + paso / 2, y: H - 6, "text-anchor": "middle" }, "eje");
    t.textContent = et;
    hijos.push(t);
  });
  return { W, H, izq, arriba, alto, paso, y: (v) => arriba + alto - (v / tope) * alto, hijos };
}

function zonasTooltip(
  lienzo: SVGSVGElement,
  base: Lienzo,
  n: number,
  tooltip: HTMLElement,
  contenido: (i: number) => (string | Node)[],
  resaltar: (i: number | null) => void
) {
  for (let i = 0; i < n; i++) {
    const z = svg("rect", { x: base.izq + base.paso * i, y: base.arriba, width: base.paso, height: base.alto }, "zona");
    const mostrar = () => {
      resaltar(i);
      tooltip.replaceChildren(...contenido(i));
      const caja = lienzo.getBoundingClientRect();
      const x = ((base.izq + base.paso * i + base.paso / 2) / base.W) * caja.width;
      tooltip.style.left = `${Math.min(Math.max(x, 70), caja.width - 70)}px`;
      tooltip.hidden = false;
    };
    z.addEventListener("pointerenter", mostrar);
    z.addEventListener("pointerdown", mostrar);
    z.addEventListener("pointerleave", () => {
      resaltar(null);
      tooltip.hidden = true;
    });
    base.hijos.push(z);
  }
}

/** Línea de 2px; `null` = sin dato (por ejemplo, meses que aún no pasan): corta la línea. */
function lineaDe(base: Lienzo, valores: (number | null)[], clase: string): SVGElement[] {
  const puntos = valores.map((v, i) => (v === null ? null : ([base.izq + base.paso * i + base.paso / 2, base.y(v)] as const)));
  let d = "";
  puntos.forEach((p, i) => {
    if (!p) return;
    d += `${i && puntos[i - 1] ? "L" : "M"}${p[0].toFixed(1)},${p[1].toFixed(1)}`;
  });
  const salida: SVGElement[] = [svg("path", { d, fill: "none" }, `linea ${clase}`)];
  // Marcadores solo si hay espacio (al menos 14px por punto); si no, ensucian.
  if (base.paso >= 14) {
    for (const p of puntos) if (p) salida.push(svg("circle", { cx: p[0], cy: p[1], r: 4 }, `punto ${clase}`));
  }
  return salida;
}

// ─────────────────────────── una serie en el tiempo ───────────────────────────

export function graficoTiempo(
  lienzo: SVGSVGElement,
  tooltip: HTMLElement,
  puntos: { etiqueta: string; detalle: string; ventas: number; pedidos: number }[],
  tipo: TipoTiempo,
  precio: Precio,
  /** Para usar el mismo gráfico con otra cosa que ventas (ej. visitas). */
  textos?: { segunda?: (i: number) => string; resumen?: (total: string) => string }
) {
  const n = puntos.length;
  const base = prepararLienzo(lienzo, n, Math.max(0, ...puntos.map((p) => p.ventas)), precio, puntos.map((p) => p.etiqueta));
  const marcas: SVGElement[] = [];
  if (tipo === "linea") {
    const l = lineaDe(base, puntos.map((p) => p.ventas), "serie-a");
    marcas.push(...l);
    base.hijos.push(...l);
  } else {
    const ancho = Math.max(2, Math.min(18, base.paso * 0.6));
    puntos.forEach((p, i) => {
      const cx = base.izq + base.paso * i + base.paso / 2;
      const h = p.ventas > 0 ? Math.max(2, base.arriba + base.alto - base.y(p.ventas)) : 0;
      const b = svg("path", { d: h ? barraVertical(cx - ancho / 2, base.arriba + base.alto - h, ancho, h) : "" }, "barra");
      marcas.push(b);
      base.hijos.push(b);
    });
  }
  const guia = svg("line", { x1: 0, x2: 0, y1: base.arriba, y2: base.arriba + base.alto }, "guia");
  guia.setAttribute("visibility", "hidden");
  base.hijos.push(guia);
  zonasTooltip(
    lienzo,
    base,
    n,
    tooltip,
    (i) => {
      const t = html("strong", "", precio(puntos[i].ventas));
      return [t, textos?.segunda ? `${puntos[i].detalle} · ${textos.segunda(i)}` : `${puntos[i].detalle} · ${puntos[i].pedidos} ${puntos[i].pedidos === 1 ? "pedido" : "pedidos"}`];
    },
    (i) => {
      if (tipo === "barras") marcas.forEach((m, j) => m.classList.toggle("barra--activa", j === i));
      if (i === null) return guia.setAttribute("visibility", "hidden");
      const x = base.izq + base.paso * i + base.paso / 2;
      guia.setAttribute("x1", String(x));
      guia.setAttribute("x2", String(x));
      guia.setAttribute("visibility", tipo === "linea" ? "visible" : "hidden");
    }
  );
  lienzo.replaceChildren(...base.hijos);
  const total = puntos.reduce((s, p) => s + p.ventas, 0);
  lienzo.setAttribute("aria-label", textos?.resumen ? textos.resumen(precio(total)) : `Ventas en el período: ${precio(total)} en total. El detalle está en "Ver como tabla".`);
}

// ─────────────────────────── dos años, mes a mes ───────────────────────────

export function graficoComparacion(
  lienzo: SVGSVGElement,
  tooltip: HTMLElement,
  anioA: number,
  a: { ventas: number; pedidos: number }[],
  anioB: number,
  b: { ventas: number; pedidos: number }[],
  tipo: TipoTiempo,
  precio: Precio,
  /** Mes que todavía no termina (no se compara en %: estaría a medias). */
  enCurso?: { anio: number; mes: number }
) {
  const angosto = (lienzo.getBoundingClientRect().width || 640) < 480;
  const base = prepararLienzo(
    lienzo,
    12,
    Math.max(0, ...a.map((x) => x.ventas), ...b.map((x) => x.ventas)),
    precio,
    NOMBRES_MES.map((m, i) => (angosto && i % 2 ? "" : m))
  );
  const esEnCurso = (i: number) => !!enCurso && i === enCurso.mes - 1 && (anioA === enCurso.anio || anioB === enCurso.anio);
  // Los meses que todavía no llegan no son "cero ventas": no se dibujan.
  const futuro = (anio: number, i: number) => !!enCurso && (anio > enCurso.anio || (anio === enCurso.anio && i > enCurso.mes - 1));
  const grupos: SVGElement[][] = Array.from({ length: 12 }, () => []);

  if (tipo === "linea") {
    // El año B va primero (debajo) y el A encima, con anillo del color de fondo.
    base.hijos.push(
      ...lineaDe(base, b.map((x, i) => (futuro(anioB, i) ? null : x.ventas)), "serie-b"),
      ...lineaDe(base, a.map((x, i) => (futuro(anioA, i) ? null : x.ventas)), "serie-a")
    );
  } else {
    const ancho = Math.max(3, Math.min(12, base.paso * 0.3));
    for (let i = 0; i < 12; i++) {
      const cx = base.izq + base.paso * i + base.paso / 2;
      // 2px de separación entre las dos barras del mes.
      for (const [valor, x, clase] of [
        [b[i].ventas, cx - ancho - 1, "barra barra--b"],
        [a[i].ventas, cx + 1, "barra"],
      ] as [number, number, string][]) {
        const h = valor > 0 ? Math.max(2, base.arriba + base.alto - base.y(valor)) : 0;
        const el = svg("path", { d: h ? barraVertical(x, base.arriba + base.alto - h, ancho, h) : "" }, clase);
        grupos[i].push(el);
        base.hijos.push(el);
      }
    }
  }
  const guia = svg("line", { x1: 0, x2: 0, y1: base.arriba, y2: base.arriba + base.alto }, "guia");
  guia.setAttribute("visibility", "hidden");
  base.hijos.push(guia);

  zonasTooltip(
    lienzo,
    base,
    12,
    tooltip,
    (i) => {
      const v = esEnCurso(i) || futuro(anioA, i) || futuro(anioB, i) ? null : variacion(a[i].ventas, b[i].ventas);
      return [
        html("strong", "", esEnCurso(i) ? `${NOMBRES_MES[i]} (mes en curso)` : NOMBRES_MES[i]),
        `${anioA}: ${futuro(anioA, i) ? "aún no llega" : precio(a[i].ventas)}`,
        html("br"),
        `${anioB}: ${futuro(anioB, i) ? "aún no llega" : precio(b[i].ventas)}`,
        ...(v === null ? [] : [html("br"), `${v > 0 ? "▲" : v < 0 ? "▼" : "="} ${Math.abs(v)}%`]),
      ];
    },
    (i) => {
      grupos.forEach((g, j) => g.forEach((el) => el.classList.toggle("barra--tenue", i !== null && j !== i)));
      if (i === null) return guia.setAttribute("visibility", "hidden");
      const x = base.izq + base.paso * i + base.paso / 2;
      guia.setAttribute("x1", String(x));
      guia.setAttribute("x2", String(x));
      guia.setAttribute("visibility", tipo === "linea" ? "visible" : "hidden");
    }
  );
  lienzo.replaceChildren(...base.hijos);
  const total = (l: { ventas: number }[]) => l.reduce((s, x) => s + x.ventas, 0);
  lienzo.setAttribute("aria-label", `Ventas por mes: ${anioA} suma ${precio(total(a))} y ${anioB} suma ${precio(total(b))}. El detalle está en "Ver como tabla".`);
}

// ─────────────────────────── partes de un total ───────────────────────────

/** Arco de una porción de dona (ángulos en radianes, 0 = arriba). */
function arco(cx: number, cy: number, rExt: number, rInt: number, a0: number, a1: number): string {
  const p = (r: number, a: number) => [cx + r * Math.sin(a), cy - r * Math.cos(a)].map((v) => v.toFixed(2)).join(",");
  const grande = a1 - a0 > Math.PI ? 1 : 0;
  return `M${p(rExt, a0)}A${rExt},${rExt} 0 ${grande} 1 ${p(rExt, a1)}L${p(rInt, a1)}A${rInt},${rInt} 0 ${grande} 0 ${p(rInt, a0)}Z`;
}

/**
 * Más vendidos o medios de pago. `lista`: texto; `barras`: barras
 * horizontales con su valor; `torta`: dona con leyenda (nombre, % y valor),
 * así la identidad nunca depende solo del color.
 */
export function graficoPartes(
  contenedor: HTMLElement,
  items: { nombre: string; valor: number; detalle: string }[],
  tipo: TipoPartes,
  textoValor: (n: number) => string,
  vacio = "Todavía no hay ventas en este período."
) {
  if (!items.length || items.every((x) => x.valor <= 0)) {
    contenedor.replaceChildren(html("p", "pa-tenue", vacio));
    return;
  }
  if (tipo === "lista") {
    const ol = html("ol", "pa-ranking");
    for (const x of items) {
      const li = html("li");
      li.append(html("span", "", x.nombre), html("span", "", x.detalle));
      ol.append(li);
    }
    contenedor.replaceChildren(ol);
    return;
  }
  const partes = agruparPartes(items);
  const total = partes.reduce((s, x) => s + x.valor, 0);
  const color = (i: number, otros: boolean) => (otros ? COLOR_OTROS : COLORES_PARTES[i]);

  if (tipo === "barras") {
    const max = Math.max(...partes.map((x) => x.valor));
    const ul = html("ul", "pa-barras-h");
    partes.forEach((x, i) => {
      const li = html("li");
      const cabeza = html("div", "pa-barras-h__cabeza");
      cabeza.append(html("span", "", x.nombre), html("span", "pa-tenue", textoValor(x.valor)));
      const pista = html("div", "pa-barras-h__pista");
      const relleno = html("div", "pa-barras-h__relleno");
      relleno.style.width = `${Math.max(2, (x.valor / max) * 100)}%`;
      relleno.style.background = color(i, x.otros);
      pista.append(relleno);
      li.append(cabeza, pista);
      ul.append(li);
    });
    contenedor.replaceChildren(ul);
    return;
  }

  // Torta (dona): 2px de separación entre porciones con el color de fondo.
  const caja = html("div", "pa-torta");
  const s = svg("svg", { viewBox: "0 0 160 160", role: "img" });
  s.setAttribute("aria-label", partes.map((x) => `${x.nombre}: ${Math.round((x.valor / total) * 100)}%`).join(", "));
  let angulo = 0;
  partes.forEach((x, i) => {
    const fin = angulo + (x.valor / total) * Math.PI * 2;
    const el =
      partes.length === 1
        ? svg("circle", { cx: 80, cy: 80, r: 60, fill: "none", "stroke-width": 36 }, "torta-anillo")
        : svg("path", { d: arco(80, 80, 78, 42, angulo, fin) }, "torta-porcion");
    // Con CSSOM (style.*): admite var(--…) y lo permite la CSP del panel.
    if (partes.length === 1) el.style.stroke = color(i, x.otros);
    else el.style.fill = color(i, x.otros);
    s.append(el);
    angulo = fin;
  });
  const centro = svg("text", { x: 80, y: 86, "text-anchor": "middle" }, "torta-centro");
  centro.textContent = textoValor(total);
  s.append(centro);
  const leyenda = html("ul", "pa-torta__leyenda");
  partes.forEach((x, i) => {
    const li = html("li");
    const muestra = html("span", "pa-torta__muestra");
    muestra.style.background = color(i, x.otros);
    li.append(muestra, html("span", "", x.nombre), html("span", "pa-tenue", `${Math.round((x.valor / total) * 100)}% · ${textoValor(x.valor)}`));
    leyenda.append(li);
  });
  caja.append(s, leyenda);
  contenedor.replaceChildren(caja);
}

// ─────────────────────────── redibujar al cambiar el ancho ───────────────────────────

const redibujos = new Map<string, () => void>();
let espera: number | undefined;
let escuchando = false;
/** Dibuja y recuerda cómo volver a dibujar si cambia el ancho de la ventana. */
export function dibujarAdaptable(clave: string, dibujar: () => void) {
  if (!escuchando) {
    escuchando = true;
    window.addEventListener("resize", () => {
      clearTimeout(espera);
      espera = window.setTimeout(() => redibujos.forEach((f) => f()), 150);
    });
  }
  redibujos.set(clave, dibujar);
  dibujar();
}

/** Preferencia de tipo de gráfico (solo en este navegador; si falla, no pasa nada). */
export function preferencia<T extends string>(clave: string, permitidos: readonly T[], porDefecto: T): T {
  try {
    const v = localStorage.getItem(`pa-grafico-${clave}`) as T | null;
    return v && permitidos.includes(v) ? v : porDefecto;
  } catch {
    return porDefecto;
  }
}
export function guardarPreferencia(clave: string, valor: string) {
  try {
    localStorage.setItem(`pa-grafico-${clave}`, valor);
  } catch {
    /* modo privado o almacenamiento bloqueado */
  }
}
