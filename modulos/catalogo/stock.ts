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
import { buscarColor, idCompuesto, idConColor, partirId, tieneColores } from "./colores";
import { buscarOpcion, colorEnOpcion, type OpcionProducto, precioDeOpcion, tieneOpciones } from "./opciones";
import type { Catalogo, ProductoCatalogo } from "./tipos";

export const PREFIJO_VENDIDOS = "catalogo:vendidos:";

async function vendidos(env: EnvBase, id: string): Promise<number> {
  const crudo = await env.REVIEWS_KV?.get(PREFIJO_VENDIDOS + id);
  const n = crudo ? parseInt(crudo, 10) : 0;
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** Unidades declaradas de una combinación (undefined = sin límite). */
function declaradoCombinacion(_p: ProductoCatalogo, o: OpcionProducto, color?: string): number | undefined {
  return color !== undefined ? o.stockColores?.[color] : o.stock;
}

/** Todas las combinaciones vendibles de un producto con opciones (filtrando por color u opción si se pide). */
function combinaciones(p: ProductoCatalogo, filtro: { color?: string; opcion?: string } = {}): { o: OpcionProducto; color?: string }[] {
  const salida: { o: OpcionProducto; color?: string }[] = [];
  for (const o of p.opciones ?? []) {
    if (filtro.opcion && o.id !== filtro.opcion) continue;
    if (!tieneColores(p)) {
      salida.push({ o });
      continue;
    }
    for (const c of p.colores!) {
      if (filtro.color && c.id !== filtro.color) continue;
      if (colorEnOpcion(o, c.id)) salida.push({ o, color: c.id });
    }
  }
  return salida;
}

/** Suma de lo disponible en varias combinaciones (undefined si alguna no tiene límite). */
async function sumaCombinaciones(env: EnvBase, p: ProductoCatalogo, lista: { o: OpcionProducto; color?: string }[]): Promise<number | undefined> {
  let total = 0;
  for (const { o, color } of lista) {
    const d = declaradoCombinacion(p, o, color);
    if (d === undefined) return undefined;
    total += Math.max(0, d - (await vendidos(env, idCompuesto(p.id, color, o.id))));
  }
  return total;
}

/**
 * Producto con el stock disponible de verdad (o null si no existe).
 *  - `prod~color`: ese color como producto propio (nombre "Prod · Color",
 *    su foto y su stock). Color inexistente = null.
 *  - `prod~color~opcion` / `prod~~opcion` (v0.40): esa combinación, con el
 *    precio de la opción y sus unidades. Combinación que no existe = null.
 *  - Producto con colores u opciones pedido sin elegir: su stock es la suma
 *    y lleva `requiereColor` / `requiereOpcion` (sirve para "agotado" en las
 *    listas, pero el carrito no lo acepta: ver fuenteCarrito).
 */
export async function productoDisponible(
  catalogo: CatalogoODinamico,
  env: EnvBase,
  id: string
): Promise<Producto | null> {
  const vigente: Catalogo = await resolverCatalogo(catalogo, env);
  const { base, color, opcion } = partirId(id);
  const p = vigente.buscar(base);
  if (!p) return null;

  if (tieneOpciones(p)) {
    const o = opcion !== undefined ? buscarOpcion(p, opcion) : undefined;
    if (opcion !== undefined && !o) return null;
    const c = color !== undefined ? buscarColor(p, color) : undefined;
    if (color !== undefined && (!c || (o && !colorEnOpcion(o, c.id)))) return null;
    // Combinación completa: se vende.
    if (o && (c || !tieneColores(p))) {
      const compuesto = idCompuesto(p.id, c?.id, o.id);
      const declarado = declaradoCombinacion(p, o, c?.id);
      return {
        ...p,
        id: compuesto,
        nombre: c ? `${p.nombre} · ${o.nombre} · ${c.nombre}` : `${p.nombre} · ${o.nombre}`,
        precio: precioDeOpcion(p, o),
        imagen: c ? c.mini ?? c.foto ?? p.imagen : p.imagen,
        productoBase: p.id,
        opcion: o.nombre,
        ...(c ? { color: c.nombre } : {}),
        stock: declarado === undefined ? undefined : Math.max(0, declarado - (await vendidos(env, compuesto))),
      };
    }
    // Falta elegir: la suma de lo que calza (para "agotado"), pero no se vende.
    const stock = await sumaCombinaciones(env, p, combinaciones(p, { color: c?.id, opcion: o?.id }));
    return { ...p, ...(o ? { precio: precioDeOpcion(p, o) } : {}), stock, requiereOpcion: !o, requiereColor: tieneColores(p) && !c };
  }

  if (opcion !== undefined) return null;
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

/**
 * Stock de cada combinación de un producto (null = sin límite). Para la ficha.
 * Con opciones, las claves son `prod~color~opcion` (o `prod~~opcion`); si no, `prod~color`.
 */
export async function stockDeColores(
  catalogo: CatalogoODinamico,
  env: EnvBase,
  idProducto: string
): Promise<Record<string, number | null>> {
  const p = (await resolverCatalogo(catalogo, env)).buscar(idProducto);
  const salida: Record<string, number | null> = {};
  if (p && tieneOpciones(p)) {
    for (const { o, color } of combinaciones(p)) {
      const compuesto = idCompuesto(p.id, color, o.id);
      const d = declaradoCombinacion(p, o, color);
      salida[compuesto] = d === undefined ? null : Math.max(0, d - (await vendidos(env, compuesto)));
    }
    return salida;
  }
  for (const c of p?.colores ?? []) {
    const compuesto = idConColor(p!.id, c.id);
    salida[compuesto] = c.stock === undefined ? null : Math.max(0, c.stock - (await vendidos(env, compuesto)));
  }
  return salida;
}

/** El stock declarado (antes de descontar ventas) de un id, con o sin color u opción. */
function stockDeclarado(vigente: Catalogo, id: string): { clave: string; limitado: boolean } | null {
  const { base, color, opcion } = partirId(id);
  const p = vigente.buscar(base);
  if (!p) return null;
  if (tieneOpciones(p)) {
    const o = opcion !== undefined ? buscarOpcion(p, opcion) : undefined;
    if (!o) return null; // sin opción no se vende
    if (tieneColores(p)) {
      const c = color !== undefined ? buscarColor(p, color) : undefined;
      if (!c || !colorEnOpcion(o, c.id)) return null;
      return { clave: idCompuesto(p.id, c.id, o.id), limitado: o.stockColores?.[c.id] !== undefined };
    }
    if (color !== undefined) return null;
    return { clave: idCompuesto(p.id, undefined, o.id), limitado: o.stock !== undefined };
  }
  if (opcion !== undefined) return null;
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
    // Un producto con colores u opciones solo se vende eligiendo (`prod~color`, `prod~color~opcion`).
    obtenerProducto: async (id) => {
      const p = await productoDisponible(catalogo, env, id);
      return p && (p.requiereColor || p.requiereOpcion) ? null : p;
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
