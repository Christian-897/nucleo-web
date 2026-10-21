/**
 * Cliente headless de la compra. Valida los datos del comprador con el
 * mismo esquema del servidor (errores por campo al instante) y luego
 * inicia el pago. Ningún precio sale de acá: el servidor recalcula todo.
 */
import { idBase } from "../catalogo/colores";
import { irAPagar } from "../pago/cliente";
import type { Proveedor } from "../pago/tipos";
import type { ItemCarrito } from "../carrito/tipos";
import { validarComprador } from "./esquema";

export interface ResultadoCompra {
  ok: boolean;
  message?: string;
  fieldErrors?: Record<string, string[]>;
}

/** ¿Algún producto del carrito necesita despacho? */
export function necesitaDespacho(
  items: Pick<ItemCarrito, "productoId">[],
  tipos: Record<string, "fisico" | "digital">
): boolean {
  // Si no se conoce el tipo, se pide dirección: más vale de más que de menos.
  // Un color (`prod~rojo`) tiene el tipo de su producto.
  return items.some((i) => tipos[idBase(i.productoId)] !== "digital");
}

export async function iniciarCompra(params: {
  items: ItemCarrito[];
  comprador: Record<string, unknown>;
  tipos: Record<string, "fisico" | "digital">;
  proveedor?: Proveedor;
  endpoint?: string;
  /** El total que la persona vio en pantalla. Si no calza con el del servidor, no se cobra. */
  totalVisto?: number;
  /** Cómo quiere recibir y pagar: "ahora" (despacho con la compra), "al-recibir" o "retiro" (sin dirección). */
  formaDespacho?: "ahora" | "al-recibir" | "retiro";
}): Promise<ResultadoCompra> {
  if (!params.items.length) return { ok: false, message: "Tu carrito está vacío." };
  // En el retiro no se pide dirección (el servidor confirma que el retiro esté ofrecido).
  const despacho = necesitaDespacho(params.items, params.tipos) && params.formaDespacho !== "retiro";
  const v = validarComprador(params.comprador, despacho);
  if (!v.ok) {
    return { ok: false, message: "Revisa los campos marcados.", fieldErrors: v.fieldErrors };
  }
  const r = await irAPagar(
    {
      proveedor: params.proveedor,
      items: params.items.map((i) => ({ productoId: i.productoId, cantidad: i.cantidad })),
      comprador: v.datos,
      ...(typeof params.totalVisto === "number" ? { totalVisto: params.totalVisto } : {}),
      ...(params.formaDespacho ? { formaDespacho: params.formaDespacho } : {}),
    },
    { endpoint: params.endpoint }
  );
  return { ok: r.ok, message: r.message };
}
