/**
 * MOTIVOS EN PALABRAS SIMPLES (v0.43.1). Traduce el error crudo de Flow o
 * Mercado Pago ("Flow payment/create 400: {"code":109,...}") a una frase que
 * entiende quien administra la tienda, con la variable de Cloudflare a revisar.
 *
 * Se muestra SOLO en el panel (con sesión). Al comprador siempre se le dice
 * algo genérico. Los cuerpos de error de los proveedores no traen claves; igual
 * se recorta y se limpia lo que se muestra.
 */
export type ProveedorPago = "flow" | "mercadopago";

/** Último error al iniciar un pago con ese proveedor (lo muestra el panel; dura 7 días). */
export const CLAVE_ERROR_INICIO = (p: ProveedorPago) => `pago:error-inicio:${p}`;

export interface ErrorInicioPago {
  proveedor: ProveedorPago;
  fecha: string;
  motivo: string;
}

const NOMBRE: Record<ProveedorPago, string> = { flow: "Flow", mercadopago: "Mercado Pago" };

/** Solo texto común, sin saltos ni cosas raras, y corto. */
function recortar(t: string, max = 160): string {
  return t.replace(/[^\p{L}\p{N} .,:;()_\-/'"%#@¿?¡!]/gu, " ").replace(/\s+/g, " ").trim().slice(0, max);
}

function leerJson(t: string): Record<string, unknown> | null {
  const i = t.indexOf("{");
  if (i < 0) return null;
  try {
    const v = JSON.parse(t.slice(i));
    return v && typeof v === "object" ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export function explicarErrorPago(proveedor: ProveedorPago, error: unknown): string {
  const crudo = error instanceof Error ? error.message : String(error ?? "");
  const nombre = NOMBRE[proveedor];
  if (/abort|timeout|timed out|network|fetch failed|ECONN|ENOTFOUND/i.test(crudo) && !/\b\d{3}\b/.test(crudo)) {
    return `No se pudo conectar con ${nombre} (no respondió a tiempo). Suele ser momentáneo: intenta de nuevo en unos minutos.`;
  }
  const status = Number(/\b([45]\d{2})\b/.exec(crudo)?.[1] ?? 0);
  const cuerpo = leerJson(crudo);
  const mensaje = typeof cuerpo?.message === "string" ? cuerpo.message : "";
  const codigo = cuerpo?.code;

  if (proveedor === "flow") {
    if (/api ?key/i.test(mensaje) || codigo === 108 || codigo === 109) {
      return "Flow no reconoce la API Key (FLOW_API_KEY). Revisa que sea la de la cuenta real (no la de pruebas), que esté completa y que no esté intercambiada con la Secret Key. Después, Retry deployment.";
    }
    if (/sign|firma/i.test(mensaje)) {
      return "Flow rechazó la firma: la Secret Key (FLOW_SECRET_KEY) no corresponde a la API Key. Copia las dos de nuevo desde la misma cuenta de Flow. Después, Retry deployment.";
    }
    if (status >= 500) return "Flow tuvo una falla de su lado. Suele ser momentáneo: intenta de nuevo en unos minutos.";
  }

  if (proveedor === "mercadopago") {
    if (status === 401) {
      return "Mercado Pago no reconoce el Access Token (MP_ACCESS_TOKEN). Revisa que sea el Access Token de producción (el largo que empieza con APP_USR-) y no la Public Key. Después, Retry deployment.";
    }
    if (status === 403) {
      return "Mercado Pago no autoriza a esta cuenta a cobrar todavía. Revisa que las credenciales de producción estén activadas, que se copió el Access Token (no la Public Key) y que la cuenta no tenga validaciones pendientes (identidad o datos del negocio).";
    }
    if (status >= 500) return "Mercado Pago tuvo una falla de su lado. Suele ser momentáneo: intenta de nuevo en unos minutos.";
  }

  const detalle = recortar(mensaje || crudo.replace(/^[^:]*:\s*/, ""));
  return `${nombre} rechazó la operación${status ? ` (${status})` : ""}${detalle ? `: ${detalle}` : "."}`;
}
