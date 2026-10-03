import type { EnvBase } from "../../core/tipos";

/**
 * Variables del newsletter (Secrets en Cloudflare, nunca en el código).
 */
export interface EnvNewsletter extends EnvBase {
  /**
   * Clave para firmar los enlaces de confirmación y de baja. Mínimo 32
   * caracteres al azar. Si se cambia, los enlaces de baja ya enviados dejan
   * de funcionar: no cambiarla sin motivo.
   */
  NEWSLETTER_SECRET?: string;
  /** Token para descargar la lista de suscriptores (CSV). Mínimo 32 caracteres. */
  NEWSLETTER_EXPORT_TOKEN?: string;
}

export interface ConfigNewsletter {
  /** Nombre que aparece en los correos. */
  nombreSitio: string;
  /** Página que muestra el botón "Confirmar". Por defecto /newsletter/confirmar. */
  rutaConfirmar?: string;
  /** Página que muestra el botón "Darme de baja". Por defecto /newsletter/baja. */
  rutaBaja?: string;
  /** Remitente si no hay RESEND_FROM. */
  remitentePorDefecto?: string;
  /** Colores del correo (opcional). */
  coloresCorreo?: { acento?: string; fondo?: string };
  /** Avisar a ADMIN_NOTIFY_EMAIL cuando alguien confirma. Por defecto false. */
  avisarAdmin?: boolean;
  /** Horas que vale el enlace de confirmación. Por defecto 48. */
  horasConfirmacion?: number;
  /** Tope de envíos por IP. Por defecto 5 cada 10 minutos. */
  rateLimit?: { max: number; ventanaSeg: number };
}

export const RUTAS_NEWSLETTER = {
  confirmar: "/newsletter/confirmar",
  baja: "/newsletter/baja",
} as const;

export const LARGO_MINIMO_SECRETO = 32;
