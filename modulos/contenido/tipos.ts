import type { RedSocial } from "../contacto/index";
import type { RolFuente } from "./fuentes";

/**
 * Tipos de campo editable. Cada tipo tiene su propia validación y nunca se
 * convierte en HTML: texto con `html: false`, colores con formato hex
 * cerrado, fuentes de una lista cerrada, imágenes solo /media/ o /img/.
 */
export type TipoCampo = "texto" | "parrafo" | "color" | "fuente" | "imagen" | "url" | "email" | "telefono";

export interface Campo {
  /** Identificador estable: "portada.saludo", "faq.3.pregunta". */
  clave: string;
  /** Grupo del panel donde aparece. */
  grupo: string;
  etiqueta: string;
  tipo: TipoCampo;
  /** Texto de ayuda bajo el campo. */
  ayuda?: string;
  /** Largo máximo (texto, párrafo). Por defecto 120 y 1200. */
  max?: number;
  /** Puede quedar vacío: el espacio correspondiente se oculta en el sitio. */
  opcional?: boolean;
  /** Para fuentes: qué papel cumple (títulos, texto, firma). */
  rol?: RolFuente;
  /** Para colores y fuentes: la variable CSS que controla ("--c-acento"). */
  variable?: string;
  /** Para imágenes: proporción ancho/alto con que se recorta en el panel (vacío = la de la foto). */
  proporcion?: number;
  /** Para imágenes: ancho máximo en píxeles al subirla. Por defecto 1600. */
  anchoMaximo?: number;
  /** Para url: si es de una red social, solo se acepta un enlace de esa red (o @usuario). */
  red?: RedSocial;
  /** Para teléfono: cómo se arma el enlace ("whatsapp" usa wa.me, "tel" llama). */
  enlace?: "whatsapp" | "tel";
  /** Para whatsapp: clave del campo con el mensaje inicial. */
  mensajeDe?: string;
}

export interface Grupo {
  id: string;
  titulo: string;
  descripcion?: string;
}

export interface Esquema {
  grupos: Grupo[];
  campos: Campo[];
}

/** Valores por clave. Siempre texto (un color es "#d81b72", una fuente su id). */
export type Valores = Record<string, string>;

export interface AvisoColor {
  /** Claves de los colores involucrados. */
  campos: string[];
  mensaje: string;
  contraste: number;
  minimo: number;
}
