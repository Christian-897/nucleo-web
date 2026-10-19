/**
 * PEDIDOS DESDE EL PANEL: ver las ventas (con datos de despacho), marcar
 * las enviadas y ANULAR (devolución o pedido de prueba). Lee los registros
 * que guarda el módulo `pago` y la metadata que deja `compra`. Datos
 * personales: solo con sesión.
 *
 * Anular (solo el DUEÑO del panel, nunca un invitado):
 *  - el pedido deja de contar en las ventas del Resumen (metricas.quitarPedido),
 *  - sus productos vuelven al stock (si la venta se había descontado),
 *  - queda en la lista marcado "Anulado" con fecha y quién lo hizo.
 * El dinero NO se devuelve solo: eso se hace en Flow o Mercado Pago.
 * Borrar: solo un pedido ya anulado; lo saca de la lista para siempre.
 */
import type { CatalogoODinamico } from "../catalogo/almacen";
import { devolverUnidades } from "../catalogo/stock";
import { quitarPedido } from "../metricas/almacen";
import type { PedidoGuardado } from "../pago/config";
import { esDueno, obtenerUsuario } from "./auth";
import { type Ctx, exigirSesion, jsonResponse, leerJson } from "./http";

const PREFIJO_PEDIDO = "pago:pedido:";
const CLAVE_ENVIO = (orden: string) => `compra:envio:${orden}`;
const CLAVE_ANULADO = (orden: string) => `compra:anulado:${orden}`;
/** La deja `compra` cuando descontó el stock de un pedido pagado. */
const CLAVE_PROCESADO = (orden: string) => `compra:procesado:${orden}`;

export interface AnulacionPedido {
  fecha: string;
  por: string;
  /** Si se devolvieron unidades al stock. */
  stockDevuelto: boolean;
}
const ORDEN_VALIDA = /^[A-Za-z0-9_-]{1,64}$/;
const MAXIMO = 300;

export interface PedidoPanel {
  orden: string;
  creado: string;
  estado: string;
  monto: number;
  proveedor: string;
  email: string;
  comprador?: Record<string, unknown>;
  lineas?: { nombre: string; cantidad: number; subtotal: number }[];
  requiereDespacho?: boolean;
  tieneDigitales?: boolean;
  /** Lo que se cobró de despacho (módulo despacho). */
  despacho?: { forma: string; costo: number; zona?: string; gratisPorMonto?: boolean; retiro?: { nombre: string; comuna: string } };
  enviado: string | null;
  /** Anulado desde el panel (devolución o prueba). null si no. */
  anulado: AnulacionPedido | null;
}

async function leerAnulacion(kv: NonNullable<Ctx["env"]["REVIEWS_KV"]>, orden: string): Promise<AnulacionPedido | null> {
  const crudo = await kv.get(CLAVE_ANULADO(orden));
  if (!crudo) return null;
  try {
    const a = JSON.parse(crudo) as AnulacionPedido;
    return typeof a?.fecha === "string" ? a : null;
  } catch {
    return null;
  }
}

export async function listarPedidos(ctx: Ctx, incluirNoPagados: boolean): Promise<PedidoPanel[]> {
  const kv = ctx.env.REVIEWS_KV;
  if (!kv) return [];
  const { keys } = await kv.list({ prefix: PREFIJO_PEDIDO, limit: 1000 });
  const salida: PedidoPanel[] = [];
  for (const { name } of keys.slice(0, MAXIMO)) {
    const crudo = await kv.get(name);
    if (!crudo) continue;
    let p: PedidoGuardado;
    try {
      p = JSON.parse(crudo);
    } catch {
      continue;
    }
    if (!incluirNoPagados && p.estado !== "pagada" && p.estado !== "en-revision") continue;
    const meta = (p.metadata ?? {}) as Record<string, unknown>;
    const lineas = Array.isArray(meta.lineas)
      ? (meta.lineas as Record<string, unknown>[]).map((l) => ({
          nombre: String(l.nombre ?? ""),
          cantidad: Number(l.cantidad ?? 0),
          subtotal: Number(l.subtotal ?? 0),
        }))
      : undefined;
    salida.push({
      orden: p.orden,
      creado: p.creado,
      estado: p.estado,
      monto: p.monto,
      proveedor: p.proveedor,
      email: p.email,
      comprador: (meta.comprador as Record<string, unknown>) ?? undefined,
      lineas,
      requiereDespacho: meta.requiereDespacho === true,
      tieneDigitales: meta.tieneDigitales === true,
      ...(meta.despacho && typeof meta.despacho === "object" ? { despacho: meta.despacho as PedidoPanel["despacho"] } : {}),
      enviado: await kv.get(CLAVE_ENVIO(p.orden)),
      anulado: await leerAnulacion(kv, p.orden),
    });
  }
  return salida.sort((a, b) => b.creado.localeCompare(a.creado));
}

