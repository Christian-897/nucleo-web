/**
 * Catálogo a partir de una lista (JSON del sitio). Puro: sirve igual al
 * construir las páginas y en el servidor. Valida los datos al cargarlos,
 * para que un precio mal escrito en el JSON rompa la construcción y no
 * llegue a cobrarse.
 */
import type { Catalogo, CategoriaCatalogo, ProductoCatalogo } from "./tipos";

export const ID_VALIDO = /^[a-z0-9][a-z0-9-]{0,63}$/;
const PRECIO_MAXIMO = 100_000_000;

export class ErrorCatalogo extends Error {
  constructor(mensaje: string) {
    super(`[catálogo] ${mensaje}`);
    this.name = "ErrorCatalogo";
  }
}

export function validarCatalogo(
  productos: ProductoCatalogo[],
  categorias: CategoriaCatalogo[]
): void {
  const idsCategorias = new Set<string>();
  for (const c of categorias) {
    if (!ID_VALIDO.test(c.id)) throw new ErrorCatalogo(`id de categoría inválido: "${c.id}"`);
    if (idsCategorias.has(c.id)) throw new ErrorCatalogo(`categoría repetida: "${c.id}"`);
    if (!c.nombre?.trim()) throw new ErrorCatalogo(`la categoría "${c.id}" no tiene nombre`);
    idsCategorias.add(c.id);
  }
  const ids = new Set<string>();
  for (const p of productos) {
    if (!ID_VALIDO.test(p.id)) {
      throw new ErrorCatalogo(`id inválido: "${p.id}" (solo minúsculas, números y guiones)`);
    }
    if (ids.has(p.id)) throw new ErrorCatalogo(`producto repetido: "${p.id}"`);
    ids.add(p.id);
    if (!p.nombre?.trim()) throw new ErrorCatalogo(`"${p.id}" no tiene nombre`);
    if (!Number.isInteger(p.precio) || p.precio <= 0 || p.precio > PRECIO_MAXIMO) {
      throw new ErrorCatalogo(`"${p.id}" tiene un precio inválido: ${p.precio} (entero, sin puntos)`);
    }
    if (p.stock !== undefined && (!Number.isInteger(p.stock) || p.stock < 0)) {
      throw new ErrorCatalogo(`"${p.id}" tiene un stock inválido: ${p.stock}`);
    }
    if (p.tipo !== "fisico" && p.tipo !== "digital") {
      throw new ErrorCatalogo(`"${p.id}" debe tener tipo "fisico" o "digital"`);
    }
    if (idsCategorias.size && !idsCategorias.has(p.categoria)) {
      throw new ErrorCatalogo(`"${p.id}" apunta a una categoría que no existe: "${p.categoria}"`);
    }
  }
}

export function crearCatalogo(
  productos: ProductoCatalogo[],
  categorias: CategoriaCatalogo[] = []
): Catalogo {
  validarCatalogo(productos, categorias);
  const porId = new Map(productos.map((p) => [p.id, p]));
  return {
    productos,
    categorias,
    buscar: (id) => porId.get(id),
    categoria: (id) => categorias.find((c) => c.id === id),
    deCategoria: (id) => productos.filter((p) => p.categoria === id),
    destacados: () => productos.filter((p) => p.destacado),
  };
}
