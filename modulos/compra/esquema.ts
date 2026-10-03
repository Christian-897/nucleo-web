/**
 * Datos del comprador. El MISMO esquema corre en el navegador (para mostrar
 * errores por campo) y en el servidor (que es el que manda).
 *
 * La dirección solo se pide si el pedido trae productos físicos: quien
 * compra solo un curso no tiene por qué entregar su domicilio (Ley 19.628:
 * pedir solo los datos necesarios).
 */
import { z } from "zod";
import { normalizeInput, telefonoChileno, trimmedString } from "../../core/validar";
import { REGIONES_CHILE } from "./regiones";

const texto = (max: number, min = 1) =>
  z.preprocess((v) => (typeof v === "string" ? normalizeInput(v) : v), trimmedString(max, min));

const base = {
  nombre: texto(80, 2),
  email: z.preprocess(
    (v) => (typeof v === "string" ? normalizeInput(v).toLowerCase() : v),
    z.string().email("Ingresa un correo válido.").max(254)
  ),
  telefono: z.preprocess((v) => (typeof v === "string" ? normalizeInput(v) : v), telefonoChileno),
  notas: z
    .preprocess(
      (v) => (typeof v === "string" ? normalizeInput(v, { allowNewlines: true }) : v),
      z.string().max(300, "Máximo 300 caracteres.")
    )
    .optional()
    .default(""),
  aceptaPolitica: z.literal(true, {
    errorMap: () => ({ message: "Debes aceptar los términos y la política de privacidad." }),
  }),
};

const despacho = {
  region: z.enum(REGIONES_CHILE, { errorMap: () => ({ message: "Elige tu región." }) }),
  comuna: texto(60, 2),
  direccion: texto(140, 5),
};

export function crearEsquemaComprador(requiereDespacho: boolean) {
  return requiereDespacho ? z.object({ ...base, ...despacho }) : z.object(base);
}

export interface Comprador {
  nombre: string;
  email: string;
  telefono: string;
  notas: string;
  aceptaPolitica: true;
  region?: string;
  comuna?: string;
  direccion?: string;
}

export interface ResultadoComprador {
  ok: boolean;
  datos?: Comprador;
  fieldErrors: Record<string, string[]>;
}

export function validarComprador(entrada: unknown, requiereDespacho: boolean): ResultadoComprador {
  const r = crearEsquemaComprador(requiereDespacho).safeParse(entrada ?? {});
  if (r.success) return { ok: true, datos: r.data as Comprador, fieldErrors: {} };
  return { ok: false, fieldErrors: r.error.flatten().fieldErrors as Record<string, string[]> };
}
