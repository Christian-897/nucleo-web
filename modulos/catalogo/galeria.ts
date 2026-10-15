/**
 * GALERÍA DE LA FICHA (navegador). La ficha trae, armado desde el borde:
 *
 *   <img data-galeria-principal …>                 la foto grande
 *   <button data-galeria-anterior hidden>          ←  (opcionales)
 *   <button data-galeria-siguiente hidden>         →
 *   <span data-galeria-contador hidden>            "2 / 7"
 *   <ul data-ficha="galeria"> … botones data-galeria-foto
 *                               (y uno data-galeria-video al final) … </ul>
 *
 *   import { iniciarGaleria } from "nucleo-web/catalogo/galeria";
 *   iniciarGaleria();
 *
 * Funciona con clic, flechas del teclado y deslizando el dedo sobre la
 * foto. Con una sola foto y sin video no hace nada.
 *
 * El video (YouTube, sin cookies) se carga SOLO al elegirlo: ocupa el lugar
 * de la foto grande y se quita al volver a una foto, así no sigue sonando.
 */
import { ID_VIDEO, urlInsercionVideo } from "./video";

export function iniciarGaleria(raiz: ParentNode = document): void {
  const encontrada = raiz.querySelector<HTMLImageElement>("[data-galeria-principal]");
  const minis = [...raiz.querySelectorAll<HTMLButtonElement>("[data-galeria-foto], [data-galeria-video]")];
  if (!encontrada || minis.length < 2) return;
  const principal: HTMLImageElement = encontrada;
  const anterior = raiz.querySelector<HTMLButtonElement>("[data-galeria-anterior]");
  const siguiente = raiz.querySelector<HTMLButtonElement>("[data-galeria-siguiente]");
  const contador = raiz.querySelector<HTMLElement>("[data-galeria-contador]");
  const nombre = principal.alt;
  const total = minis.length;
  let actual = 0;
  let marco: HTMLIFrameElement | null = null;

  function quitarVideo() {
    if (!marco) return;
    marco.remove();
    marco = null;
    principal.hidden = false;
  }

  function ponerVideo(id: string) {
    if (!ID_VIDEO.test(id)) return;
    quitarVideo();
    const f = document.createElement("iframe");
    f.src = urlInsercionVideo(id);
    f.title = `Video de ${nombre}`;
    f.allow = "autoplay; encrypted-media; picture-in-picture; fullscreen";
    f.allowFullscreen = true;
    f.referrerPolicy = "strict-origin-when-cross-origin";
    f.className = "galeria__video";
    // Misma proporción que la foto grande, para que la página no salte.
    const caja = principal.getBoundingClientRect();
    f.style.aspectRatio = caja.width && caja.height ? `${caja.width} / ${caja.height}` : "1";
    f.style.width = "100%";
    f.style.height = "auto";
    f.style.border = "0";
    f.style.display = "block";
    principal.after(f);
    principal.hidden = true;
    marco = f;
  }

  function ir(n: number) {
    actual = (n + total) % total;
    const boton = minis[actual];
    const video = boton.dataset.galeriaVideo;
    if (video) ponerVideo(video);
    else {
      quitarVideo();
      principal.src = boton.dataset.galeriaFoto!;
      principal.alt = `${nombre} — foto ${actual + 1} de ${total}`;
    }
    minis.forEach((b, i) => b.setAttribute("aria-current", i === actual ? "true" : "false"));
    if (contador) contador.textContent = `${actual + 1} / ${total}`;
    boton.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
    // La siguiente foto ya queda pedida: al pasar se ve al tiro.
    const prox = minis[(actual + 1) % total].dataset.galeriaFoto;
    if (prox) new Image().src = prox;
  }

  minis.forEach((b, i) => b.addEventListener("click", () => ir(i)));
  for (const [boton, paso] of [[anterior, -1], [siguiente, 1]] as const) {
    if (!boton) continue;
    boton.hidden = false;
    boton.addEventListener("click", () => ir(actual + paso));
  }
  if (contador) {
    contador.hidden = false;
    contador.textContent = `1 / ${total}`;
  }

  // Deslizar el dedo sobre la foto (celular).
  let inicioX = 0;
  let inicioY = 0;
  principal.addEventListener("touchstart", (e) => {
    inicioX = e.touches[0].clientX;
    inicioY = e.touches[0].clientY;
  }, { passive: true });
  principal.addEventListener("touchend", (e) => {
    const dx = e.changedTouches[0].clientX - inicioX;
    const dy = e.changedTouches[0].clientY - inicioY;
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) ir(actual + (dx < 0 ? 1 : -1));
  }, { passive: true });

  // Flechas del teclado cuando el foco está en la galería.
  const zona = principal.closest<HTMLElement>("[data-galeria]") ?? principal.parentElement;
  zona?.addEventListener("keydown", (e) => {
    if (e.key === "ArrowRight") ir(actual + 1);
    else if (e.key === "ArrowLeft") ir(actual - 1);
  });
}
