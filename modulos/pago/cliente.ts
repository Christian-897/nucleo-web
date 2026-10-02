/**
 * Cliente headless del pago. El navegador no calcula montos ni firma nada:
 * pide iniciar el pago con el proveedor elegido y lo redirige.
 */
import type { Proveedor } from "./tipos";

export interface ResultadoIniciarPago {
  ok: boolean;
  message?: string;
}

/**
 * Inicia el pago y redirige al proveedor. `datos` es lo que el sitio
 * necesite en `prepararPedido` (ej. items del carrito y email). Lo que se
 * mande acá NO es confiable: el servidor recalcula todo.
 */
export async function irAPagar(
  datos: { proveedor?: Proveedor; [k: string]: unknown } = {},
  opciones: { endpoint?: string } = {}
): Promise<ResultadoIniciarPago> {
  const endpoint = opciones.endpoint ?? "/api/pago/iniciar";
  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(datos),
    });
    const cuerpo = (await res.json().catch(() => ({}))) as {
      redirectUrl?: string;
      message?: string;
    };
    // Solo se redirige a HTTPS de los proveedores conocidos.
    if (res.ok && cuerpo.redirectUrl && destinoPermitido(cuerpo.redirectUrl)) {
      window.location.href = cuerpo.redirectUrl;
      return { ok: true };
    }
    return { ok: false, message: cuerpo.message ?? "No se pudo iniciar el pago." };
  } catch {
    return { ok: false, message: "No hay conexión. Intenta nuevamente." };
  }
}

const DOMINIOS_PAGO = [
  "flow.cl",
  "mercadopago.cl",
  "mercadopago.com",
  "mercadolibre.com",
];

/** Evita que una respuesta manipulada mande al comprador a un sitio falso. */
export function destinoPermitido(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:") return false;
    return DOMINIOS_PAGO.some(
      (d) => u.hostname === d || u.hostname.endsWith(`.${d}`)
    );
  } catch {
    return false;
  }
}
