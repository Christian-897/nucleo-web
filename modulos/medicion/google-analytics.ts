/**
 * GOOGLE ANALYTICS 4 (navegador). Opcional: solo lo usa el sitio que lo
 * llama con su ID de medición (`G-…`). No carga nada hasta que la persona
 * acepta en el aviso de cookies; si después lo rechaza, se apaga y se borran
 * sus cookies.
 *
 * Mide las visitas (lo hace Google solo) y tres momentos de la tienda, que
 * emiten el carrito y la compra (ver eventos.ts):
 *   agregar al carrito → add_to_cart
 *   ir a pagar         → begin_checkout
 *   compra pagada      → purchase   (desde la página de retorno del pago)
 * Nunca se envían datos del comprador (nombre, correo, dirección, teléfono).
 *
 * No necesita script en línea: funciona con la CSP del sitio si permite
 * https://www.googletagmanager.com (script-src) y los dominios de Google
 * Analytics (connect-src, img-src). Ver README.
 */
import { cuandoAcepte } from "./consentimiento";
import { EVENTO_AGREGAR, EVENTO_COMPRA, EVENTO_INICIAR_COMPRA, escucharEventos, type EventoTienda } from "./eventos";
import type { DetalleAgregar, DetalleCompra, DetalleIniciarCompra, ProductoMedido } from "./eventos";

const ID_GOOGLE = /^G-[A-Z0-9]{4,15}$/;

export function idGoogleAnalyticsValido(id: unknown): id is string {
  return typeof id === "string" && ID_GOOGLE.test(id);
}

export interface OpcionesGoogleAnalytics {
  /** ID de medición del flujo web, por ejemplo "G-ABC123XYZ9". */
  id: string;
  /** Moneda de los montos. Por defecto CLP. */
  moneda?: string;
}

type ParamsGoogle = Record<string, unknown>;

function itemsGoogle(productos: ProductoMedido[]) {
  return productos.map((p) => ({ item_id: p.productoId, item_name: p.nombre, price: p.precio, quantity: p.cantidad }));
}

/** Traduce un evento de la tienda al evento de Google. Pura (para probar). */
export function eventoParaGoogle(e: EventoTienda, moneda = "CLP"): [string, ParamsGoogle] | null {
  const d = e.detalle as Record<string, unknown> | null;
  if (!d || typeof d !== "object") return null;
  if (e.nombre === EVENTO_AGREGAR) {
    const p = (d as unknown as DetalleAgregar).producto;
    if (!p?.productoId) return null;
    return ["add_to_cart", { currency: moneda, value: p.precio * p.cantidad, items: itemsGoogle([p]) }];
  }
  if (e.nombre === EVENTO_INICIAR_COMPRA) {
    const x = d as unknown as DetalleIniciarCompra;
    if (!Array.isArray(x.productos) || !x.productos.length) return null;
    return ["begin_checkout", { currency: moneda, value: x.total, items: itemsGoogle(x.productos) }];
  }
  if (e.nombre === EVENTO_COMPRA) {
    const x = d as unknown as DetalleCompra;
    if (!x.orden) return null;
    return ["purchase", { transaction_id: x.orden, currency: moneda, value: x.monto }];
  }
  return null;
}

/** Borra las cookies de Google Analytics del sitio (al rechazar después de aceptar). */
function borrarCookiesGoogle(): void {
  const nombres = document.cookie
    .split(";")
    .map((c) => c.split("=")[0].trim())
    .filter((n) => n === "_ga" || n.startsWith("_ga_") || n === "_gid" || n === "_gat");
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
 * Conecta Google Analytics en la página. Llamarlo una vez por página (en el
 * layout), junto con `iniciarAvisoCookies()`. Con un ID inválido no hace nada.
 */
export function iniciarGoogleAnalytics(opciones: OpcionesGoogleAnalytics): void {
  if (typeof window === "undefined" || iniciado) return;
  if (!idGoogleAnalyticsValido(opciones.id)) {
    console.warn("[medicion] ID de Google Analytics inválido: debe ser como G-ABC123XYZ9");
    return;
  }
  iniciado = true;
  const id = opciones.id;
  const moneda = opciones.moneda ?? "CLP";
  const w = window as unknown as Record<string, unknown> & { dataLayer?: unknown[] };
  let cargado = false;

  w.dataLayer = w.dataLayer || [];
  // Google espera el objeto `arguments` (no un arreglo): por eso una función clásica.
  function gtag(..._args: unknown[]) {
    // eslint-disable-next-line prefer-rest-params
    (w.dataLayer as unknown[]).push(arguments);
  }

  cuandoAcepte(
    () => {
      w[`ga-disable-${id}`] = false;
      if (cargado) return;
      cargado = true;
      gtag("js", new Date());
      gtag("config", id);
      const s = document.createElement("script");
      s.async = true;
      s.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`;
      document.head.append(s);
      escucharEventos((e) => {
        if (w[`ga-disable-${id}`] === true) return;
        const ev = eventoParaGoogle(e, moneda);
        if (ev) gtag("event", ev[0], ev[1]);
      });
    },
    () => {
      w[`ga-disable-${id}`] = true;
      borrarCookiesGoogle();
    }
  );
}
