import type { EnvBase } from "../../core/tipos";

/**
 * Variables del aviso de construcción (en Cloudflare → Settings →
 * Variables and secrets). Ninguna va en el código.
 */
export interface EnvConstruccion extends EnvBase {
  /** "1" = el sitio muestra el aviso. Vacío, "0" o borrada = sitio normal. */
  CONSTRUCCION?: string;
  /**
   * Clave del enlace de vista previa (tipo Secret, mínimo 16 caracteres).
   * Quien abra `https://sitio/?previa=CLAVE` ve el sitio real por N días.
   * Cambiarla corta el acceso a todos los que ya entraron.
   */
  ACCESO_PREVIA?: string;
}

export interface EnlaceContacto {
  etiqueta: string;
  /** Solo https:, mailto: o tel:. Cualquier otro se descarta. */
  url: string;
}

export interface ConfigConstruccion {
  nombreSitio: string;
  /** Por defecto: "Sitio en construcción". */
  titulo?: string;
  /** Por defecto: "Estamos preparando algo bonito. Vuelve pronto." */
  mensaje?: string;
  /** Ruta pública del logo (se deja pasar siempre). Ej: "/img/marca/logo-192.png". */
  logo?: string;
  colores?: { acento?: string; fondo?: string; tinta?: string };
  contactos?: EnlaceContacto[];
  /**
   * Prefijos de ruta que pasan siempre, aunque el aviso esté activo. Por
   * defecto los webhooks de pago, el retorno de Flow, los enlaces del correo
   * del newsletter (llegan sin cookie) y robots.txt. Lo que se ponga aquí se SUMA a los de por defecto.
   */
  rutasLibres?: string[];
  /** Días que dura el acceso de vista previa. Por defecto 30. */
  diasAcceso?: number;
  /** Nombre del parámetro del enlace secreto. Por defecto "previa". */
  parametro?: string;
}

/**
 * Pasan siempre. Los enlaces del correo del newsletter (confirmar y darse de
 * baja) se abren desde el correo, sin la cookie de vista previa; van firmados,
 * así que dejarlos pasar no abre nada más. Pedir el enlace de baja también
 * pasa (quien se suscribió debe poder salirse siempre). Suscribirse sigue bloqueado.
 */
export const RUTAS_LIBRES_POR_DEFECTO = [
  "/api/pago/webhook-",
  "/api/pago/retorno-",
  "/robots.txt",
  "/newsletter/confirmar",
  "/newsletter/baja",
  "/api/newsletter/confirmar",
  "/api/newsletter/baja",
  "/api/newsletter/pedir-baja",
];
export const LARGO_MINIMO_CLAVE_PREVIA = 16;
export const NOMBRE_COOKIE = "__Host-previa";
