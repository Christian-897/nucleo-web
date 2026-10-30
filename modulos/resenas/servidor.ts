/**
 * Reseñas: invitar al comprador, el formulario público y el resumen de la ficha.
 *
 *   // src/servidor/resenas.ts
 *   export const resenas = crearResenas({ nombreSitio, urlPublica, catalogo });
 *   // functions/api/resenas.ts
 *   export const { onRequestGet, onRequestPost } = resenas.formulario;
 *
 * El panel (crearPanel({ resenas: config })) invita al marcar un pedido como
 * enviado y modera en la pestaña Reseñas.
 */
import { enviarCorreo, sendNotificationEmail } from "../../core/correo";
import { compararSeguro } from "../../core/cripto";
import { checkRateLimit, getClientIp, isSameOrigin, jsonResponse } from "../../core/seguridad";
import type { AlmacenKV, EnvBase } from "../../core/tipos";
import { normalizeInput } from "../../core/validar";
import { resolverCatalogo } from "../catalogo/almacen";
import { ID_VALIDO } from "../catalogo/catalogo";
import { idBase } from "../catalogo/colores";
import type { PedidoGuardado } from "../pago/config";
import {
  CLAVE_INVITADO,
  CLAVE_TOKEN,
  guardarResena,
  leerPublicas,
  leerResena,
  ORDEN_VALIDA,
  type Resena,
  type ResumenResenas,
} from "./almacen";
import { type ConfigResenas, LIMITES_RESENA } from "./config";
import { correoAvisoTienda, correoInvitacion } from "./correo";

const TOKEN_VALIDO = /^[a-f0-9]{32}$/;
const TAMANO_MAXIMO = 32 * 1024;

interface LineaPedido {
  productoId: string;
  nombre: string;
}

export interface ProductoAResenar {
  id: string;
  nombre: string;
  imagen?: string;
  variante?: string;
}

/**
 * "Ana María Pérez Soto" → "Ana P.": nombre e inicial del apellido paterno
 * (en Chile, con 3 palabras o más, los dos últimos son los apellidos).
 */
export function nombreCorto(nombre: unknown): string {
  const partes = String(nombre ?? "").trim().split(/\s+/).filter(Boolean);
  if (!partes.length) return "";
  const primero = partes[0].slice(0, 30);
  if (partes.length === 1) return primero;
  const apellido = partes.length >= 3 ? partes[partes.length - 2] : partes[1];
  return `${primero} ${apellido[0].toUpperCase()}.`;
}

