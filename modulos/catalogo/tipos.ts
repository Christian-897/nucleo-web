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
  /** Foto principal (la de las listas y el carrito). */
  imagen?: string;
  /** Fotos extra de la galería, en orden (sin la principal). Máximo MAXIMO_FOTOS - 1. */
  fotos?: string[];
  /** Código de un video de YouTube (11 caracteres). Opcional. Ver video.ts. */
  video?: string;
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
