/**
 * Configuración del módulo de cotización.
 *
 * Todo lo específico del rubro y del sitio entra por acá: el módulo no
 * importa nada del sitio. Un sitio nuevo crea su config y se la pasa al
 * endpoint y a la plantilla; nada del motor cambia.
 */

export interface CategoriaCotizacion {
  id: string;
  label: string;
}

export interface ColoresCorreo {
  fondo: string;
  tarjeta: string;
  borde: string;
  tinta: string;
  tintaSuave: string;
  tintaTenue: string;
  acento: string;
  whatsapp: string;
}

/** Paleta neutra por defecto; cada sitio la sobrescribe con la suya. */
export const COLORES_CORREO_POR_DEFECTO: ColoresCorreo = {
  fondo: "#F5F5F4",
  tarjeta: "#FFFFFF",
  borde: "#E5E1DC",
  tinta: "#1F1B16",
  tintaSuave: "#3F3A33",
  tintaTenue: "#78716C",
  acento: "#4F46E5",
  whatsapp: "#25D366",
};

export interface ConfigCotizacion {
  /** Nombre del negocio, para el asunto y el cuerpo del correo. */
  nombreSitio: string;
  /** Categorías del rubro. De aquí salen las opciones válidas y sus nombres. */
  categorias: CategoriaCotizacion[];
  /** Ruta del panel donde se ven las solicitudes. Por defecto "/admin/". */
  rutaPanel?: string;
  /** Días que se conserva el respaldo antes de borrarse solo. Por defecto 180. */
  retencionDias?: number;
  /** Tope de envíos por IP si no hay variable de entorno. Por defecto 5. */
  rateLimitMax?: number;
  /** Ventana del tope, en segundos, si no hay variable. Por defecto 600. */
  rateLimitVentanaSeg?: number;
  /** Colores del correo; se mezclan con los por defecto. */
  coloresCorreo?: Partial<ColoresCorreo>;
}

export const RETENCION_DIAS_POR_DEFECTO = 180;

/** Mapa id -> label a partir de las categorías de la config. */
export function nombresCategoria(
  config: ConfigCotizacion
): Record<string, string> {
  return Object.fromEntries(config.categorias.map((c) => [c.id, c.label]));
}
