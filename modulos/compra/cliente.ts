/**
 * Cliente headless de la compra. Valida los datos del comprador con el
 * mismo esquema del servidor (errores por campo al instante) y luego
 * inicia el pago. Ningún precio sale de acá: el servidor recalcula todo.
 */
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
  return items.some((i) => tipos[i.productoId] !== "digital");
}

export async function iniciarCompra(params: {
  items: ItemCarrito[];
  comprador: Record<string, unknown>;
  tipos: Record<string, "fisico" | "digital">;
  proveedor?: Proveedor;
  endpoint?: string;
}): Promise<ResultadoCompra> {
  if (!params.items.length) return { ok: false, message: "Tu carrito está vacío." };
  const despacho = necesitaDespacho(params.items, params.tipos);
  const v = validarComprador(params.comprador, despacho);
  if (!v.ok) {
    return { ok: false, message: "Revisa los campos marcados.", fieldErrors: v.fieldErrors };
  }
  const r = await irAPagar(
    {
      proveedor: params.proveedor,
      items: params.items.map((i) => ({ productoId: i.productoId, cantidad: i.cantidad })),
      comprador: v.datos,
    },
    { endpoint: params.endpoint }
  );
  return { ok: r.ok, message: r.message };
}
