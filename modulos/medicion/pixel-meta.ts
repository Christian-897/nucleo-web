/**
 * PÍXEL DE META (Facebook / Instagram), navegador. Opcional: solo lo usa el
 * sitio que lo llama con el identificador de su píxel (15 o 16 dígitos). Usa
 * el MISMO aviso de cookies que Google Analytics: no carga nada hasta que la
 * persona acepta; si después lo rechaza, se revoca y se borran sus cookies.
 *
 * Eventos estándar que manda (para medir y optimizar anuncios):
 *   cada página        → PageView
 *   agregar al carrito → AddToCart
 *   ir a pagar         → InitiateCheckout
 *   compra pagada      → Purchase   (con eventID = número de orden)
 * Nunca se envían datos del comprador (nombre, correo, teléfono, dirección):
 * no se usa la "coincidencia avanzada".
 *
 * No necesita script en línea. CSP del sitio: script-src
 * https://connect.facebook.net; img-src y connect-src https://www.facebook.com.
 */
import { cuandoAcepte } from "./consentimiento";
import { EVENTO_AGREGAR, EVENTO_COMPRA, EVENTO_INICIAR_COMPRA, escucharEventos, type EventoTienda } from "./eventos";
import type { DetalleAgregar, DetalleCompra, DetalleIniciarCompra } from "./eventos";

const ID_PIXEL = /^\d{15,16}$/;

export function idPixelMetaValido(id: unknown): id is string {
  return typeof id === "string" && ID_PIXEL.test(id);
}

export interface OpcionesPixelMeta {
  /** Identificador del píxel (Administrador de eventos → el píxel). */
  id: string;
  /** Moneda de los montos. Por defecto CLP. */
  moneda?: string;
}

type ParamsMeta = Record<string, unknown>;

/**
 * Traduce un evento de la tienda al evento estándar de Meta. Devuelve
 * [nombre, parámetros, eventID?]. Pura (para probar).
 */
export function eventoParaMeta(e: EventoTienda, moneda = "CLP"): [string, ParamsMeta, string?] | null {
  const d = e.detalle as Record<string, unknown> | null;
  if (!d || typeof d !== "object") return null;
  if (e.nombre === EVENTO_AGREGAR) {
    const p = (d as unknown as DetalleAgregar).producto;
    if (!p?.productoId) return null;
    return [
      "AddToCart",
      {
        content_ids: [p.productoId],
        content_name: p.nombre,
        content_type: "product",
        contents: [{ id: p.productoId, quantity: p.cantidad }],
        value: p.precio * p.cantidad,
        currency: moneda,
      },
    ];
  }
  if (e.nombre === EVENTO_INICIAR_COMPRA) {
    const x = d as unknown as DetalleIniciarCompra;
    if (!Array.isArray(x.productos) || !x.productos.length) return null;
    return [
      "InitiateCheckout",
      {
        content_ids: x.productos.map((p) => p.productoId),
        content_type: "product",
        contents: x.productos.map((p) => ({ id: p.productoId, quantity: p.cantidad })),
        num_items: x.productos.reduce((a, p) => a + p.cantidad, 0),
        value: x.total,
        currency: moneda,
      },
    ];
  }
  if (e.nombre === EVENTO_COMPRA) {
    const x = d as unknown as DetalleCompra;
    if (!x.orden) return null;
    const lista = Array.isArray(x.productos) ? x.productos : [];
    const detalle = lista.length
      ? {
          content_ids: lista.map((p) => p.productoId),
          contents: lista.map((p) => ({ id: p.productoId, quantity: p.cantidad })),
          num_items: lista.reduce((a, p) => a + p.cantidad, 0),
        }
      : {};
    return ["Purchase", { value: x.monto, currency: moneda, content_type: "product", ...detalle }, x.orden];
  }
  return null;
}

/** Borra las cookies del píxel (_fbp, _fbc) al rechazar después de aceptar. */
function borrarCookiesMeta(): void {
  const nombres = document.cookie
    .split(";")
    .map((c) => c.split("=")[0].trim())
    .filter((n) => n === "_fbp" || n === "_fbc");
  const partes = location.hostname.split(".");
  const dominios = [location.hostname];
  for (let i = 1; i < partes.length - 1; i++) dominios.push("." + partes.slice(i).join("."));
  for (const n of nombres) {
    document.cookie = `${n}=; Max-Age=0; path=/`;
    for (const d of dominios) document.cookie = `${n}=; Max-Age=0; path=/; domain=${d}`;
  }
}

type Fbq = ((...args: unknown[]) => void) & {
  callMethod?: (...args: unknown[]) => void;
  queue: unknown[][];
  push: Fbq;
  loaded: boolean;
  version: string;
};

let iniciado = false;

/**
 * Conecta el píxel de Meta en la página. Llamarlo una vez por página (en el
 * layout), junto con el aviso de cookies. Con un identificador inválido no
 * hace nada.
 */
export function iniciarPixelMeta(opciones: OpcionesPixelMeta): void {
  if (typeof window === "undefined" || iniciado) return;
  if (!idPixelMetaValido(opciones.id)) {
    console.warn("[medicion] identificador del píxel de Meta inválido: son 15 o 16 dígitos");
    return;
  }
  iniciado = true;
  const id = opciones.id;
  const moneda = opciones.moneda ?? "CLP";
  const w = window as unknown as { fbq?: Fbq; _fbq?: Fbq };
  let cargado = false;
  let revocado = false;

  // El mismo "stub" que trae el código oficial de Meta, sin script en línea:
  // guarda las llamadas en una cola hasta que carga fbevents.js.
  const crearFbq = (): Fbq => {
    const f = function (...args: unknown[]) {
      if (f.callMethod) f.callMethod(...args);
      else f.queue.push(args);
    } as Fbq;
    f.queue = [];
    f.push = f;
    f.loaded = true;
    f.version = "2.0";
    return f;
  };

  cuandoAcepte(
    () => {
      if (cargado) {
        revocado = false;
        w.fbq?.("consent", "grant");
        return;
      }
      cargado = true;
      if (!w.fbq) {
        const f = crearFbq();
        w.fbq = f;
        if (!w._fbq) w._fbq = f;
      }
      const fbq = w.fbq!;
      fbq("init", id);
      fbq("track", "PageView");
      const s = document.createElement("script");
      s.async = true;
      s.src = "https://connect.facebook.net/en_US/fbevents.js";
      document.head.append(s);
      escucharEventos((e) => {
        if (revocado) return;
        const ev = eventoParaMeta(e, moneda);
        if (!ev) return;
        if (ev[2]) fbq("track", ev[0], ev[1], { eventID: ev[2] });
        else fbq("track", ev[0], ev[1]);
      });
    },
    () => {
      revocado = true;
      w.fbq?.("consent", "revoke");
      borrarCookiesMeta();
    }
  );
}
