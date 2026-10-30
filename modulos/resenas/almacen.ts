/**
 * Dónde viven las reseñas (KV):
 *   resena:r:<producto>:<orden>   cada reseña (una por producto y pedido)
 *   resena:token:<orden>          código del enlace del correo (vence)
 *   resena:invitado:<orden>       cuándo se pidió la reseña (no se repite solo)
 *   resena:publicas:<producto>    resumen ya armado de las aprobadas: la ficha
 *                                 lo lee de una vez (una lectura por visita)
 */
import type { AlmacenKV } from "../../core/tipos";
import { RESENAS_VISIBLES } from "./config";

export type EstadoResena = "pendiente" | "aprobada" | "rechazada";

export interface Resena {
  producto: string;
  orden: string;
  /** Nombre público, corto ("Ana P."). */
  nombre: string;
  estrellas: number;
  texto: string;
  /** Lo que compró de ese producto ("Rosa · Tamaño king"). */
  variante?: string;
  fecha: string;
  estado: EstadoResena;
  /** Cuándo se aprobó o rechazó. */
  moderada?: string;
  respuesta?: { texto: string; fecha: string };
}

/** Lo que se publica de una reseña (sin el número de pedido). */
export interface ResenaPublica {
  nombre: string;
  estrellas: number;
  texto: string;
  variante?: string;
  fecha: string;
  respuesta?: { texto: string; fecha: string };
}

export interface ResumenResenas {
  total: number;
  /** Con un decimal (4.6). */
  promedio: number;
  resenas: ResenaPublica[];
}

export const PREFIJO_RESENA = "resena:r:";
export const CLAVE_RESENA = (producto: string, orden: string) => `${PREFIJO_RESENA}${producto}:${orden}`;
export const CLAVE_TOKEN = (orden: string) => `resena:token:${orden}`;
export const CLAVE_INVITADO = (orden: string) => `resena:invitado:${orden}`;
export const CLAVE_PUBLICAS = (producto: string) => `resena:publicas:${producto}`;

export const ORDEN_VALIDA = /^[A-Za-z0-9_-]{1,64}$/;

function valida(r: unknown): r is Resena {
  const x = r as Resena;
  return Boolean(x && typeof x.producto === "string" && typeof x.orden === "string" && typeof x.texto === "string" && Number.isInteger(x.estrellas));
}

export async function leerResena(kv: AlmacenKV, producto: string, orden: string): Promise<Resena | null> {
  const crudo = await kv.get(CLAVE_RESENA(producto, orden));
  if (!crudo) return null;
  try {
    const r = JSON.parse(crudo);
    return valida(r) ? r : null;
  } catch {
    return null;
  }
}

export async function guardarResena(kv: AlmacenKV, r: Resena): Promise<void> {
  await kv.put(CLAVE_RESENA(r.producto, r.orden), JSON.stringify(r));
}

/** Todas las reseñas (o las de un producto), la más nueva primero. */
export async function listarResenas(kv: AlmacenKV, producto?: string): Promise<Resena[]> {
  const { keys } = await kv.list({ prefix: producto ? `${PREFIJO_RESENA}${producto}:` : PREFIJO_RESENA });
  const todas = await Promise.all(
    keys.map(async (k) => {
      const crudo = await kv.get(k.name);
      try {
        const r = crudo ? JSON.parse(crudo) : null;
        return valida(r) ? r : null;
      } catch {
        return null;
      }
    })
  );
  return todas.filter((r): r is Resena => r !== null).sort((a, b) => b.fecha.localeCompare(a.fecha));
}

export function publica(r: Resena): ResenaPublica {
  return {
    nombre: r.nombre,
    estrellas: r.estrellas,
    texto: r.texto,
    ...(r.variante ? { variante: r.variante } : {}),
    fecha: r.fecha,
    ...(r.respuesta ? { respuesta: r.respuesta } : {}),
  };
}

/** Rearma el resumen público de un producto (después de aprobar, rechazar, borrar o responder). */
export async function recalcularPublicas(kv: AlmacenKV, producto: string): Promise<ResumenResenas> {
  const aprobadas = (await listarResenas(kv, producto)).filter((r) => r.estado === "aprobada");
  const total = aprobadas.length;
  const promedio = total ? Math.round((aprobadas.reduce((s, r) => s + r.estrellas, 0) / total) * 10) / 10 : 0;
  const resumen: ResumenResenas = { total, promedio, resenas: aprobadas.slice(0, RESENAS_VISIBLES).map(publica) };
  if (total) await kv.put(CLAVE_PUBLICAS(producto), JSON.stringify(resumen));
  else await kv.delete(CLAVE_PUBLICAS(producto));
  return resumen;
}

export async function leerPublicas(kv: AlmacenKV | undefined, producto: string): Promise<ResumenResenas | null> {
  if (!kv) return null;
  const crudo = await kv.get(CLAVE_PUBLICAS(producto));
  if (!crudo) return null;
  try {
    const r = JSON.parse(crudo) as ResumenResenas;
    return r && r.total > 0 && Array.isArray(r.resenas) ? r : null;
  } catch {
    return null;
  }
}
