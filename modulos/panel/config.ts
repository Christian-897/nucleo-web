import type { AlmacenBinario, EnvBase } from "../../core/tipos";

/**
 * Variables del panel (Secrets en Cloudflare).
 *
 *  ADMIN_PEPPER       clave con que se sellan la contraseña y se cifra el
 *                     doble factor. NUNCA cambiarla ni borrarla: obliga a
 *                     instalar el panel de cero.
 *  ADMIN_SETUP_TOKEN  clave de instalación: se usa UNA vez para crear el
 *                     usuario. Después conviene borrarla.
 */
export interface EnvPanel extends EnvBase {
  ADMIN_PEPPER?: string;
  ADMIN_SETUP_TOKEN?: string;
  REVIEWS_KV?: AlmacenBinario;
}

export interface ConfigPanel {
  /** Aparece en la app autenticadora del teléfono. */
  nombreSitio: string;
  /** Tope de bytes por foto subida. Por defecto 900 KB (cabe holgado en KV). */
  maximoBytesFoto?: number;
  /** Lado máximo de una foto guardada, en píxeles. Por defecto 4.000. */
  maximoLadoFoto?: number;
}

export const MAXIMO_BYTES_FOTO = 900 * 1024;
export const MAXIMO_LADO_FOTO = 4_000;
