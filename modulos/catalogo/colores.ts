/**
 * COLORES (o modelos) DE UN PRODUCTO, cada uno con su foto y su stock.
 *
 * Cómo viaja un color: el id de la línea del carrito es
 * `<producto>~<color>` (ej. `lana-peluche-wenzo~azul-rey`). Así el carrito,
 * el pago, los pedidos y el stock usan el MISMO camino de siempre: el
 * servidor reconstruye precio, nombre y stock desde el catálogo para ese
 * id compuesto, y un color inventado o agotado se rechaza igual que un
 * producto inexistente o agotado.
 *
 * Un producto CON colores no se puede comprar "a secas": hay que elegir
 * color (la ficha lo pide; el carrito rechaza el id base).
 */
import type { ProductoCatalogo } from "./tipos";

export const SEPARADOR_COLOR = "~";
/** Colores por producto. */
export const MAXIMO_COLORES = 100;
export const ID_COLOR = /^[a-z0-9][a-z0-9-]{0,39}$/;
const RUTA_FOTO = /^\/(media|img)\/[a-zA-Z0-9/_.-]{1,150}$/;

export interface ColorProducto {
  /** Se crea una vez desde el nombre y no cambia (va en carritos y pedidos). */
  id: string;
  nombre: string;
  /** Foto grande de ese color. */
  foto?: string;
  /** Miniatura cuadrada (la genera el panel al subir la foto). Sin ella se usa la foto. */
  mini?: string;
  /** Stock de ese color. Sin stock = sin límite. */
  stock?: number;
}

export type TituloColores = "Color" | "Modelo";

/** `lana~azul` → { base: "lana", color: "azul" }; `lana` → { base: "lana" }. */
export function partirId(id: string): { base: string; color?: string } {
  const i = id.indexOf(SEPARADOR_COLOR);
  if (i < 0) return { base: id };
  return { base: id.slice(0, i), color: id.slice(i + 1) };
}

/** Id del producto sin el color (lo que usan las páginas para tipo, categoría, etc.). */
export function idBase(id: string): string {
  return partirId(id).base;
}

export function idConColor(base: string, color: string): string {
  return `${base}${SEPARADOR_COLOR}${color}`;
}

export function tieneColores(p: Pick<ProductoCatalogo, "colores">): boolean {
  return Array.isArray(p.colores) && p.colores.length > 0;
}

/** "Azul Rey (claro)" → "azul-rey-claro", sin repetir los ya usados. */
export function idColorDesdeNombre(nombre: string, usados: Set<string>): string {
  const base =
    nombre
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 36)
      .replace(/-+$/g, "") || "color";
  let id = base;
  for (let n = 2; usados.has(id); n++) id = `${base}-${n}`;
  return id;
}

/** null si está bien; si no, el motivo (para el error de validación del catálogo). */
export function problemaColores(p: Pick<ProductoCatalogo, "colores" | "tituloColores" | "enfoqueColores">): string | null {
  if (p.tituloColores !== undefined && p.tituloColores !== "Color" && p.tituloColores !== "Modelo") return "título de colores inválido";
  if (p.enfoqueColores !== undefined) {
    const e = p.enfoqueColores as { x?: unknown; y?: unknown };
    const ok = (v: unknown) => typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 100;
    if (!e || !ok(e.x) || !ok(e.y)) return "enfoque de miniaturas inválido";
  }
  if (p.colores === undefined) return null;
  if (!Array.isArray(p.colores) || p.colores.length > MAXIMO_COLORES) return `máximo ${MAXIMO_COLORES} colores`;
  const ids = new Set<string>();
  for (const c of p.colores) {
    if (!c || typeof c !== "object") return "color inválido";
    if (typeof c.id !== "string" || !ID_COLOR.test(c.id)) return `id de color inválido: "${String(c.id)}"`;
    if (ids.has(c.id)) return `color repetido: "${c.id}"`;
    ids.add(c.id);
    if (typeof c.nombre !== "string" || !c.nombre.trim() || c.nombre.length > 40) return `el color "${c.id}" no tiene un nombre válido`;
    for (const f of [c.foto, c.mini]) {
      if (f !== undefined && (typeof f !== "string" || !RUTA_FOTO.test(f) || f.includes(".."))) return `el color "${c.id}" tiene una foto inválida`;
    }
    if (c.stock !== undefined && (!Number.isInteger(c.stock) || c.stock < 0)) return `el color "${c.id}" tiene un stock inválido`;
  }
  return null;
}

/**
 * Foto que representa al producto en listas, carrito y redes: la suya, o
 * la del primer color si solo se le cargaron colores.
 */
export function imagenPrincipal(p: Pick<ProductoCatalogo, "imagen" | "colores">): string | undefined {
  return p.imagen ?? p.colores?.[0]?.foto ?? p.colores?.[0]?.mini;
}

export function buscarColor(p: Pick<ProductoCatalogo, "colores">, color: string): ColorProducto | undefined {
  return p.colores?.find((c) => c.id === color);
}
