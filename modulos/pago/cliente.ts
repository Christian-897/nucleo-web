/**
 * Cliente headless del pago. El navegador no calcula montos ni firma nada:
 * solo le pide al servidor iniciar el pago y lo redirige a Flow.
 */

export interface ResultadoIniciarPago {
  ok: boolean;
  message?: string;
}

/**
 * Pide al servidor iniciar el pago y, si todo va bien, redirige el
 * navegador a Flow. `datos` es opcional: lo que el sitio necesite enviar
 * para que `prepararPedido` arme el pedido (ej. el email, o nada si el
 * carrito ya vive en el servidor por sesión).
 */
export async function irAPagar(
  datos: Record<string, unknown> = {},
  opciones: { endpoint?: string } = {}
): Promise<ResultadoIniciarPago> {
  const endpoint = opciones.endpoint ?? "/api/pago/iniciar";
  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(datos),
    });
    const cuerpo = (await res.json().catch(() => ({}))) as {
      redirectUrl?: string;
      message?: string;
    };
    if (res.ok && cuerpo.redirectUrl) {
      window.location.href = cuerpo.redirectUrl;
      return { ok: true };
    }
    return {
      ok: false,
      message: cuerpo.message ?? "No se pudo iniciar el pago.",
    };
  } catch {
    return { ok: false, message: "No hay conexión. Intenta nuevamente." };
  }
}
