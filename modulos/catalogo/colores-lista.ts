/**
 * Muestras de colores en las TARJETAS de las listas (navegador, v0.37).
 * Las muestras las arma el borde (`htmlMuestras`); aquí solo se conectan:
 *
 *   [data-cat-slot]                     la tarjeta
 *   [data-muestra]                      cada muestra (data-muestra-foto, data-muestra-color)
 *   img[data-cat~="imagen"] o [data-cat~="imagen-alt"]   la foto de la tarjeta
 *   a[data-cat~="enlace"]               los enlaces a la ficha (reciben ?color=)
 *
 * Al pasar el mouse o tocar una muestra, la foto de la tarjeta cambia a ese
 * color y sus enlaces abren la ficha con ese color elegido. Solo cambia lo
 * que se ve: la compra se valida siempre en el servidor.
 */
const SELECTOR_FOTO = 'img[data-cat~="imagen"], img[data-cat~="imagen-alt"]';

function elegirMuestra(m: HTMLElement) {
  const tarjeta = m.closest<HTMLElement>("[data-cat-slot]");
  if (!tarjeta) return;
  const foto = m.dataset.muestraFoto;
  const color = m.dataset.muestraColor;
  const img = tarjeta.querySelector<HTMLImageElement>(SELECTOR_FOTO);
  if (img && foto) {
    img.src = foto;
    img.removeAttribute("srcset");
  }
  for (const otra of tarjeta.querySelectorAll<HTMLElement>("[data-muestra]")) otra.setAttribute("aria-pressed", String(otra === m));
  if (!color) return;
  for (const a of tarjeta.querySelectorAll<HTMLAnchorElement>('a[data-cat~="enlace"]')) {
    const url = new URL(a.getAttribute("href") || "", location.href);
    if (!url.pathname.startsWith("/producto/")) continue;
    url.searchParams.set("color", color);
    a.setAttribute("href", url.pathname + url.search);
  }
}

export function iniciarColoresLista(raiz: ParentNode = document) {
  for (const m of raiz.querySelectorAll<HTMLElement>("[data-muestra]")) {
    m.setAttribute("aria-pressed", "false");
    m.addEventListener("mouseenter", () => elegirMuestra(m));
    m.addEventListener("focus", () => elegirMuestra(m));
    m.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      elegirMuestra(m);
    });
  }
}
