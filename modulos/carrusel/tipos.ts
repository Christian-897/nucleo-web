/** Tipos del carrusel de portada. */

/** Dónde se ancla la foto cuando se recorta (lo importante no se pierde). */
export type Enfoque = "izquierda" | "centro" | "derecha";
export const ENFOQUES: readonly Enfoque[] = ["izquierda", "centro", "derecha"];

export interface Diapositiva {
  /** Identificador estable (el panel lo usa para editar y ordenar). */
  id: string;
  /** Foto: del sitio (/img/…) o subida al panel (/media/…). */
  imagen: string;
  /** Qué muestra la foto, en pocas palabras (para Google y para quien no ve). */
  imagenAlt: string;
  enfoque?: Enfoque;
  /** Texto chico sobre el título ("Bienvenida a"). */
  antetitulo?: string;
  titulo?: string;
  /** Línea bajo el título ("Tejidos"). */
  subtitulo?: string;
  texto?: string;
  boton?: { texto: string; enlace: string };
}

export interface EstadoCarrusel {
  diapositivas: Diapositiva[];
  /** Segundos que se ve cada diapositiva. */
  segundos: number;
  /** ¿Avanza sola? (Igual se detiene con el mouse encima, al usar el teclado o con "Pausar".) */
  automatico: boolean;
}

/** Cómo se dibuja: lo pone el SITIO (código), nunca el panel. */
export interface OpcionesCarrusel {
  /** Nombre del carrusel para lectores de pantalla. Por defecto "Destacados". */
  etiqueta?: string;
  /** Clase extra para el bloque de texto (ej. el "contenedor" del sitio). */
  claseContenedor?: string;
  /** Clase del botón (ej. "boton"). Por defecto "carrusel__boton-base". */
  claseBoton?: string;
  /** SVG que va después del texto del botón. Es código del sitio: se inserta tal cual. */
  iconoBoton?: string;
  /** Medidas declaradas de las fotos (evita saltos al cargar). Por defecto 1600 × 1000. */
  medidas?: { ancho: number; alto: number };
  /** Foto si una diapositiva quedó sin foto válida (/img/… o /media/…). */
  imagenPorDefecto?: string;
  /** La primera diapositiva lleva el título principal de la página (h1). Por defecto sí. */
  tituloPrincipal?: boolean;
}

export const LIMITES = {
  diapositivas: 8,
  antetitulo: 40,
  titulo: 60,
  subtitulo: 40,
  texto: 220,
  imagenAlt: 150,
  botonTexto: 30,
  enlace: 200,
  segundosMin: 4,
  segundosMax: 15,
} as const;

export const SEGUNDOS_POR_DEFECTO = 6;
