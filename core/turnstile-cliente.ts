/**
 * Turnstile en el navegador, cargado SOLO cuando hace falta (por ejemplo,
 * cuando la persona toca el campo del formulario). Así el script de
 * Cloudflare no se descarga en cada página.
 *
 *   const widget = await montarTurnstile(contenedor, siteKey);
 *   const token = await widget.esperar(); // "" si no se resolvió a tiempo
 *   widget.reiniciar();                    // tras un envío (cada token sirve una vez)
 *
 * Por defecto el cuadro de Cloudflare queda OCULTO mientras la verificación
 * pase sola ("interaction-only"): solo aparece si Cloudflare necesita que la
 * persona haga algo. Así nadie confunde su "¡Operación exitosa!" con que ya
 * se envió el formulario.
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
  /** El token si ya está listo; "" si no. */
  token(): string;
  /** Espera el token (la verificación suele resolverse sola en 1–2 s). "" si no llegó a tiempo. */
  esperar(ms?: number): Promise<string>;
  reiniciar(): void;
}

export async function montarTurnstile(
  contenedor: HTMLElement,
  siteKey: string,
  opciones: {
    tema?: "light" | "dark" | "auto";
    idioma?: string;
    /** "interaction-only" (por defecto): visible solo si hace falta. "always": siempre visible. */
    apariencia?: "interaction-only" | "always";
  } = {}
): Promise<WidgetTurnstile> {
  const api = await cargarTurnstile();
  let ultimo = "";
  let avisar: ((t: string) => void)[] = [];
  const listo = (t: string) => {
    ultimo = t;
    const esperando = avisar;
    avisar = [];
    esperando.forEach((f) => f(t));
  };
  const id = api.render(contenedor, {
    sitekey: siteKey,
    theme: opciones.tema ?? "light",
    language: opciones.idioma ?? "es",
    appearance: opciones.apariencia ?? "interaction-only",
    callback: listo,
    "expired-callback": () => (ultimo = ""),
    "error-callback": () => (ultimo = ""),
  });
  const token = () => api.getResponse(id) || ultimo;
  return {
    token,
    esperar: (ms = 15000) => {
      const ya = token();
      if (ya) return Promise.resolve(ya);
      return new Promise<string>((resolver) => {
        const reloj = setTimeout(() => {
          avisar = avisar.filter((f) => f !== fin);
          resolver(token());
        }, ms);
        const fin = (t: string) => {
          clearTimeout(reloj);
          resolver(t);
        };
        avisar.push(fin);
      });
    },
    reiniciar: () => {
      ultimo = "";
      api.reset(id);
    },
  };
}
