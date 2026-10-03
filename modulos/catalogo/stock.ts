/**
 * Stock REAL en el servidor: stock inicial del catálogo menos lo vendido,
 * que se lleva en KV. Así el catálogo sigue siendo un archivo simple que se
 * edita a mano, y el stock baja solo con cada pago confirmado.
 *
 * Para reponer stock: subir el número en el catálogo (el contador de
 * vendidos sigue sumando desde donde iba) o borrar la clave
 * `catalogo:vendidos:<id>` en KV para partir de cero.
 *
 * Limitación conocida: KV no es transaccional. Dos compras del último
 * producto en el mismo segundo pueden pasar ambas. Para una tienda chica es
 * aceptable; si se vuelve un problema, el contador se mueve a D1.
 */
import type { EnvBase } from "../../core/tipos";
import type { ConfigCarritoServidor } from "../carrito/config";
import type { Producto } from "../carrito/tipos";
import { type CatalogoODinamico, resolverCatalogo } from "./almacen";

export const PREFIJO_VENDIDOS = "catalogo:vendidos:";

async function vendidos(env: EnvBase, id: string): Promise<number> {
  const crudo = await env.REVIEWS_KV?.get(PREFIJO_VENDIDOS + id);
  const n = crudo ? parseInt(crudo, 10) : 0;
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** Producto con el stock disponible de verdad (o null si no existe). */
export async function productoDisponible(
  catalogo: CatalogoODinamico,
  env: EnvBase,
  id: string
): Promise<Producto | null> {
  const p = (await resolverCatalogo(catalogo, env)).buscar(id);
  if (!p) return null;
  if (p.stock === undefined) return { ...p };
  return { ...p, stock: Math.max(0, p.stock - (await vendidos(env, id))) };
}

/** Config del carrito lista para `crearEndpointCarrito((env) => ...)`. */
export function fuenteCarrito(
  catalogo: CatalogoODinamico,
  opciones: { maxPorLinea?: number } = {}
): (env: EnvBase) => ConfigCarritoServidor {
  return (env) => ({
    obtenerProducto: (id) => productoDisponible(catalogo, env, id),
    maxPorLinea: opciones.maxPorLinea,
  });
}

/** Descuenta lo vendido. Se llama una vez por pedido pagado. */
export async function registrarVenta(
  catalogo: CatalogoODinamico,
  env: EnvBase,
  lineas: { productoId: string; cantidad: number }[]
): Promise<void> {
  if (!env.REVIEWS_KV) return;
  const vigente = await resolverCatalogo(catalogo, env);
  for (const l of lineas) {
    const p = vigente.buscar(l.productoId);
    if (!p || p.stock === undefined) continue; // sin límite: no se cuenta
    const cantidad = Math.max(0, Math.floor(l.cantidad));
    if (!cantidad) continue;
    const actual = await vendidos(env, p.id);
    await env.REVIEWS_KV.put(PREFIJO_VENDIDOS + p.id, String(actual + cantidad));
  }
}

/** Stock disponible de varios productos (para mostrar "agotado"). */
export async function stockDisponible(
  catalogo: CatalogoODinamico,
  env: EnvBase,
  ids: string[]
): Promise<Record<string, number | null>> {
  const salida: Record<string, number | null> = {};
  for (const id of ids.slice(0, 100)) {
    const p = await productoDisponible(catalogo, env, id);
    if (p) salida[id] = p.stock ?? null;
  }
  return salida;
}

/** Cuántas unidades se han vendido (desde la última reposición). */
export async function unidadesVendidas(env: EnvBase, id: string): Promise<number> {
  return vendidos(env, id);
}

/**
 * Repone el stock: el número que se guarda en el catálogo pasa a ser lo
 * disponible desde ahora. Lo usa el panel al editar el stock; sin esto, las
 * ventas anteriores se seguirían restando al número nuevo.
 */
export async function reponerStock(env: EnvBase, id: string): Promise<void> {
  await env.REVIEWS_KV?.delete(PREFIJO_VENDIDOS + id);
}
