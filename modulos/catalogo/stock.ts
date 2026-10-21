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
import { buscarColor, idConColor, partirId, tieneColores } from "./colores";
import type { Catalogo } from "./tipos";

export const PREFIJO_VENDIDOS = "catalogo:vendidos:";

async function vendidos(env: EnvBase, id: string): Promise<number> {
  const crudo = await env.REVIEWS_KV?.get(PREFIJO_VENDIDOS + id);
  const n = crudo ? parseInt(crudo, 10) : 0;
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * Producto con el stock disponible de verdad (o null si no existe).
 *  - `prod~color`: ese color como producto propio (nombre "Prod · Color",
 *    su foto y su stock). Color inexistente = null.
 *  - Producto con colores pedido sin color: su stock es la suma de los
 *    colores y lleva `requiereColor: true` (sirve para "agotado" en las
 *    listas, pero el carrito no lo acepta: ver fuenteCarrito).
 */
export async function productoDisponible(
  catalogo: CatalogoODinamico,
  env: EnvBase,
  id: string
): Promise<Producto | null> {
  const vigente: Catalogo = await resolverCatalogo(catalogo, env);
  const { base, color } = partirId(id);
  const p = vigente.buscar(base);
  if (!p) return null;
  if (color !== undefined) {
    const c = buscarColor(p, color);
    if (!c) return null;
    const compuesto = idConColor(p.id, c.id);
    return {
      ...p,
      id: compuesto,
      nombre: `${p.nombre} · ${c.nombre}`,
      imagen: c.mini ?? c.foto ?? p.imagen,
      productoBase: p.id,
      color: c.nombre,
      stock: c.stock === undefined ? undefined : Math.max(0, c.stock - (await vendidos(env, compuesto))),
    };
  }
  if (tieneColores(p)) {
    let total: number | undefined = 0;
    for (const c of p.colores!) {
      if (c.stock === undefined) {
        total = undefined;
        break;
      }
      total += Math.max(0, c.stock - (await vendidos(env, idConColor(p.id, c.id))));
    }
    return { ...p, stock: total, requiereColor: true };
  }
  if (p.stock === undefined) return { ...p };
  return { ...p, stock: Math.max(0, p.stock - (await vendidos(env, id))) };
}

/** Stock de cada color de un producto (null = sin límite). Para la ficha. */
export async function stockDeColores(
  catalogo: CatalogoODinamico,
  env: EnvBase,
  idProducto: string
): Promise<Record<string, number | null>> {
  const p = (await resolverCatalogo(catalogo, env)).buscar(idProducto);
  const salida: Record<string, number | null> = {};
  for (const c of p?.colores ?? []) {
    const compuesto = idConColor(p!.id, c.id);
    salida[compuesto] = c.stock === undefined ? null : Math.max(0, c.stock - (await vendidos(env, compuesto)));
  }
  return salida;
}

/** El stock declarado (antes de descontar ventas) de un id, con o sin color. */
function stockDeclarado(vigente: Catalogo, id: string): { clave: string; limitado: boolean } | null {
  const { base, color } = partirId(id);
  const p = vigente.buscar(base);
  if (!p) return null;
  if (color !== undefined) {
    const c = buscarColor(p, color);
    return c ? { clave: idConColor(p.id, c.id), limitado: c.stock !== undefined } : null;
  }
  if (tieneColores(p)) return null; // sin color no se vende
  return { clave: p.id, limitado: p.stock !== undefined };
}

/** Config del carrito lista para `crearEndpointCarrito((env) => ...)`. */
export function fuenteCarrito(
  catalogo: CatalogoODinamico,
  opciones: { maxPorLinea?: number } = {}
): (env: EnvBase) => ConfigCarritoServidor {
  return (env) => ({
    // Un producto con colores solo se vende eligiendo uno (`prod~color`).
    obtenerProducto: async (id) => {
      const p = await productoDisponible(catalogo, env, id);
      return p && p.requiereColor ? null : p;
    },
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
    const d = stockDeclarado(vigente, l.productoId);
    if (!d || !d.limitado) continue; // sin límite: no se cuenta
    const cantidad = Math.max(0, Math.floor(l.cantidad));
    if (!cantidad) continue;
    const actual = await vendidos(env, d.clave);
    await env.REVIEWS_KV.put(PREFIJO_VENDIDOS + d.clave, String(actual + cantidad));
  }
}

/**
 * Devuelve al stock lo de un pedido anulado (devolución o prueba): resta
 * esas unidades del contador de vendidos, sin bajar de 0. Si el stock se
 * editó en el panel después de la venta (contador en 0), no hay nada que
 * devolver: el número que se escribió ya es el disponible.
 */
export async function devolverUnidades(
  catalogo: CatalogoODinamico,
  env: EnvBase,
  lineas: { productoId: string; cantidad: number }[]
): Promise<void> {
  if (!env.REVIEWS_KV) return;
  const vigente = await resolverCatalogo(catalogo, env);
  for (const l of lineas) {
    const d = stockDeclarado(vigente, l.productoId);
    if (!d || !d.limitado) continue;
    const cantidad = Math.max(0, Math.floor(l.cantidad));
    if (!cantidad) continue;
    const actual = await vendidos(env, d.clave);
    const nuevo = Math.max(0, actual - cantidad);
    if (nuevo === 0) await env.REVIEWS_KV.delete(PREFIJO_VENDIDOS + d.clave);
    else await env.REVIEWS_KV.put(PREFIJO_VENDIDOS + d.clave, String(nuevo));
  }
}

/** Stock disponible de varios productos (para mostrar "agotado"). */
export async function stockDisponible(
  catalogo: CatalogoODinamico,
  env: EnvBase,
  ids: string[]
): Promise<Record<string, number | null>> {
  const salida: Record<string, number | null> = {};
  // 120: una ficha pide los colores de su producto (hasta 100) más algunos relacionados.
  for (const id of ids.slice(0, 120)) {
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
