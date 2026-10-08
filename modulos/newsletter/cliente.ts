/**
 * API headless del newsletter para el navegador. Cualquier diseño la usa.
 * No lanza: los errores vuelven como { ok:false, message }.
 */
export interface ResultadoNewsletter {
  ok: boolean;
  message?: string;
  fieldErrors?: Record<string, string[]>;
  status?: number;
}

async function enviar(endpoint: string, datos: unknown): Promise<ResultadoNewsletter> {
  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(datos),
    });
    const cuerpo = (await res.json().catch(() => ({}))) as ResultadoNewsletter;
    return {
      ok: res.ok && cuerpo.ok === true,
      status: res.status,
      message: cuerpo.message ?? (res.ok ? undefined : "No se pudo completar. Intenta nuevamente."),
      fieldErrors: cuerpo.fieldErrors,
    };
  } catch {
    return { ok: false, message: "No hay conexión. Revisa tu internet e intenta de nuevo." };
  }
}

export function suscribirNewsletter(
  datos: { email: string; aceptaPolitica: boolean; turnstileToken: string; [k: string]: unknown },
  opciones: { endpoint?: string } = {}
) {
  return enviar(opciones.endpoint ?? "/api/newsletter/suscribir", datos);
}

/** Lee e, v y t de la URL actual y confirma. */
export function confirmarNewsletter(
  params: { e: string; v: string; t: string },
  opciones: { endpoint?: string } = {}
) {
  return enviar(opciones.endpoint ?? "/api/newsletter/confirmar", {
    e: params.e,
    v: Number(params.v),
    t: params.t,
  });
}

export function bajaNewsletter(
  params: { e: string; t: string },
  opciones: { endpoint?: string } = {}
) {
  return enviar(opciones.endpoint ?? "/api/newsletter/baja", params);
}

/** Pide el enlace de baja por correo (para quien no tiene a mano un correo nuestro). */
export function pedirBajaNewsletter(
  datos: { email: string; turnstileToken: string; [k: string]: unknown },
  opciones: { endpoint?: string } = {}
) {
  return enviar(opciones.endpoint ?? "/api/newsletter/pedir-baja", datos);
}
