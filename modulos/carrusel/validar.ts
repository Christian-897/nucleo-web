/**
 * Valida y limpia un carrusel (lo que manda el panel o lo que hay en KV).
 * Nunca se confía en la pantalla: todo pasa por aquí antes de guardarse.
 */
import { normalizeInput } from "../../core/validar";
import { ENFOQUES, ESTILOS_CONTROLES, LIMITES, SEGUNDOS_POR_DEFECTO, type Diapositiva, type Enfoque, type EstadoCarrusel, type EstiloControles } from "./tipos";

const ID = /^[a-z0-9-]{1,40}$/;

/** Solo fotos propias: del sitio (/img/) o subidas al panel (/media/). */
export function imagenValida(v: unknown): v is string {
  return typeof v === "string" && /^\/(media|img)\/[a-zA-Z0-9/_.-]{1,150}$/.test(v) && !v.includes("..");
}

/**
 * Enlace del botón: una página del sitio ("/tienda/") o una dirección https
 * completa (Instagram, WhatsApp…). Nada de "javascript:", "data:" ni "//otro".
 */
export function enlaceValido(v: unknown): v is string {
  if (typeof v !== "string" || v.length > LIMITES.enlace) return false;
  if (v.startsWith("/")) return !v.startsWith("//") && /^\/[a-zA-Z0-9/_.~%?=&#+-]*$/.test(v);
  try {
    const u = new URL(v);
    return u.protocol === "https:" && Boolean(u.hostname) && !u.username && !u.password;
  } catch {
    return false;
  }
}

export function nuevoIdDiapositiva(usados: Set<string>): string {
  for (;;) {
    const id = "d-" + [...crypto.getRandomValues(new Uint8Array(4))].map((b) => b.toString(16).padStart(2, "0")).join("");
    if (!usados.has(id)) return id;
  }
}

type Resultado = { ok: true; datos: EstadoCarrusel } | { ok: false; errores: Record<string, string>; mensaje: string };

/**
 * Errores con clave "<n>.<campo>" (n = posición de la diapositiva desde 0),
 * o "general" / "segundos" para el carrusel completo.
 */
export function validarCarrusel(crudo: unknown): Resultado {
  const e: Record<string, string> = {};
  const o = (crudo && typeof crudo === "object" ? crudo : {}) as Record<string, unknown>;
  const texto = (v: unknown) => (typeof v === "string" ? normalizeInput(v).trim() : "");

  let segundos = SEGUNDOS_POR_DEFECTO;
  if (o.segundos !== undefined) {
    const s = Number(o.segundos);
    if (!Number.isInteger(s) || s < LIMITES.segundosMin || s > LIMITES.segundosMax) {
      e.segundos = `Elige entre ${LIMITES.segundosMin} y ${LIMITES.segundosMax} segundos.`;
    } else segundos = s;
  }
  const automatico = o.automatico !== false;
  const controles: EstiloControles = ESTILOS_CONTROLES.includes(o.controles as EstiloControles) ? (o.controles as EstiloControles) : "burbuja";

  const lista = Array.isArray(o.diapositivas) ? o.diapositivas : null;
  if (!lista || lista.length === 0) e.general = "La portada necesita al menos una diapositiva.";
  else if (lista.length > LIMITES.diapositivas) e.general = `Máximo ${LIMITES.diapositivas} diapositivas.`;

  const usados = new Set<string>();
  const diapositivas: Diapositiva[] = [];
  for (const [i, bruto] of (lista ?? []).slice(0, LIMITES.diapositivas).entries()) {
    const d = (bruto && typeof bruto === "object" ? bruto : {}) as Record<string, unknown>;
    const err = (campo: string, msg: string) => (e[`${i}.${campo}`] = msg);
    const largo = (campo: keyof typeof LIMITES, valor: string, etiqueta: string) => {
      if (valor.length > LIMITES[campo]) err(campo, `${etiqueta}: máximo ${LIMITES[campo]} caracteres.`);
    };

    let id = typeof d.id === "string" && ID.test(d.id) && !usados.has(d.id) ? d.id : "";
    if (!id) id = nuevoIdDiapositiva(usados);
    usados.add(id);

    if (!imagenValida(d.imagen)) err("imagen", "Falta la foto.");
    const imagenAlt = texto(d.imagenAlt);
    if (imagenAlt.length < 3) err("imagenAlt", "Describe la foto en pocas palabras (ayuda a Google y a quien no ve).");
    largo("imagenAlt", imagenAlt, "Descripción de la foto");

    const enfoque: Enfoque = ENFOQUES.includes(d.enfoque as Enfoque) ? (d.enfoque as Enfoque) : "centro";
    const antetitulo = texto(d.antetitulo);
    const titulo = texto(d.titulo);
    const subtitulo = texto(d.subtitulo);
    const cuerpo = texto(d.texto);
    largo("antetitulo", antetitulo, "Texto sobre el título");
    largo("titulo", titulo, "Título");
    largo("subtitulo", subtitulo, "Subtítulo");
    largo("texto", cuerpo, "Texto");

    const b = (d.boton && typeof d.boton === "object" ? d.boton : {}) as Record<string, unknown>;
    const botonTexto = texto(b.texto);
    const enlace = texto(b.enlace);
    largo("botonTexto", botonTexto, "Texto del botón");
    if (botonTexto && !enlace) err("enlace", "Escribe a dónde lleva el botón (ej. /tienda/).");
    else if (enlace && !botonTexto) err("botonTexto", "Escribe el texto del botón, o borra el enlace.");
    else if (enlace && !enlaceValido(enlace)) {
      err("enlace", "Usa una página del sitio (ej. /tienda/) o una dirección que empiece con https://");
    }

    diapositivas.push({
      id,
      imagen: typeof d.imagen === "string" ? d.imagen : "",
      imagenAlt,
      enfoque,
      ...(antetitulo ? { antetitulo } : {}),
      ...(titulo ? { titulo } : {}),
      ...(subtitulo ? { subtitulo } : {}),
      ...(cuerpo ? { texto: cuerpo } : {}),
      ...(botonTexto && enlace ? { boton: { texto: botonTexto, enlace } } : {}),
    });
  }

  if (Object.keys(e).length) {
    const conPosicion = Object.keys(e).find((k) => /^\d+\./.test(k));
    const mensaje = e.general ?? e.segundos ?? (conPosicion ? `Revisa la diapositiva ${Number(conPosicion.split(".")[0]) + 1}.` : "Revisa los datos.");
    return { ok: false, errores: e, mensaje };
  }
  return { ok: true, datos: { diapositivas, segundos, automatico, controles } };
}
