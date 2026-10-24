/**
 * OPCIONES DE UN PRODUCTO (v0.40): una segunda elección además del color,
 * por ejemplo el TAMAÑO (Mini · Mediano · XL) o el MATERIAL. Pensado para el
 * peor caso:
 *
 *  - cada opción puede tener SU PRECIO (si no, el del producto);
 *  - cada opción puede venir solo en ALGUNOS colores;
 *  - las unidades van por COMBINACIÓN: «quedan 3 XL en verde agua» y
 *    «ya no quedan Mini en verde agua» son independientes.
 *
 * Cómo viaja: el id de la línea del carrito es `prod~color~opcion`
 * (`scrunchie~verde-agua~xl`), o `prod~~opcion` si el producto no tiene
 * colores. El servidor arma ese "producto" desde el catálogo (nombre
 * «Producto · XL · Verde agua», precio de la opción, stock de la
 * combinación), así que carrito, pago, pedidos, anular y métricas usan el
 * mismo camino validado. Un producto con opciones no se vende sin elegir una.
 */
import type { ProductoCatalogo } from "./tipos";

/** Opciones por producto. */
export const MAXIMO_OPCIONES = 12;
export const ID_OPCION = /^[a-z0-9][a-z0-9-]{0,39}$/;
export const LARGO_TITULO_OPCIONES = 20;

export interface OpcionProducto {
  /** Se crea una vez desde el nombre y no cambia (va en carritos y pedidos). */
  id: string;
  nombre: string;
  /** Precio de esta opción (pesos enteros). Sin precio = el del producto. */
  precio?: number;
  /** Colores (ids) en que viene. Sin la lista = en todos los colores del producto. */
  colores?: string[];
  /** Unidades de esta opción, si el producto NO tiene colores. Sin stock = sin límite. */
  stock?: number;
  /** Unidades por color de esta opción (id de color → unidades). Un color sin número = sin límite. */
  stockColores?: Record<string, number>;
}

export function tieneOpciones(p: Pick<ProductoCatalogo, "opciones">): boolean {
  return Array.isArray(p.opciones) && p.opciones.length > 0;
}

export function buscarOpcion(p: Pick<ProductoCatalogo, "opciones">, id: string): OpcionProducto | undefined {
  return p.opciones?.find((o) => o.id === id);
}

/** ¿Esta opción viene en ese color? */
export function colorEnOpcion(o: OpcionProducto, color: string): boolean {
  return !o.colores || o.colores.includes(color);
}

export function precioDeOpcion(p: Pick<ProductoCatalogo, "precio">, o: OpcionProducto | undefined): number {
  return o && typeof o.precio === "number" ? o.precio : p.precio;
}

/** Precio más bajo y más alto del producto (para «Desde $X» en las listas). */
export function rangoDePrecios(p: Pick<ProductoCatalogo, "precio" | "opciones">): { min: number; max: number } {
  if (!tieneOpciones(p)) return { min: p.precio, max: p.precio };
  const precios = p.opciones!.map((o) => precioDeOpcion(p, o));
  return { min: Math.min(...precios), max: Math.max(...precios) };
}

/** "Mediano (12 cm)" → "mediano-12-cm", sin repetir los ya usados. */
export function idOpcionDesdeNombre(nombre: string, usados: Set<string>): string {
  const base =
    nombre
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 36)
      .replace(/-+$/g, "") || "opcion";
  let id = base;
  for (let n = 2; usados.has(id); n++) id = `${base}-${n}`;
  return id;
}

const entero = (v: unknown, min = 0) => typeof v === "number" && Number.isInteger(v) && v >= min;

/** null si está bien; si no, el motivo (para el error de validación del catálogo). */
export function problemaOpciones(p: Pick<ProductoCatalogo, "opciones" | "tituloOpciones" | "colores">): string | null {
  if (p.tituloOpciones !== undefined && (typeof p.tituloOpciones !== "string" || !p.tituloOpciones.trim() || p.tituloOpciones.length > LARGO_TITULO_OPCIONES)) {
    return "título de opciones inválido";
  }
  if (p.opciones === undefined) return null;
  if (!Array.isArray(p.opciones) || p.opciones.length > MAXIMO_OPCIONES) return `máximo ${MAXIMO_OPCIONES} opciones`;
  const colores = new Set((p.colores ?? []).map((c) => c.id));
  const ids = new Set<string>();
  for (const o of p.opciones) {
    if (!o || typeof o !== "object") return "opción inválida";
    if (typeof o.id !== "string" || !ID_OPCION.test(o.id)) return `id de opción inválido: "${String(o.id)}"`;
    if (ids.has(o.id)) return `opción repetida: "${o.id}"`;
    ids.add(o.id);
    if (typeof o.nombre !== "string" || !o.nombre.trim() || o.nombre.length > 40) return `la opción "${o.id}" no tiene un nombre válido`;
    if (o.precio !== undefined && !entero(o.precio, 1)) return `la opción "${o.id}" tiene un precio inválido`;
    if (o.stock !== undefined && !entero(o.stock)) return `la opción "${o.id}" tiene un stock inválido`;
    if (o.colores !== undefined) {
      if (!Array.isArray(o.colores) || o.colores.some((c) => typeof c !== "string" || !colores.has(c))) return `la opción "${o.id}" nombra un color que el producto no tiene`;
      if (!o.colores.length) return `la opción "${o.id}" no viene en ningún color`;
    }
    if (o.stockColores !== undefined) {
      if (!o.stockColores || typeof o.stockColores !== "object" || Array.isArray(o.stockColores)) return `la opción "${o.id}" tiene unidades por color inválidas`;
      for (const [c, n] of Object.entries(o.stockColores)) {
        if (!colores.has(c) || !entero(n)) return `la opción "${o.id}" tiene unidades inválidas para "${c}"`;
      }
    }
  }
  return null;
}