export function crearGestionPedidos(retencionDias = 90, catalogo?: CatalogoODinamico) {
  const retencion = retencionDias * 86400;

  async function anular(ctx: Ctx, orden: string, usuario: string): Promise<Response> {
    const kv = ctx.env.REVIEWS_KV!;
    const crudo = await kv.get(PREFIJO_PEDIDO + orden);
    if (!crudo) return jsonResponse(404, { message: "Ese pedido no existe." });
    if (await kv.get(CLAVE_ANULADO(orden))) return jsonResponse(409, { message: "Ese pedido ya estaba anulado." });
    let p: PedidoGuardado;
    try {
      p = JSON.parse(crudo);
    } catch {
      return jsonResponse(500, { message: "No se pudo leer el pedido." });
    }
    const meta = (p.metadata ?? {}) as Record<string, unknown>;
    const lineas = Array.isArray(meta.lineas) ? (meta.lineas as Record<string, unknown>[]) : [];
    // La marca va PRIMERO: si algo falla después, el pedido igual queda
    // anulado y nunca se devuelve el stock dos veces.
    const descontado = Boolean(await kv.get(CLAVE_PROCESADO(orden)));
    const anulacion: AnulacionPedido = { fecha: new Date().toISOString(), por: usuario, stockDevuelto: descontado && Boolean(catalogo) };
    await kv.put(CLAVE_ANULADO(orden), JSON.stringify(anulacion), { expirationTtl: retencion });
    if (anulacion.stockDevuelto && catalogo) {
      try {
        await devolverUnidades(
          catalogo,
          ctx.env,
          lineas.map((l) => ({ productoId: String(l.productoId ?? ""), cantidad: Number(l.cantidad ?? 0) }))
        );
      } catch (e) {
        console.error("[panel] no se pudo devolver el stock del pedido anulado", e);
      }
    }
    try {
      await quitarPedido(kv, {
        orden: p.orden,
        creado: p.creado,
        monto: p.monto,
        proveedor: p.proveedor,
        lineas: lineas.map((l) => ({ nombre: String(l.nombre ?? ""), cantidad: Number(l.cantidad ?? 0), subtotal: Number(l.subtotal ?? 0) })),
      });
    } catch (e) {
      console.error("[panel] no se pudo sacar el pedido anulado de las ventas", e);
    }
    return jsonResponse(200, { ok: true, anulado: anulacion });
  }

  async function borrar(ctx: Ctx, orden: string): Promise<Response> {
    const kv = ctx.env.REVIEWS_KV!;
    if (!(await kv.get(PREFIJO_PEDIDO + orden))) return jsonResponse(404, { message: "Ese pedido no existe." });
    if (!(await kv.get(CLAVE_ANULADO(orden)))) {
      return jsonResponse(409, { message: "Primero anula el pedido. Solo se pueden borrar pedidos anulados." });
    }
    // La marca de métricas (anulado) se deja: así nunca vuelve a sumarse.
    await kv.delete(PREFIJO_PEDIDO + orden);
    await kv.delete(CLAVE_ENVIO(orden));
    await kv.delete(CLAVE_ANULADO(orden));
    return jsonResponse(200, { ok: true });
  }

  return {
    async get(ctx: Ctx): Promise<Response> {
      const s = await exigirSesion(ctx, false);
      if (s instanceof Response) return s;
      const todos = new URL(ctx.request.url).searchParams.get("todos") === "1";
      const dueno = esDueno(await obtenerUsuario(ctx.env, s.usuario));
      return jsonResponse(200, { pedidos: await listarPedidos(ctx, todos), puedeAnular: dueno });
    },
    async post(ctx: Ctx): Promise<Response> {
      const s = await exigirSesion(ctx, true);
      if (s instanceof Response) return s;
      const cuerpo = await leerJson(ctx.request);
      const orden = cuerpo?.orden;
      const accion = cuerpo?.accion;
      if (typeof orden !== "string" || !ORDEN_VALIDA.test(orden) || !["marcar-enviado", "anular", "borrar"].includes(String(accion))) {
        return jsonResponse(400, { message: "Solicitud inválida." });
      }
      const kv = ctx.env.REVIEWS_KV;
      if (!kv) return jsonResponse(503, { message: "Falta el almacenamiento (KV) en Cloudflare." });
      if (accion === "anular" || accion === "borrar") {
        // Hacer desaparecer ventas es solo del dueño: un invitado no puede.
        if (!esDueno(await obtenerUsuario(ctx.env, s.usuario))) {
          return jsonResponse(403, { message: "Solo el dueño del panel puede anular o borrar pedidos." });
        }
        return accion === "anular" ? anular(ctx, orden, s.usuario) : borrar(ctx, orden);
      }
      if (!(await kv.get(PREFIJO_PEDIDO + orden))) return jsonResponse(404, { message: "Ese pedido no existe." });
      if (cuerpo!.enviado === false) {
        await kv.delete(CLAVE_ENVIO(orden));
        return jsonResponse(200, { ok: true, enviado: null });
      }
      const fecha = new Date().toISOString();
      await kv.put(CLAVE_ENVIO(orden), fecha, { expirationTtl: retencion });
      return jsonResponse(200, { ok: true, enviado: fecha });
    },
  };
}
