/**
 * API "headless" para el navegador. Cualquier diseño llama a estas
 * funciones; no traen nada de estilos ni de markup. Una cara nueva
 * reescribe el formulario, pero el envío y el manejo de errores salen de
 * acá tal cual.
 */

export interface DatosCotizacionCliente {
  nombre: string;
  email: string;
  telefono?: string;
  categoria: string;
  descripcion: string;
  aceptaPolitica: boolean;
  turnstileToken: string;
  /** Campo trampa: debe ir vacío. Se envía igual para que el servidor lo evalúe. */
  [extra: string]: unknown;
}

export interface ResultadoEnvio {
  ok: boolean;
  /** Mensaje para mostrar al visitante (viene del servidor o uno de red). */
  message?: string;
  /** Errores por campo, si la validación del servidor los devolvió. */
  fieldErrors?: Record<string, string[]>;
  /** Código HTTP, por si la cara quiere distinguir 429 de 400, etc. */
  status?: number;
}

/**
 * Envía la cotización al endpoint (por defecto `/api/quote`) y devuelve un
 * resultado uniforme. No lanza: los problemas de red vuelven como
 * `{ ok:false, message }` para que la cara siempre tenga qué mostrar.
 */
export async function enviarCotizacion(
  datos: DatosCotizacionCliente,
  opciones: { endpoint?: string } = {}
): Promise<ResultadoEnvio> {
  const endpoint = opciones.endpoint ?? "/api/quote";
  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(datos),
    });

    let cuerpo: {
      ok?: boolean;
      message?: string;
      fieldErrors?: Record<string, string[]>;
    } = {};
    try {
      cuerpo = await res.json();
    } catch {
      // Respuesta sin JSON (p. ej. 405/500 crudo): seguimos con el status.
    }

    if (res.ok && cuerpo.ok) {
      return { ok: true, status: res.status };
    }
    return {
      ok: false,
      status: res.status,
      message: cuerpo.message ?? "No se pudo enviar. Intenta nuevamente.",
      fieldErrors: cuerpo.fieldErrors,
    };
  } catch {
    return {
      ok: false,
      message: "No hay conexión. Revisa tu internet e intenta de nuevo.",
    };
  }
}
