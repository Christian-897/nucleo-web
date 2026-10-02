import { z } from "zod";
import { HONEYPOT_FIELD, trimmedString, telefonoChileno } from "../../core/validar";
import type { CategoriaCotizacion } from "./config";

/**
 * El esquema depende del rubro (las categorías), así que se construye con
 * la lista del sitio en vez de tener un enum fijo. Esto es lo que hace al
 * módulo reutilizable: otro rubro pasa otras categorías y el mismo motor
 * valida bien.
 */
export function crearEsquemaCotizacion(categorias: CategoriaCotizacion[]) {
  const ids = categorias.map((c) => c.id);
  if (ids.length === 0) {
    throw new Error("crearEsquemaCotizacion: se necesita al menos una categoría.");
  }
  const idsTupla = ids as [string, ...string[]];

  return z.object({
    nombre: trimmedString(80, 2),
    email: z.string().trim().email("Ingresa un correo válido.").max(120),
    telefono: z.union([telefonoChileno, z.literal("")]).optional(),
    categoria: z.enum(idsTupla, {
      errorMap: () => ({ message: "Selecciona una opción." }),
    }),
    descripcion: trimmedString(1000, 10),
    aceptaPolitica: z.literal(true, {
      errorMap: () => ({
        message: "Debes aceptar la política de privacidad para continuar.",
      }),
    }),
    turnstileToken: trimmedString(4000),
    // Campo trampa: si viene con contenido, es un bot. Debe llegar vacío.
    [HONEYPOT_FIELD]: z.string().max(0).optional().or(z.literal("")),
  });
}

export type EsquemaCotizacion = ReturnType<typeof crearEsquemaCotizacion>;
export type CotizacionInput = z.infer<EsquemaCotizacion>;
