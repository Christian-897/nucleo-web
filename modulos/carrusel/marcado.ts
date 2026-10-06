/**
 * MARCADO DEL CARRUSEL: una sola función arma el HTML, tanto al construir
 * el sitio (Carrusel.astro) como en el borde cuando la portada se editó en
 * el panel (borde.ts). Así lo estático y lo editado son idénticos.
 *
 * Seguridad: todo texto que viene de los datos pasa por `escapar`; las
 * direcciones se revisan otra vez (imagen y enlace) aunque ya vengan
 * validadas. Lo único que entra sin escapar es `iconoBoton`, que es
 * código del sitio, nunca del panel.
 */
import { enlaceValido, imagenValida } from "./validar";
import type { Diapositiva, EstadoCarrusel, OpcionesCarrusel } from "./tipos";

export function escapar(v: string): string {
  return v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

const ICONO = {
  anterior: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="m15 6-6 6 6 6"/></svg>',
  siguiente: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="m9 6 6 6-6 6"/></svg>',
  pausa:
    '<svg class="carrusel__icono-pausa" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M9 6v12M15 6v12"/></svg>' +
    '<svg class="carrusel__icono-seguir" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M8 5.5v13l10-6.5z"/></svg>',
};

function diapositiva(d: Diapositiva, i: number, total: number, op: OpcionesCarrusel): string {
  const { ancho, alto } = op.medidas ?? { ancho: 1600, alto: 1000 };
  const primera = i === 0;
  const imagen = imagenValida(d.imagen) ? d.imagen : imagenValida(op.imagenPorDefecto) ? op.imagenPorDefecto : "";
  const carga = primera ? 'fetchpriority="high"' : 'loading="lazy" decoding="async"';
  const enfoque = d.enfoque && d.enfoque !== "centro" ? ` carrusel__imagen--${d.enfoque}` : "";

  const partes: string[] = [];
  if (d.antetitulo) partes.push(`<p class="carrusel__antetitulo">${escapar(d.antetitulo)}</p>`);
  if (d.titulo || d.subtitulo) {
    const h = primera && op.tituloPrincipal !== false ? "h1" : "h2";
    partes.push(
      `<${h} class="carrusel__titulo">` +
        (d.titulo ? `<span class="carrusel__nombre">${escapar(d.titulo)}</span>` : "") +
        (d.subtitulo ? `<span class="carrusel__subtitulo">${escapar(d.subtitulo)}</span>` : "") +
        `</${h}>`
    );
  }
  if (d.texto) partes.push(`<p class="carrusel__bajada">${escapar(d.texto)}</p>`);
  if (d.boton && enlaceValido(d.boton.enlace)) {
    const externo = /^https:/.test(d.boton.enlace) ? ' target="_blank" rel="noopener"' : "";
    partes.push(
      `<a class="${escapar(op.claseBoton ?? "carrusel__boton-base")} carrusel__boton" href="${escapar(d.boton.enlace)}"${externo}>` +
        `${escapar(d.boton.texto)}${op.iconoBoton ? " " + op.iconoBoton : ""}</a>`
    );
  }
  const contenido = partes.length
    ? `<div class="carrusel__contenido${op.claseContenedor ? " " + escapar(op.claseContenedor) : ""}"><div class="carrusel__texto">${partes.join("")}</div></div>`
    : "";

  return (
    `<div class="carrusel__diapo" data-carrusel-diapo role="group" aria-roledescription="diapositiva" aria-label="${i + 1} de ${total}"${primera ? " data-activa" : ""}>` +
    (imagen
      ? `<img class="carrusel__imagen${enfoque}" src="${escapar(imagen)}" alt="${escapar(d.imagenAlt)}" width="${ancho}" height="${alto}" ${carga} />`
      : "") +
    contenido +
    `</div>`
  );
}

/** Contenido interior de `[data-carrusel]`: diapositivas y controles. */
export function htmlCarrusel(estado: EstadoCarrusel, op: OpcionesCarrusel = {}): string {
  const lista = estado.diapositivas;
  const total = lista.length;
  const pista = `<div class="carrusel__pista" data-carrusel-pista>${lista.map((d, i) => diapositiva(d, i, total, op)).join("")}</div>`;
  if (total < 2) return pista;
  const puntos = lista
    .map(
      (_, i) =>
        `<button type="button" class="carrusel__punto" data-carrusel-punto="${i}" aria-label="Ver diapositiva ${i + 1}"${i === 0 ? ' aria-current="true"' : ""}><span></span></button>`
    )
    .join("");
  return (
    pista +
    `<div class="carrusel__controles" data-carrusel-controles>` +
    `<button type="button" class="carrusel__boton-control carrusel__pausa" data-carrusel-pausa aria-label="Pausar el carrusel">${ICONO.pausa}</button>` +
    `<button type="button" class="carrusel__boton-control" data-carrusel-anterior aria-label="Diapositiva anterior">${ICONO.anterior}</button>` +
    `<div class="carrusel__puntos" role="group" aria-label="Elegir diapositiva">${puntos}</div>` +
    `<button type="button" class="carrusel__boton-control" data-carrusel-siguiente aria-label="Diapositiva siguiente">${ICONO.siguiente}</button>` +
    `</div>`
  );
}

/** Atributos del contenedor `[data-carrusel]` (los usa el componente y el borde). */
export function atributosCarrusel(estado: EstadoCarrusel): Record<string, string> {
  return {
    "data-segundos": String(estado.segundos),
    "data-automatico": estado.automatico && estado.diapositivas.length > 1 ? "si" : "no",
    "data-controles": estado.controles ?? "burbuja",
  };
}
