/**
 * AVISO DE COOKIES y la decisión del visitante (navegador).
 *
 * Una sola pregunta para toda la medición del sitio: "Aceptar" o
 * "Rechazar", con el mismo peso. Ninguna herramienta (Google Analytics, y
 * las que se sumen) carga NADA antes de que la persona acepte. Si rechaza,
 * no se carga ni se guarda ninguna cookie de medición. La decisión se
 * recuerda 180 días en ese navegador y se puede cambiar cuando se quiera
 * con cualquier botón `[data-cookies-preferencias]` (por ejemplo, en el pie).
 *
 * Marcas que conecta `iniciarAvisoCookies()` (las trae AvisoCookies.astro):
 *   [data-aviso-cookies]          el aviso (se muestra solo si falta decidir)
 *   [data-cookies-aceptar]        botón Aceptar
 *   [data-cookies-rechazar]       botón Rechazar
 *   [data-cookies-preferencias]   abre el aviso de nuevo (en cualquier parte)
 */

export const CLAVE_DECISION = "nucleo:cookies";
export const VERSION_DECISION = 1;
export const DIAS_DECISION = 180;
const EVENTO_DECISION = "nucleo:cookies-decision";

export interface Decision {
  v: number;
  /** true = aceptó la medición. */
  medicion: boolean;
  /** Cuándo decidió (ISO). */
  fecha: string;
}

/** La decisión guardada, si es válida y no venció. Pura (para probar). */
export function decisionVigente(crudo: string | null, ahora = Date.now()): Decision | null {
  if (!crudo) return null;
  let d: unknown;
  try {
    d = JSON.parse(crudo);
  } catch {
    return null;
  }
  if (!d || typeof d !== "object") return null;
  const x = d as Partial<Decision>;
  if (x.v !== VERSION_DECISION || typeof x.medicion !== "boolean" || typeof x.fecha !== "string") return null;
  const t = Date.parse(x.fecha);
  if (!Number.isFinite(t) || t > ahora + 60_000) return null;
  if (ahora - t > DIAS_DECISION * 86_400_000) return null;
  return { v: x.v, medicion: x.medicion, fecha: x.fecha };
}

export function leerDecision(): Decision | null {
  try {
    return decisionVigente(localStorage.getItem(CLAVE_DECISION));
  } catch {
    return null;
  }
}

export function guardarDecision(acepta: boolean): Decision {
  const d: Decision = { v: VERSION_DECISION, medicion: acepta, fecha: new Date().toISOString() };
  try {
    localStorage.setItem(CLAVE_DECISION, JSON.stringify(d));
  } catch {
    // Sin almacenamiento: vale para esta página; se volverá a preguntar.
  }
  try {
    window.dispatchEvent(new CustomEvent(EVENTO_DECISION, { detail: d }));
  } catch {
    /* nada */
  }
  return d;
}

/**
 * Llama a `fn` cuando la medición está aceptada: ahora mismo si ya lo
 * estaba, o en cuanto la persona toque "Aceptar". Y a `alRechazar`, si se da,
 * cuando la retira después. Para las herramientas de medición.
 */
export function cuandoAcepte(fn: () => void, alRechazar?: () => void): void {
  if (typeof window === "undefined") return;
  let activa = false;
  const aplicar = (d: Decision | null) => {
    if (d?.medicion && !activa) {
      activa = true;
      fn();
    } else if (d && !d.medicion && activa) {
      activa = false;
      alRechazar?.();
    }
  };
  aplicar(leerDecision());
  window.addEventListener(EVENTO_DECISION, (e) => aplicar((e as CustomEvent<Decision>).detail));
}

/** Conecta el aviso de cookies de la página. Llamarlo una vez por página. */
export function iniciarAvisoCookies(): void {
  if (typeof document === "undefined") return;
  const aviso = document.querySelector<HTMLElement>("[data-aviso-cookies]");
  const mostrar = (si: boolean) => {
    if (aviso) aviso.hidden = !si;
  };
  if (aviso) {
    aviso.querySelector("[data-cookies-aceptar]")?.addEventListener("click", () => {
      guardarDecision(true);
      mostrar(false);
    });
    aviso.querySelector("[data-cookies-rechazar]")?.addEventListener("click", () => {
      guardarDecision(false);
      mostrar(false);
    });
    mostrar(!leerDecision());
  }
  document.querySelectorAll<HTMLElement>("[data-cookies-preferencias]").forEach((b) => {
    b.hidden = false;
    b.addEventListener("click", (e) => {
      e.preventDefault();
      mostrar(true);
      aviso?.querySelector<HTMLElement>("[data-cookies-aceptar]")?.focus();
    });
  });
}
