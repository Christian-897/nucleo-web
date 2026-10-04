/**
 * Tipos base del núcleo, a propósito SIN depender de los tipos de
 * Cloudflare Workers.
 *
 * `AlmacenKV` describe solo lo que los módulos usan de un KV de Cloudflare.
 * Al ser estructural, el KV real de Cloudflare calza sin importar nada, y
 * el núcleo se puede compilar y probar en Node sin arrastrar
 * `@cloudflare/workers-types`. Si algún día se cambia KV por otra cosa
 * (D1, un mock de pruebas), basta con cumplir esta forma.
 */
export interface AlmacenKV {
  get(key: string): Promise<string | null>;
  put(
    key: string,
    value: string,
    options?: { expirationTtl?: number }
  ): Promise<void>;
  delete(key: string): Promise<void>;
  list(options?: {
    prefix?: string;
    limit?: number;
  }): Promise<{ keys: { name: string }[] }>;
}

/**
 * Variables de entorno que comparten los módulos. Cada sitio define las
 * suyas como Secrets en Cloudflare; el núcleo solo declara las que usa.
 * Todas opcionales: un sitio en modo demo (sin correo, sin KV) sigue
 * funcionando y los módulos lo detectan.
 */
export interface EnvBase {
  TURNSTILE_SECRET_KEY?: string;
  RESEND_API_KEY?: string;
  RESEND_FROM?: string;
  ADMIN_NOTIFY_EMAIL?: string;
  RATE_LIMIT_MAX?: string;
  RATE_LIMIT_WINDOW_SECONDS?: string;
  /** Almacén principal del sitio (Cloudflare KV). */
  REVIEWS_KV?: AlmacenKV;
}

/**
 * Almacén que además guarda archivos (las fotos que sube el panel).
 * También calza con el KV real de Cloudflare sin importar nada.
 */
export interface AlmacenBinario extends AlmacenKV {
  put(
    key: string,
    value: string | ArrayBuffer,
    options?: { expirationTtl?: number; metadata?: unknown }
  ): Promise<void>;
  getWithMetadata(
    key: string,
    options: { type: "arrayBuffer" }
  ): Promise<{ value: ArrayBuffer | null; metadata: unknown }>;
}
