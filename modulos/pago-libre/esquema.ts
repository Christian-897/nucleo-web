import { z } from "zod";
import { normalizeInput, trimmedString } from "../../core/validar";
import { conceptosDe, limitesDe, type ConfigPagoLibre } from "./config";
import { formatearMonto, leerMonto } from "./monto";

export interface DatosPagoLibre {
  nombre: string;
  email: string;
  concepto: string;
  monto: number;
  detalle: string;
}

export type ResultadoValidacion =
  | { ok: true; datos: DatosPagoLibre }
  | { ok: false; fieldErrors: Record<string, string[]> };

/** Valida lo que mandó el navegador. Nada de esto es confiable hasta pasar por aquí. */
export function validarPagoLibre(cuerpo: Record<string, unknown>, config: ConfigPagoLibre): ResultadoValidacion {
  const ids = conceptosDe(config).map((c) => c.id) as [string, ...string[]];
  const { minimo, maximo } = limitesDe(config);
  const texto = (v: unknown, lineas = false) => (typeof v === "string" ? normalizeInput(v, { allowNewlines: lineas }) : v);

  const esquema = z.object({
    nombre: trimmedString(80, 2),
    email: z.string().trim().max(120).email("Ingresa un correo válido."),
    concepto: z.enum(ids, { errorMap: () => ({ message: "Elige qué estás pagando." }) }),
    detalle: z.string().trim().max(200, "Escribe como máximo 200 caracteres.").optional().default(""),
    aceptaTerminos: z.literal(true, { errorMap: () => ({ message: "Debes aceptar los términos para continuar." }) }),
  });
  const r = esquema.safeParse({
    nombre: texto(cuerpo.nombre),
    email: texto(cuerpo.email),
    concepto: cuerpo.concepto,
    detalle: texto(cuerpo.detalle ?? ""),
    aceptaTerminos: cuerpo.aceptaTerminos,
  });
  const fieldErrors: Record<string, string[]> = r.success ? {} : { ...(r.error.flatten().fieldErrors as Record<string, string[]>) };

  const monto = leerMonto(cuerpo.monto);
  if (monto === null) fieldErrors.monto = ["Escribe el monto en pesos, sin decimales. Ej: 150.000"];
  else if (monto < minimo) fieldErrors.monto = [`El monto mínimo es ${formatearMonto(minimo)}.`];
  else if (monto > maximo) fieldErrors.monto = [`El monto máximo es ${formatearMonto(maximo)}. Para montos mayores, escríbenos.`];

  if (!r.success || Object.keys(fieldErrors).length) return { ok: false, fieldErrors };
  return { ok: true, datos: { nombre: r.data.nombre, email: r.data.email, concepto: r.data.concepto, monto: monto!, detalle: r.data.detalle } };
}
