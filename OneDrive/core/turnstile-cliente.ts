/**
 * Turnstile en el navegador, cargado SOLO cuando hace falta (por ejemplo,
 * cuando la persona toca el campo del formulario). Así el script de
 * Cloudflare no se descarga en cada página.
 *
 *   const widget = await montarTurnstile(contenedor, siteKey);
 *   const token = widget.token();   // "" mientras no se resuelva
 *   widget.reiniciar();             // tras un envío (cada token sirve una vez)
 */
interface ApiTurnstile {
  render(el: HTMLElement, opciones: Record<string, unknown>): string;
  reset(id: string): void;
  getResponse(id: string): string | undefined;
}

declare global {
  interface Window {
    turnstile?: ApiTurnstile;
  }
}

const URL_SCRIPT = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
let cargando: Promise<ApiTurnstile> | null = null;

export function cargarTurnstile(): Promise<ApiTurnstile> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (cargando) return cargando;
  cargando = new Promise((resolver, rechazar) => {
    const s = document.createElement("script");
    s.src = URL_SCRIPT;
    s.async = true;
    s.onload = () =>
      window.turnstile ? resolver(window.turnstile) : rechazar(new Error("Turnstile no cargó"));
    s.onerror = () => {
      cargando = null;
      rechazar(new Error("No se pudo cargar la verificación"));
    };
    document.head.appendChild(s);
  });
  return cargando;
}

export interface WidgetTurnstile {
  token(): string;
  reiniciar(): void;
}

export async function montarTurnstile(
  contenedor: HTMLElement,
  siteKey: string,
  opciones: { tema?: "light" | "dark" | "auto"; idioma?: string } = {}
): Promise<WidgetTurnstile> {
  const api = await cargarTurnstile();
  let ultimo = "";
  const id = api.render(contenedor, {
    sitekey: siteKey,
    theme: opciones.tema ?? "light",
    language: opciones.idioma ?? "es",
    callback: (t: string) => (ultimo = t),
    "expired-callback": () => (ultimo = ""),
    "error-callback": () => (ultimo = ""),
  });
  return {
    token: () => api.getResponse(id) || ultimo,
    reiniciar: () => {
      ultimo = "";
      api.reset(id);
    },
  };
}
