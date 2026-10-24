import type { Producto } from "../carrito/tipos";
import type { ColorProducto, TituloColores } from "./colores";

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
  /** Subcategoría dentro de su categoría (v0.39), por id. Vacío o desconocida = sin subcategoría. */
  subcategoria?: string;
  /**
   * Colores (o modelos), cada uno con su foto y su stock (v0.35). Con
   * colores, el stock del producto es la suma de los colores y para
   * comprar hay que elegir uno. Ver colores.ts.
   */
  colores?: ColorProducto[];
  /** Cómo se llama el selector en la ficha. Por defecto "Color". */
  tituloColores?: TituloColores;
  /**
   * Punto de la foto (en %) al que se acerca la miniatura en el estilo
   * "textura". Uno por producto: las fotos de una misma línea suelen tener
   * el mismo encuadre. Por defecto el centro.
   */
  enfoqueColores?: { x: number; y: number };
}

export interface CategoriaCatalogo {
  id: string;
  nombre: string;
  /** Nombre corto para tarjetas y menú. */
  corto?: string;
  /** Línea chica bajo el nombre en las tarjetas del sitio. Opcional. */
  bajada?: string;
  imagen?: string;
  /** Subcategorías (v0.39): botones de filtro en su página y su propia dirección /tienda/<cat>/<sub>/. */
  subcategorias?: Subcategoria[];
  [extra: string]: unknown;
}

export interface Subcategoria {
  /** Se crea una vez desde el nombre y no cambia: es la dirección /tienda/<categoria>/<id>/. */
  id: string;
  nombre: string;
}

export interface Catalogo {
  productos: ProductoCatalogo[];
  categorias: CategoriaCatalogo[];
  buscar(id: string): ProductoCatalogo | undefined;
  categoria(id: string): CategoriaCatalogo | undefined;
  deCategoria(idCategoria: string): ProductoCatalogo[];
  destacados(): ProductoCatalogo[];
}
