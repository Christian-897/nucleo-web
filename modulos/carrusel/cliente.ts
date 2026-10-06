/**
 * Comportamiento del carrusel en el NAVEGADOR. Sin dependencias.
 *
 * Accesibilidad (patrón de carrusel de W3C/WAI-ARIA):
 *  - Botón de pausa siempre visible (WCAG 2.2.2: lo que se mueve solo
 *    más de 5 s se tiene que poder detener).
 *  - Se detiene solo con el mouse encima, con el foco del teclado adentro
 *    y con la pestaña oculta; sigue donde quedó.
 *  - Con "reducir movimiento" en el sistema NO avanza solo y no hay
 *    animaciones (eso lo hace el CSS).
 *  - Mientras avanza solo, los lectores de pantalla no anuncian cada
 *    cambio (aria-live="off"); detenido, sí ("polite").
 *  - Flechas del teclado y deslizar con el dedo.
 */

export function iniciarCarrusel(raiz: HTMLElement): void {
  if (raiz.dataset.listo) return;
  const diapos = [...raiz.querySelectorAll<HTMLElement>("[data-carrusel-diapo]")];
  const pista = raiz.querySelector<HTMLElement>("[data-carrusel-pista]");
  if (diapos.length < 2 || !pista) return;
  raiz.dataset.listo = "";

  const puntos = [...raiz.querySelectorAll<HTMLButtonElement>("[data-carrusel-punto]")];
  const pausa = raiz.querySelector<HTMLButtonElement>("[data-carrusel-pausa]");
  const reducido = window.matchMedia("(prefers-reduced-motion: reduce)");
  const ms = Math.min(15, Math.max(4, Number(raiz.dataset.segundos) || 6)) * 1000;
  raiz.style.setProperty("--carrusel-duracion", `${ms}ms`);

  let actual = Math.max(0, diapos.findIndex((d) => d.hasAttribute("data-activa")));
  let detenido = raiz.dataset.automatico === "no" || reducido.matches; // por la persona (o el sistema)
  let encima = false;
  let foco = false;
  let restante = ms;
  let inicio = 0;
  let reloj: number | undefined;

  const corre = () => !detenido && !encima && !foco && !document.hidden;

  function actualizar() {
    const anda = corre();
    window.clearTimeout(reloj);
    if (anda) {
      inicio = Date.now();
      reloj = window.setTimeout(() => ir(actual + 1), restante);
    }
    raiz.toggleAttribute("data-corriendo", anda);
    raiz.toggleAttribute("data-detenido", detenido);
    pista!.setAttribute("aria-live", anda ? "off" : "polite");
    if (pausa) {
      pausa.setAttribute("aria-label", detenido ? "Reanudar el carrusel" : "Pausar el carrusel");
      pausa.toggleAttribute("data-detenido", detenido);
    }
  }

  /** Congela el tiempo que queda (para seguir donde quedó). */
  function congelar() {
    if (corre()) restante = Math.max(400, restante - (Date.now() - inicio));
  }

  function ir(n: number) {
    actual = (n + diapos.length) % diapos.length;
    raiz.dataset.movido = ""; // desde ahora el texto entra con animación
    diapos.forEach((d, i) => d.toggleAttribute("data-activa", i === actual));
    puntos.forEach((p, i) => (i === actual ? p.setAttribute("aria-current", "true") : p.removeAttribute("aria-current")));
    restante = ms;
    reiniciarProgreso();
    actualizar();
  }

  /** La barra de progreso del punto activo vuelve a empezar (CSS). */
  function reiniciarProgreso() {
    const p = puntos[actual];
    if (!p) return;
    p.removeAttribute("aria-current");
    void p.offsetWidth;
    p.setAttribute("aria-current", "true");
  }

  function cambiar(estado: () => void) {
    congelar();
    estado();
    actualizar();
  }

  raiz.querySelector("[data-carrusel-anterior]")?.addEventListener("click", () => ir(actual - 1));
  raiz.querySelector("[data-carrusel-siguiente]")?.addEventListener("click", () => ir(actual + 1));
  puntos.forEach((p, i) => p.addEventListener("click", () => ir(i)));
  pausa?.addEventListener("click", () => {
    if (detenido) {
      // Al reanudar, la diapositiva actual parte de cero (y su barra también).
      detenido = false;
      restante = ms;
      reiniciarProgreso();
      actualizar();
    } else cambiar(() => (detenido = true));
  });

  raiz.addEventListener("pointerenter", (e) => e.pointerType === "mouse" && cambiar(() => (encima = true)));
  raiz.addEventListener("pointerleave", (e) => e.pointerType === "mouse" && cambiar(() => (encima = false)));
  raiz.addEventListener("focusin", (e) => {
    // Solo el foco del teclado detiene (un clic en un punto no debe dejarlo quieto).
    if ((e.target as HTMLElement).matches(":focus-visible")) cambiar(() => (foco = true));
  });
  raiz.addEventListener("focusout", (e) => {
    if (!raiz.contains(e.relatedTarget as Node | null)) cambiar(() => (foco = false));
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      congelar();
      window.clearTimeout(reloj);
      raiz.removeAttribute("data-corriendo");
    } else actualizar();
  });
  reducido.addEventListener?.("change", () => reducido.matches && cambiar(() => (detenido = true)));

  raiz.addEventListener("keydown", (e) => {
    if ((e.target as HTMLElement).closest("input, textarea, select")) return;
    if (e.key === "ArrowLeft") ir(actual - 1);
    else if (e.key === "ArrowRight") ir(actual + 1);
    else return;
    e.preventDefault();
  });

  // Deslizar con el dedo (o lápiz): horizontal y de al menos 40 px.
  let x0 = 0;
  let y0 = 0;
  let tocando = false;
  pista.addEventListener("pointerdown", (e) => {
    if (e.pointerType === "mouse") return;
    tocando = true;
    x0 = e.clientX;
    y0 = e.clientY;
  });
  pista.addEventListener("pointerup", (e) => {
    if (!tocando) return;
    tocando = false;
    const dx = e.clientX - x0;
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(e.clientY - y0)) ir(actual + (dx < 0 ? 1 : -1));
  });
  pista.addEventListener("pointercancel", () => (tocando = false));

  actualizar();
}

/** Activa todos los carruseles de la página. */
export function iniciarCarruseles(selector = "[data-carrusel]"): void {
  for (const el of document.querySelectorAll<HTMLElement>(selector)) iniciarCarrusel(el);
}
