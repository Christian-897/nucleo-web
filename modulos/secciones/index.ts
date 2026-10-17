/**
 * Módulo secciones: bloques de portada que se arman con el contenido
 * editable (módulo contenido), sin lógica propia en el servidor.
 *
 *   import { camposRutina, camposMosaico } from "nucleo-web/secciones";
 *
 * - Rutina en pasos: título, texto, botón, una frase escrita a mano y N
 *   pasos numerados con foto y flecha entre ellos.
 * - Mosaico con frase: N fotos en fila y un recuadro con una frase destacada.
 *
 * Cada función devuelve los CAMPOS para el esquema del contenido: el sitio
 * los agrega a su esquema y la clienta los edita en "Diseño y textos".
 * Los componentes (`Rutina.astro`, `Mosaico.astro`) dibujan la sección con
 * las marcas del borde (data-c…), así lo editado aparece sin reconstruir.
 *
 * Nada de lo escrito se vuelve HTML: los textos van con data-c (texto
 * plano) y las fotos solo pueden ser /img/ o /media/ (lo valida contenido).
 */
import type { Campo } from "../contenido/tipos";

export const MAXIMO_PASOS = 6;
export const MAXIMO_FOTOS_MOSAICO = 8;

export interface OpcionesSeccion {
  /** Grupo del panel donde aparecen los campos ("rutina"). */
  grupo: string;
  /** Prefijo de las claves. Por defecto "rutina" o "mosaico". */
  prefijo?: string;
}

function cantidad(n: number | undefined, defecto: number, maximo: number): number {
  const v = Math.round(Number(n ?? defecto));
  if (!Number.isFinite(v) || v < 1 || v > maximo) throw new Error(`Cantidad inválida: ${n} (1 a ${maximo}).`);
  return v;
}

/** Claves de la rutina (las usan los campos y el componente: así no se desalinean). */
export function clavesRutina(prefijo = "rutina", pasos = 3) {
  const n = cantidad(pasos, 3, MAXIMO_PASOS);
  return {
    antetitulo: `${prefijo}.antetitulo`,
    titulo: `${prefijo}.titulo`,
    texto: `${prefijo}.texto`,
    boton: `${prefijo}.boton`,
    nota: `${prefijo}.nota`,
    pasos: Array.from({ length: n }, (_, i) => ({
      titulo: `${prefijo}.paso.${i + 1}.titulo`,
      imagen: `${prefijo}.paso.${i + 1}.imagen`,
      imagenAlt: `${prefijo}.paso.${i + 1}.imagenAlt`,
    })),
  };
}

/** Campos editables de la rutina en pasos. */
export function camposRutina(opciones: OpcionesSeccion & { pasos?: number }): Campo[] {
  const { grupo, prefijo = "rutina" } = opciones;
  const k = clavesRutina(prefijo, opciones.pasos ?? 3);
  return [
    { clave: k.antetitulo, grupo, etiqueta: "Texto chico sobre el título", tipo: "texto", max: 40, opcional: true },
    { clave: k.titulo, grupo, etiqueta: "Título", tipo: "texto", max: 60 },
    { clave: k.texto, grupo, etiqueta: "Texto", tipo: "parrafo", max: 200, opcional: true },
    { clave: k.boton, grupo, etiqueta: "Texto del botón", tipo: "texto", max: 30, opcional: true, ayuda: "Vacío = sin botón." },
    { clave: k.nota, grupo, etiqueta: "Frase escrita a mano", tipo: "texto", max: 60, opcional: true, ayuda: "Va en letra manuscrita, con una flecha. Vacía = no se muestra." },
    ...k.pasos.flatMap((p, i): Campo[] => [
      { clave: p.titulo, grupo, etiqueta: `Paso ${i + 1}: título`, tipo: "texto", max: 40 },
      { clave: p.imagen, grupo, etiqueta: `Paso ${i + 1}: foto`, tipo: "imagen", proporcion: 2 / 3, anchoMaximo: 900, ayuda: "Vertical (más alta que ancha)." },
      { clave: p.imagenAlt, grupo, etiqueta: `Paso ${i + 1}: qué muestra la foto`, tipo: "texto", max: 150 },
    ]),
  ];
}

/** Claves del mosaico. */
export function clavesMosaico(prefijo = "mosaico", fotos = 4) {
  const n = cantidad(fotos, 4, MAXIMO_FOTOS_MOSAICO);
  return {
    antetitulo: `${prefijo}.antetitulo`,
    frase: `${prefijo}.frase`,
    fotos: Array.from({ length: n }, (_, i) => ({
      imagen: `${prefijo}.foto.${i + 1}.imagen`,
      imagenAlt: `${prefijo}.foto.${i + 1}.imagenAlt`,
    })),
  };
}

/** Campos editables del mosaico con frase. */
export function camposMosaico(opciones: OpcionesSeccion & { fotos?: number }): Campo[] {
  const { grupo, prefijo = "mosaico" } = opciones;
  const k = clavesMosaico(prefijo, opciones.fotos ?? 4);
  return [
    { clave: k.antetitulo, grupo, etiqueta: "Texto chico sobre la frase", tipo: "texto", max: 50, opcional: true },
    { clave: k.frase, grupo, etiqueta: "Frase destacada", tipo: "parrafo", max: 120 },
    ...k.fotos.flatMap((f, i): Campo[] => [
      { clave: f.imagen, grupo, etiqueta: `Foto ${i + 1}`, tipo: "imagen", proporcion: 1, anchoMaximo: 900, ayuda: "Cuadrada o casi cuadrada." },
      { clave: f.imagenAlt, grupo, etiqueta: `Foto ${i + 1}: qué muestra`, tipo: "texto", max: 150 },
    ]),
  ];
}
