/**
 * RESEÑAS EN EL PANEL (v0.45): aprobar, rechazar, eliminar y responder.
 * Nada se publica sin aprobación. Lo que se muestra lo escribió un
 * comprador: la pantalla lo pone siempre como texto.
 *
 *   GET  /api/admin/resenas                 lista (pendientes primero) y cuántas faltan revisar
 *   POST /api/admin/resenas { accion: "aprobar" | "rechazar" | "eliminar", clave }
 *                           { accion: "responder", clave, texto }   (texto vacío = quitar la respuesta)
 */
import { normalizeInput } from "../../core/validar";
import { resolverCatalogo } from "../catalogo/almacen";
import { ID_VALIDO } from "../catalogo/catalogo";
import { CLAVE_RESENA, guardarResena, leerResena, listarResenas, ORDEN_VALIDA, recalcularPublicas } from "../resenas/almacen";
import { LIMITES_RESENA } from "../resenas/config";
import type { Resenas } from "../resenas/servidor";
import { type Ctx, exigirSesion, jsonResponse, leerJson } from "./http";

const MAXIMO = 300;

function partirClave(clave: unknown): { producto: string; orden: string } | null {
  if (typeof clave !== "string") return null;
  const [producto, orden, ...resto] = clave.split(":");
  return !resto.length && ID_VALIDO.test(producto ?? "") && ORDEN_VALIDA.test(orden ?? "") ? { producto, orden } : null;
}

export function crearGestionResenas(resenas: Resenas) {
  async function get(ctx: Ctx): Promise<Response> {
    const s = await exigirSesion(ctx, false);
    if (s instanceof Response) return s;
    const kv = ctx.env.REVIEWS_KV;
    if (!kv) return jsonResponse(200, { pendientes: 0, resenas: [] });
    const catalogo = await resolverCatalogo(resenas.config.catalogo, ctx.env);
    const todas = await listarResenas(kv);
    const orden = { pendiente: 0, aprobada: 1, rechazada: 2 } as const;
    const lista = todas.sort((a, b) => orden[a.estado] - orden[b.estado] || b.fecha.localeCompare(a.fecha)).slice(0, MAXIMO);
    return jsonResponse(200, {
      pendientes: todas.filter((r) => r.estado === "pendiente").length,
      total: todas.length,
      resenas: lista.map((r) => ({
        clave: `${r.producto}:${r.orden}`,
        producto: r.producto,
        productoNombre: catalogo.buscar(r.producto)?.nombre ?? r.producto,
        orden: r.orden,
        nombre: r.nombre,
        estrellas: r.estrellas,
        texto: r.texto,
        variante: r.variante ?? "",
        fecha: r.fecha,
        estado: r.estado,
        respuesta: r.respuesta?.texto ?? "",
      })),
    });
  }

  async function post(ctx: Ctx): Promise<Response> {
    const s = await exigirSesion(ctx, true);
    if (s instanceof Response) return s;
    const kv = ctx.env.REVIEWS_KV;
    if (!kv) return jsonResponse(503, { message: "Falta el almacenamiento (KV) en Cloudflare." });
    const cuerpo = await leerJson(ctx.request);
    const clave = partirClave(cuerpo?.clave);
    const accion = cuerpo?.accion;
    if (!clave || !["aprobar", "rechazar", "eliminar", "responder"].includes(String(accion))) {
      return jsonResponse(400, { message: "Solicitud inválida." });
    }
    const r = await leerResena(kv, clave.producto, clave.orden);
    if (!r) return jsonResponse(404, { message: "Esa reseña ya no existe. Recarga la lista." });
    if (accion === "eliminar") {
      await kv.delete(CLAVE_RESENA(r.producto, r.orden));
    } else if (accion === "responder") {
      const texto = normalizeInput(String(cuerpo!.texto ?? ""), { allowNewlines: true }).replace(/\r\n?/g, "\n").trim();
      if (texto.length > LIMITES_RESENA.respuesta) return jsonResponse(400, { message: `La respuesta puede tener hasta ${LIMITES_RESENA.respuesta} caracteres.` });
      if (texto) r.respuesta = { texto, fecha: new Date().toISOString() };
      else delete r.respuesta;
      await guardarResena(kv, r);
    } else {
      r.estado = accion === "aprobar" ? "aprobada" : "rechazada";
      r.moderada = new Date().toISOString();
      await guardarResena(kv, r);
    }
    // La ficha lee un resumen ya armado: se rearma en cada cambio.
    const resumen = await recalcularPublicas(kv, r.producto);
    return jsonResponse(200, { ok: true, publicadas: resumen.total });
  }

  return { get, post };
}
