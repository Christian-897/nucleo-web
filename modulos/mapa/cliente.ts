/**
 * Mapa en el navegador: el <iframe> de Google se crea recién cuando la
 * persona toca "Ver mapa". Antes de crearlo se revisa que la dirección sea
 * un mapa insertado de Google armado por el núcleo (insercionPermitida).
 *
 *   import { activarMapas } from "nucleo-web/mapa/cliente";
 *   activarMapas();
 *
 * El componente Mapa.astro ya lo llama; un sitio con su propio marcado solo
 * necesita:
 *   <div data-mapa data-mapa-src="…" data-mapa-titulo="…">
 *     <button type="button" data-mapa-activar>Ver mapa</button>
 *   </div>
 */
import { insercionPermitida } from "./index";

/** Crea el iframe en un contenedor [data-mapa]. Devuelve true si lo creó. */
export function mostrarMapa(contenedor: HTMLElement): boolean {
  if (contenedor.querySelector("iframe")) return true;
  const src = contenedor.dataset.mapaSrc;
  if (!insercionPermitida(src)) return false;
  const marco = document.createElement("iframe");
  marco.className = "mapa__marco";
  marco.src = src;
  marco.title = contenedor.dataset.mapaTitulo || "Mapa de la ubicación";
  marco.loading = "lazy";
  marco.referrerPolicy = "strict-origin-when-cross-origin";
  marco.allowFullscreen = true;
  const boton = contenedor.querySelector<HTMLElement>("[data-mapa-activar]");
  if (boton) boton.replaceWith(marco);
  else contenedor.append(marco);
  contenedor.dataset.mapaActivo = "";
  return true;
}

/** Conecta todos los mapas de la página (se puede llamar más de una vez). */
export function activarMapas(raiz: ParentNode = document): void {
  raiz.querySelectorAll<HTMLElement>("[data-mapa]").forEach((contenedor) => {
    if (contenedor.dataset.mapaListo !== undefined) return;
    contenedor.dataset.mapaListo = "";
    const boton = contenedor.querySelector<HTMLElement>("[data-mapa-activar]");
    boton?.addEventListener("click", () => {
      if (!mostrarMapa(contenedor)) boton.setAttribute("aria-disabled", "true");
    });
  });
}
