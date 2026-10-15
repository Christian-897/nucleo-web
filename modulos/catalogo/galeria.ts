/**
 * GALERÍA DE LA FICHA (navegador). La ficha trae, armado desde el borde:
 *
 *   <img data-galeria-principal …>                 la foto grande
 *   <button data-galeria-anterior hidden>          ←  (opcionales)
 *   <button data-galeria-siguiente hidden>         →
 *   <span data-galeria-contador hidden>            "2 / 7"
 *   <ul data-ficha="galeria"> … botones data-galeria-foto … </ul>
 *
 *   import { iniciarGaleria } from "nucleo-web/catalogo/galeria";
 *   iniciarGaleria();
 *
 * Funciona con clic, flechas del teclado y deslizando el dedo sobre la
 * foto. Con una sola foto no hace nada.
 */
export function iniciarGaleria(raiz: ParentNode = document): void {
  const encontrada = raiz.querySelector<HTMLImageElement>("[data-galeria-principal]");
  const minis = [...raiz.querySelectorAll<HTMLButtonElement>("[data-galeria-foto]")];
  if (!encontrada || minis.length < 2) return;
  const principal: HTMLImageElement = encontrada;
  const anterior = raiz.querySelector<HTMLButtonElement>("[data-galeria-anterior]");
  const siguiente = raiz.querySelector<HTMLButtonElement>("[data-galeria-siguiente]");
  const contador = raiz.querySelector<HTMLElement>("[data-galeria-contador]");
  const nombre = principal.alt;
  const total = minis.length;
  let actual = 0;

  function ir(n: number) {
    actual = (n + total) % total;
    const boton = minis[actual];
    principal.src = boton.dataset.galeriaFoto!;
    principal.alt = `${nombre} — foto ${actual + 1} de ${total}`;
    minis.forEach((b, i) => b.setAttribute("aria-current", i === actual ? "true" : "false"));
    if (contador) contador.textContent = `${actual + 1} / ${total}`;
    boton.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
    // La siguiente ya queda pedida: al pasar se ve al tiro.
    new Image().src = minis[(actual + 1) % total].dataset.galeriaFoto!;
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
