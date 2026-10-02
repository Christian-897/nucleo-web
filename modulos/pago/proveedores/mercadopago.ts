/**
 * Proveedor MERCADO PAGO (Checkout Pro). Puro: recibe el access token y los
 * datos, crea la preferencia y consulta pagos. Devuelve resultados
 * normalizados.
 *
 * Firma del webhook (x-signature):
 *   header x-signature = "ts=<ts>,v1=<hmac>"
 *   manifiesto        = "id:<data.id>;request-id:<x-request-id>;ts:<ts>;"
 *   v1 = HMAC-SHA256 (hex) del manifiesto con la clave secreta del webhook.
 * Si algún valor no viene, esa parte se omite del manifiesto. data.id va en
 * minúsculas.
 */
import { compararSeguro, hmacSha256Hex } from "../../../core/cripto";
import { fetchConTimeout } from "../../../core/red";
import type { CobroCreado, DatosCobro, EstadoPago, ResultadoProveedor } from "../tipos";

const API_MP = "https://api.mercadopago.com";

/** approved → pagada; pending/in_process/authorized → pendiente; etc. */
export function estadoDesdeMercadoPago(status: string): EstadoPago {
  switch (status) {
    case "approved":
      return "pagada";
    case "pending":
    case "in_process":
    case "authorized":
      return "pendiente";
    case "rejected":
      return "rechazada";
    case "cancelled":
    case "refunded":
    case "charged_back":
      return "anulada";
    default:
      return "desconocido";
  }
}

/** Id de pago con forma razonable (se usa en la URL de la API). */
export function idPagoMercadoPagoValido(id: unknown): id is string {
  return typeof id === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(id);
}

export async function crearCobroMercadoPago(
  accessToken: string,
  datos: DatosCobro
): Promise<CobroCreado> {
  const preferencia = {
    items: [
      {
        id: datos.orden,
        title: datos.descripcion,
        quantity: 1,
        unit_price: Math.round(datos.monto), // CLP no lleva decimales
        currency_id: "CLP",
      },
    ],
    external_reference: datos.orden,
    payer: { email: datos.email },
    back_urls: {
      success: datos.urlRetorno,
      failure: datos.urlRetorno,
      pending: datos.urlRetorno,
    },
    auto_return: "approved",
    notification_url: datos.urlConfirmacion,
  };

  const res = await fetchConTimeout(`${API_MP}/checkout/preferences`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      // Evita crear dos preferencias si la misma orden se reintenta.
      "X-Idempotency-Key": datos.orden,
    },
    body: JSON.stringify(preferencia),
  });
  if (!res.ok) {
    throw new Error(`Mercado Pago preferences ${res.status}: ${await res.text()}`);
  }
  const data = (await res.json()) as { id?: string; init_point?: string };
  if (!data.id || !data.init_point) {
    throw new Error("Mercado Pago no devolvió id/init_point");
  }
  return { redirectUrl: data.init_point, idProveedor: data.id };
}

export async function consultarCobroMercadoPago(
  accessToken: string,
  idPago: string
): Promise<ResultadoProveedor> {
  const res = await fetchConTimeout(
    `${API_MP}/v1/payments/${encodeURIComponent(idPago)}`,
    { method: "GET", headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!res.ok) {
    throw new Error(`Mercado Pago payments ${res.status}: ${await res.text()}`);
  }
  const data = (await res.json()) as Record<string, unknown>;
  return {
    proveedor: "mercadopago",
    estado: estadoDesdeMercadoPago(String(data.status ?? "")),
    orden: String(data.external_reference ?? ""),
    monto: Number(data.transaction_amount),
    moneda: typeof data.currency_id === "string" ? data.currency_id : undefined,
    idProveedor: String(data.id ?? idPago),
    crudo: data,
  };
}

/** Separa "ts=...,v1=..." en sus partes. */
export function parsearXSignature(header: string | null): { ts?: string; v1?: string } {
  const out: { ts?: string; v1?: string } = {};
  if (!header) return out;
  for (const parte of header.split(",")) {
    const i = parte.indexOf("=");
    if (i < 0) continue;
    const clave = parte.slice(0, i).trim();
    const valor = parte.slice(i + 1).trim();
    if (clave === "ts") out.ts = valor;
    if (clave === "v1") out.v1 = valor;
  }
  return out;
}

/** Arma el manifiesto que firma Mercado Pago, omitiendo lo que no venga. */
export function manifiestoMercadoPago(
  dataId: string | null | undefined,
  requestId: string | null | undefined,
  ts: string | null | undefined
): string {
  let m = "";
  if (dataId) m += `id:${dataId.toLowerCase()};`;
  if (requestId) m += `request-id:${requestId};`;
  if (ts) m += `ts:${ts};`;
  return m;
}

/** true si la firma x-signature del webhook es auténtica. */
export async function verificarFirmaMercadoPago(params: {
  xSignature: string | null;
  xRequestId: string | null;
  dataId: string | null;
  secreto: string;
}): Promise<boolean> {
  const { ts, v1 } = parsearXSignature(params.xSignature);
  if (!ts || !v1 || !params.secreto) return false;
  const manifiesto = manifiestoMercadoPago(params.dataId, params.xRequestId, ts);
  const calculada = await hmacSha256Hex(params.secreto, manifiesto);
  return compararSeguro(calculada, v1.toLowerCase());
}
