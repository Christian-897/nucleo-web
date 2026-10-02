/**
 * MOTOR del carrito (lado servidor). Su única responsabilidad crítica:
 * recalcular el carrito desde la fuente REAL de productos. El precio y el
 * stock jamás se toman de lo que manda el navegador — si no, cualquiera
 * editaría el precio a $1 en las herramientas del navegador. Acá se
 * reconstruye cada línea desde `obtenerProducto`.
 */
import { isSameOrigin, jsonResponse } from "../../core/seguridad";
import type { EnvBase } from "../../core/tipos";
import {
  type ConfigCarritoServidor,
  MAX_POR_LINEA_POR_DEFECTO,
} from "./config";
import type {
  CarritoValidado,
  LineaCarritoEntrada,
  LineaValidada,
  ProblemaCarrito,
} from "./tipos";

/** Junta entradas repetidas del mismo producto y limpia lo que no sirve. */
function normalizarEntradas(
  entradas: unknown
): { productoId: string; cantidad: number }[] {
  if (!Array.isArray(entradas)) return [];
  const mapa = new Map<string, number>();
  for (const cruda of entradas) {
    if (!cruda || typeof cruda !== "object") continue;
    const id = (cruda as { productoId?: unknown }).productoId;
    const cant = (cruda as { cantidad?: unknown }).cantidad;
    if (typeof id !== "string" || id.length === 0 || id.length > 200) continue;
    const n = Number(cant);
    if (!Number.isFinite(n)) continue;
    mapa.set(id, (mapa.get(id) ?? 0) + n);
  }
  return [...mapa.entries()].map(([productoId, cantidad]) => ({
    productoId,
    cantidad,
  }));
}

/**
 * Recalcula el carrito contra la fuente real. Devuelve las líneas con el
 * precio autoritativo, el total, y los problemas (producto que ya no
 * existe, sin stock, cantidad ajustada) para que la cara los muestre.
 */
export async function validarCarrito(
  entradas: LineaCarritoEntrada[] | unknown,
  config: ConfigCarritoServidor
): Promise<CarritoValidado> {
  const max = config.maxPorLinea ?? MAX_POR_LINEA_POR_DEFECTO;
  const items = normalizarEntradas(entradas);

  const lineas: LineaValidada[] = [];
  const problemas: ProblemaCarrito[] = [];

  for (const { productoId, cantidad } of items) {
    // Cantidad debe ser entero >= 1.
    if (!Number.isInteger(cantidad) || cantidad < 1) {
      problemas.push({
        productoId,
        tipo: "cantidad-invalida",
        mensaje: "La cantidad no es válida.",
      });
      continue;
    }

    const producto = await config.obtenerProducto(productoId);
    if (
      !producto ||
      typeof producto.precio !== "number" ||
      !Number.isFinite(producto.precio) ||
      producto.precio < 0
    ) {
      problemas.push({
        productoId,
        tipo: "no-existe",
        mensaje: "Este producto ya no está disponible.",
      });
      continue;
    }

    let cantidadFinal = cantidad;

    // Tope por línea.
    if (cantidadFinal > max) {
      cantidadFinal = max;
      problemas.push({
        productoId,
        tipo: "cantidad-invalida",
        mensaje: `El máximo por producto es ${max}.`,
      });
    }

    // Stock, si el producto lo declara.
    if (typeof producto.stock === "number") {
      if (producto.stock <= 0) {
        problemas.push({
          productoId,
          tipo: "sin-stock",
          mensaje: "Sin stock disponible.",
          cantidadDisponible: 0,
        });
        continue;
      }
      if (cantidadFinal > producto.stock) {
        cantidadFinal = producto.stock;
        problemas.push({
          productoId,
          tipo: "stock-ajustado",
          mensaje: `Solo quedan ${producto.stock}. Ajustamos la cantidad.`,
          cantidadDisponible: producto.stock,
        });
      }
    }

    const precioUnitario = Math.round(producto.precio);
    lineas.push({
      productoId,
      nombre: producto.nombre,
      precioUnitario,
      cantidad: cantidadFinal,
      subtotal: precioUnitario * cantidadFinal,
    });
  }

  const total = lineas.reduce((acc, l) => acc + l.subtotal, 0);
  const cantidadTotal = lineas.reduce((acc, l) => acc + l.cantidad, 0);

  return {
    lineas,
    total,
    cantidadTotal,
    problemas,
    listoParaPagar: problemas.length === 0 && lineas.length > 0,
  };
}

interface PagesContext {
  request: Request;
  env: EnvBase;
}

/**
 * Procesa POST /api/carrito: recibe { items: [{productoId, cantidad}] } y
 * devuelve el carrito validado. El `env` queda disponible por si la fuente
 * de productos vive en KV/D1 (el sitio lo usa dentro de obtenerProducto).
 */
export async function procesarValidacion(
  request: Request,
  config: ConfigCarritoServidor
): Promise<Response> {
  if (!isSameOrigin(request)) {
    return jsonResponse(403, { message: "Origen no permitido." });
  }
  let cuerpo: { items?: unknown };
  try {
    cuerpo = (await request.json()) as { items?: unknown };
  } catch {
    return jsonResponse(400, { message: "Cuerpo inválido." });
  }
  const validado = await validarCarrito(cuerpo.items, config);
  return jsonResponse(200, validado as unknown as Record<string, unknown>);
}

export type { PagesContext };
