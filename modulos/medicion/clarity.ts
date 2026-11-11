/**
 * MICROSOFT CLARITY (navegador). Opcional: solo lo usa el sitio que lo llama
 * con el ID de su proyecto (Clarity → Configuración → Información general,
 * unas 10 letras y números en minúscula). Usa el MISMO aviso de cookies que
 * Google Analytics: no carga nada hasta que la persona acepta; si después lo
 * rechaza, se le avisa a Clarity (deja de grabar) y se borran sus cookies.
 *
 * Clarity muestra mapas de calor (dónde tocan y hasta dónde bajan) y
 * grabaciones anónimas de las visitas. Además se marcan las visitas con los
 * momentos de la tienda, para filtrar las grabaciones:
 *   agregar al carrito → evento "agregar_carrito"
 *   ir a pagar         → evento "ir_a_pagar"
 *   compra pagada      → evento "compra"
 * Nunca se envían datos del comprador. Clarity oculta por defecto lo que se
 * escribe en los formularios (configurar el enmascaramiento en «Equilibrado»
 * o «Estricto», nunca «Relajado»).
 *
 * No necesita script en línea. CSP del sitio: script-src
 * https://www.clarity.ms https://*.clarity.ms; connect-src e img-src
 * https://*.clarity.ms https://c.bing.com. Ver README.
 */
import { cuandoAcepte } from "./consentimiento";
import { EVENTO_AGREGAR, EVENTO_COMPRA, EVENTO_INICIAR_COMPRA, escucharEventos, type EventoTienda } from "./eventos";

const ID_CLARITY = /^[a-z0-9]{8,14}$/;

export function idClarityValido(id: unknown): id is string {
  return typeof id === "string" && ID_CLARITY.test(id);
}

export interface OpcionesClarity {
  /** ID del proyecto de Clarity, por ejemplo "abc12defgh". */
  id: string;
}

/** Traduce un evento de la tienda al evento de Clarity (solo el nombre). Pura (para probar). */
export function eventoParaClarity(e: EventoTienda): string | null {
  if (e.nombre === EVENTO_AGREGAR) return "agregar_carrito";
  if (e.nombre === EVENTO_INICIAR_COMPRA) return "ir_a_pagar";
  if (e.nombre === EVENTO_COMPRA) return "compra";
  return null;
}

/** Borra las cookies de Clarity del sitio (al rechazar después de aceptar). */
function borrarCookiesClarity(): void {
  const nombres = document.cookie
    .split(";")
    .map((c) => c.split("=")[0].trim())
    .filter((n) => n === "_clck" || n === "_clsk");
  const partes = location.hostname.split(".");
  const dominios = [location.hostname];
  for (let i = 1; i < partes.length - 1; i++) dominios.push("." + partes.slice(i).join("."));
  for (const n of nombres) {
    document.cookie = `${n}=; Max-Age=0; path=/`;
    for (const d of dominios) document.cookie = `${n}=; Max-Age=0; path=/; domain=${d}`;
  }
}

let iniciado = false;

/**
 * Conecta Clarity en la página. Llamarlo una vez por página (en el layout),
 * junto con `iniciarAvisoCookies()`. Con un ID inválido no hace nada.
 */
export function iniciarClarity(opciones: OpcionesClarity): void {
  if (typeof window === "undefined" || iniciado) return;
  if (!idClarityValido(opciones.id)) {
    console.warn("[medicion] ID de Clarity inválido: debe ser como abc12defgh (minúsculas y números)");
    return;
  }
  iniciado = true;
  const id = opciones.id;
  type FnClarity = ((...args: unknown[]) => void) & { q?: unknown[] };
  const w = window as unknown as Record<string, unknown> & { clarity?: FnClarity };
  let cargado = false;
  let activo = false;

  // La misma cola que arma el código oficial de Clarity: guarda las llamadas
  // hasta que el script termina de cargar.
  const clarity = (...args: unknown[]) => {
    if (!w.clarity) {
      const f: FnClarity = function (...a: unknown[]) {
        (f.q = f.q || []).push(a);
      };
      w.clarity = f;
    }
    w.clarity(...args);
  };

  cuandoAcepte(
    () => {
      activo = true;
      if (!cargado) {
        cargado = true;
        clarity("consentv2", { ad_Storage: "denied", analytics_Storage: "granted" });
        const s = document.createElement("script");
        s.async = true;
        s.src = `https://www.clarity.ms/tag/${encodeURIComponent(id)}`;
        document.head.append(s);
        escucharEventos((e) => {
          if (!activo) return;
          const nombre = eventoParaClarity(e);
          if (nombre) clarity("event", nombre);
        });
      } else {
        clarity("consentv2", { ad_Storage: "denied", analytics_Storage: "granted" });
      }
    },
    () => {
      activo = false;
      clarity("consentv2", { ad_Storage: "denied", analytics_Storage: "denied" });
      borrarCookiesClarity();
    }
  );
}