function nuevoToken(): string {
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  return [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
}

async function leerPedido(kv: AlmacenKV, orden: string): Promise<PedidoGuardado | null> {
  const crudo = await kv.get(`pago:pedido:${orden}`);
  if (!crudo) return null;
  try {
    return JSON.parse(crudo) as PedidoGuardado;
  } catch {
    return null;
  }
}

function lineasDe(p: PedidoGuardado): LineaPedido[] {
  const l = (p.metadata as { lineas?: unknown } | undefined)?.lineas;
  return Array.isArray(l) ? l.filter((x): x is LineaPedido => x && typeof x.productoId === "string" && typeof x.nombre === "string") : [];
}

function compradorDe(p: PedidoGuardado): { nombre?: string } {
  const c = (p.metadata as { comprador?: unknown } | undefined)?.comprador;
  return c && typeof c === "object" ? (c as { nombre?: string }) : {};
}

export function crearResenas(config: ConfigResenas) {
  const ruta = config.rutaFormulario ?? "/resena/";
  const segundosEnlace = (config.diasEnlace ?? 180) * 86400;

  /** Un producto por cada producto base del pedido, con lo que compró de él. */
  async function productosDelPedido(env: EnvBase, p: PedidoGuardado): Promise<ProductoAResenar[]> {
    const catalogo = await resolverCatalogo(config.catalogo, env);
    const porId = new Map<string, ProductoAResenar & { variantes: string[] }>();
    for (const l of lineasDe(p)) {
      const id = idBase(l.productoId);
      if (!ID_VALIDO.test(id)) continue;
      const prod = catalogo.buscar(id);
      const nombre = prod?.nombre ?? l.nombre.split(" · ")[0];
      const variante = l.nombre.startsWith(`${nombre} · `) ? l.nombre.slice(nombre.length + 3) : "";
      const actual = porId.get(id) ?? { id, nombre, imagen: prod?.imagen, variantes: [] };
      if (variante && !actual.variantes.includes(variante)) actual.variantes.push(variante);
      porId.set(id, actual);
    }
    return [...porId.values()].map(({ variantes, ...x }) => ({ ...x, ...(variantes.length ? { variante: variantes.join(", ").slice(0, 120) } : {}) }));
  }

  /**
   * Pide la reseña por correo (lo llama el panel al marcar "enviado").
   * `forzar` la vuelve a pedir aunque ya se haya pedido.
   */
  async function invitar(env: EnvBase, orden: string, forzar = false): Promise<{ ok: boolean; motivo?: string; simulado?: boolean }> {
    const kv = env.REVIEWS_KV;
    if (!kv || !ORDEN_VALIDA.test(orden)) return { ok: false, motivo: "sin-datos" };
    if (!forzar && (await kv.get(CLAVE_INVITADO(orden)))) return { ok: false, motivo: "ya-invitado" };
    const pedido = await leerPedido(kv, orden);
    if (!pedido || pedido.estado !== "pagada" || !pedido.email) return { ok: false, motivo: "sin-pedido" };
    const productos = await productosDelPedido(env, pedido);
    if (!productos.length) return { ok: false, motivo: "sin-productos" };
    const token = (await kv.get(CLAVE_TOKEN(orden))) || nuevoToken();
    await kv.put(CLAVE_TOKEN(orden), token, { expirationTtl: segundosEnlace });
    const enlace = `${config.urlPublica.replace(/\/$/, "")}${ruta}?o=${encodeURIComponent(orden)}&t=${token}`;
    const nombre = String(compradorDe(pedido).nombre ?? "").trim().split(/\s+/)[0] ?? "";
    const r = await enviarCorreo(env, {
      para: pedido.email,
      subject: `¿Qué te pareció tu compra en ${config.nombreSitio}?`,
      html: correoInvitacion(config, { nombre, productos: productos.map((x) => (x.variante ? `${x.nombre} (${x.variante})` : x.nombre)), enlace }),
      remitentePorDefecto: config.remitentePorDefecto,
    });
    if (!r.sent && !r.simulated) return { ok: false, motivo: "correo" };
    await kv.put(CLAVE_INVITADO(orden), new Date().toISOString(), { expirationTtl: segundosEnlace });
    return { ok: true, simulado: r.simulated };
  }

  /** ¿El enlace sirve? Devuelve el pedido o la respuesta de error. */
  async function validarEnlace(env: EnvBase, orden: unknown, token: unknown): Promise<PedidoGuardado | Response> {
    const kv = env.REVIEWS_KV;
    if (!kv) return jsonResponse(503, { message: "Las reseñas no están disponibles ahora." });
    if (typeof orden !== "string" || !ORDEN_VALIDA.test(orden) || typeof token !== "string" || !TOKEN_VALIDO.test(token)) {
      return jsonResponse(400, { message: "El enlace no es válido. Revisa que lo hayas copiado completo." });
    }
    const guardado = await kv.get(CLAVE_TOKEN(orden));
    if (!guardado || !compararSeguro(guardado, token)) return jsonResponse(403, { message: "Este enlace no es válido o ya venció." });
    const pedido = await leerPedido(kv, orden);
    if (!pedido) return jsonResponse(404, { message: "No encontramos ese pedido." });
    return pedido;
  }

  const formulario = {
    /** GET /api/resenas?o=<orden>&t=<código>: qué productos puede reseñar. */
    onRequestGet: async ({ request, env }: { request: Request; env: EnvBase }): Promise<Response> => {
      const url = new URL(request.url);
      const orden = url.searchParams.get("o");
      const pedido = await validarEnlace(env, orden, url.searchParams.get("t"));
      if (pedido instanceof Response) return pedido;
      const productos = await productosDelPedido(env, pedido);
      const hechas = await Promise.all(productos.map((p) => leerResena(env.REVIEWS_KV!, p.id, orden!)));
      return jsonResponse(200, {
        nombreSitio: config.nombreSitio,
        nombreSugerido: nombreCorto(compradorDe(pedido).nombre),
        productos: productos.map((p, i) => ({ ...p, hecha: Boolean(hechas[i]) })),
      });
    },
    /** POST /api/resenas { o, t, nombre, resenas: [{ producto, estrellas, texto }] } */
    onRequestPost: async ({ request, env }: { request: Request; env: EnvBase }): Promise<Response> => {
      if (!isSameOrigin(request)) return jsonResponse(403, { message: "Origen no permitido." });
      const kv = env.REVIEWS_KV;
      if (kv && !(await checkRateLimit(kv, `resena:limite:${getClientIp(request)}`, 10, 3600))) {
        return jsonResponse(429, { message: "Demasiados intentos. Prueba de nuevo en un rato." });
      }
      const texto = await request.text();
      if (texto.length > TAMANO_MAXIMO) return jsonResponse(413, { message: "El texto es demasiado largo." });
      let cuerpo: Record<string, unknown>;
      try {
        cuerpo = JSON.parse(texto || "{}");
      } catch {
        return jsonResponse(400, { message: "Solicitud inválida." });
      }
      const pedido = await validarEnlace(env, cuerpo.o, cuerpo.t);
      if (pedido instanceof Response) return pedido;
      const orden = cuerpo.o as string;
      const nombre = normalizeInput(String(cuerpo.nombre ?? "")).trim().replace(/\s+/g, " ");
      if (nombre.length < 2 || nombre.length > LIMITES_RESENA.nombre) {
        return jsonResponse(400, { message: `Escribe tu nombre (de 2 a ${LIMITES_RESENA.nombre} caracteres).`, errores: { nombre: "Revisa tu nombre." } });
      }
      const productos = await productosDelPedido(env, pedido);
      const lista = Array.isArray(cuerpo.resenas) ? cuerpo.resenas.slice(0, productos.length) : [];
      const errores: Record<string, string> = {};
      const nuevas: Resena[] = [];
      for (const x of lista as Record<string, unknown>[]) {
        const prod = productos.find((p) => p.id === x?.producto);
        if (!prod) continue; // solo lo que venía en el pedido
        const estrellas = Number(x.estrellas);
        const t = normalizeInput(String(x.texto ?? ""), { allowNewlines: true }).replace(/\r\n?/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
        if (!Number.isInteger(estrellas) || estrellas < 1 || estrellas > 5) errores[prod.id] = "Elige de 1 a 5 estrellas.";
        else if (t.length < 3) errores[prod.id] = "Cuéntanos al menos un poco.";
        else if (t.length > LIMITES_RESENA.texto) errores[prod.id] = `Máximo ${LIMITES_RESENA.texto} caracteres.`;
        else if (await leerResena(kv!, prod.id, orden)) errores[prod.id] = "Ya opinaste sobre este producto. ¡Gracias!";
        else
          nuevas.push({
            producto: prod.id,
            orden,
            nombre,
            estrellas,
            texto: t,
            ...(prod.variante ? { variante: prod.variante } : {}),
            fecha: new Date().toISOString(),
            estado: "pendiente",
          });
      }
      if (Object.keys(errores).length) return jsonResponse(400, { message: "Revisa lo marcado.", errores });
      if (!nuevas.length) return jsonResponse(400, { message: "Elige las estrellas y escribe tu opinión de al menos un producto." });
      for (const r of nuevas) await guardarResena(kv!, r);
      // Aviso a la tienda: no bloquea si el correo falla.
      try {
        await sendNotificationEmail(env, {
          subject: `Nueva reseña para revisar · ${config.nombreSitio}`,
          html: correoAvisoTienda(config, {
            nombre,
            resenas: nuevas.map((r) => ({ producto: productos.find((p) => p.id === r.producto)?.nombre ?? r.producto, estrellas: r.estrellas, texto: r.texto })),
          }),
          remitentePorDefecto: config.remitentePorDefecto,
        });
      } catch (e) {
        console.error("[resenas] no se pudo avisar a la tienda", e);
      }
      return jsonResponse(200, { ok: true, guardadas: nuevas.length });
    },
  };

  return {
    config,
    invitar,
    formulario,
    /** Resumen de las aprobadas de un producto (lo usa la ficha). */
    publicas: (env: EnvBase, producto: string): Promise<ResumenResenas | null> => leerPublicas(env.REVIEWS_KV, producto),
  };
}

export type Resenas = ReturnType<typeof crearResenas>;
