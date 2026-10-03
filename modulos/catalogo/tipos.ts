import type { Producto } from "../carrito/tipos";

/**
 * Producto de catálogo. Extiende al del carrito con lo que necesita una
 * tienda para mostrarlo. Lo visual (cómo se ve) lo decide cada sitio.
 */
export interface ProductoCatalogo extends Producto {
  id: string;
  nombre: string;
  /** Pesos enteros (CLP). */
  precio: number;
  /** Stock inicial. Sin stock = sin límite (ej. productos digitales). */
  stock?: number;
  categoria: string;
  /** "digital" no requiere despacho (cursos, patrones en PDF). */
  tipo: "fisico" | "digital";
  descripcion?: string;
  imagen?: string;
  destacado?: boolean;
}

export interface CategoriaCatalogo {
  id: string;
  nombre: string;
  /** Nombre corto para tarjetas y menú. */
  corto?: string;
  imagen?: string;
  [extra: string]: unknown;
}

export interface Catalogo {
  productos: ProductoCatalogo[];
  categorias: CategoriaCatalogo[];
  buscar(id: string): ProductoCatalogo | undefined;
  categoria(id: string): CategoriaCatalogo | undefined;
  deCategoria(idCategoria: string): ProductoCatalogo[];
  destacados(): ProductoCatalogo[];
}
