/**
 * PEDIDOS DESDE EL PANEL: ver las ventas (con datos de despacho) y marcar
 * las enviadas. Lee los registros que guarda el módulo `pago` y la
 * metadata que deja `compra`. Datos personales: solo con sesión.
 */
import type { PedidoGuardado } from "../pago/config";
import { type Ctx, exigirSesion, jsonResponse, leerJson } from "./http";

const PREFIJO_PEDIDO = "pago:pedido:";
const CLAVE_ENVIO = (orden: string) => `compra:envio:${orden}`;
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
  enviado: string | null;
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
      enviado: await kv.get(CLAVE_ENVIO(p.orden)),
    });
  }
  return salida.sort((a, b) => b.creado.localeCompare(a.creado));
}

export function crearGestionPedidos(retencionDias = 90) {
  return {
    async get(ctx: Ctx): Promise<Response> {
      const s = await exigirSesion(ctx, false);
      if (s instanceof Response) return s;
      const todos = new URL(ctx.request.url).searchParams.get("todos") === "1";
      return jsonResponse(200, { pedidos: await listarPedidos(ctx, todos) });
    },
    async post(ctx: Ctx): Promise<Response> {
      const s = await exigirSesion(ctx, true);
      if (s instanceof Response) return s;
      const cuerpo = await leerJson(ctx.request);
      const orden = cuerpo?.orden;
      if (cuerpo?.accion !== "marcar-enviado" || typeof orden !== "string" || !ORDEN_VALIDA.test(orden)) {
        return jsonResponse(400, { message: "Solicitud inválida." });
      }
      const kv = ctx.env.REVIEWS_KV;
      if (!kv || !(await kv.get(PREFIJO_PEDIDO + orden))) return jsonResponse(404, { message: "Ese pedido no existe." });
      if (cuerpo.enviado === false) {
        await kv.delete(CLAVE_ENVIO(orden));
        return jsonResponse(200, { ok: true, enviado: null });
      }
      const fecha = new Date().toISOString();
      await kv.put(CLAVE_ENVIO(orden), fecha, { expirationTtl: retencionDias * 86400 });
      return jsonResponse(200, { ok: true, enviado: fecha });
    },
  };
}
