import type { CatalogoODinamico } from "../catalogo/almacen";

/**
 * RESEÑAS DE COMPRADORES VERIFICADOS (v0.45).
 *
 * Solo opina quien compró: al marcar un pedido como enviado en el panel, al
 * comprador le llega un correo con un enlace propio (un código por pedido).
 * Lo que escribe queda PENDIENTE hasta que la tienda lo aprueba en el panel
 * (pestaña Reseñas), donde también puede rechazar, eliminar y responder.
 * Las aprobadas se ven en la ficha del producto con sus estrellas, y van en
 * el JSON-LD para que Google pueda mostrar estrellas en los resultados.
 */
export interface ConfigResenas {
  /** Nombre de la tienda (correo y "Respuesta de …"). */
  nombreSitio: string;
  /** Dirección pública del sitio, para el enlace del correo. Ej: "https://isatin.cl". */
  urlPublica: string;
  /** El mismo catálogo de la tienda (nombres y fotos de lo comprado). */
  catalogo: CatalogoODinamico;
  /** Página del formulario. Por defecto "/resena/". */
  rutaFormulario?: string;
  /** Colores del correo. */
  coloresCorreo?: { acento?: string; fondo?: string };
  /** Remitente de respaldo si no hay RESEND_FROM. */
  remitentePorDefecto?: string;
  /** Días que sirve el enlace del correo. Por defecto 180. */
  diasEnlace?: number;
}

export const LIMITES_RESENA = { texto: 1000, nombre: 40, respuesta: 1000 } as const;
/** Reseñas aprobadas que se muestran (y van a Google) por producto. Las más nuevas. */
export const RESENAS_VISIBLES = 20;
