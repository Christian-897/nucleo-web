/**
 * Proveedor FLOW (https://www.flow.cl). Puro: recibe credenciales y datos,
 * habla con la API de Flow y devuelve resultados normalizados.
 *
 * Firma: `s` = HMAC-SHA256 (hex) de los parámetros ordenados por nombre y
 * concatenados como nombre+valor, sin separadores, con la secretKey.
 */
import { hmacSha256Hex } from "../../../core/cripto";
import { fetchConTimeout } from "../../../core/red";
import type { CobroCreado, DatosCobro, EstadoPago, ResultadoProveedor } from "../tipos";

export interface CredencialesFlow {
  apiKey: string;
  secretKey: string;
  sandbox: boolean;
}

export function baseUrlFlow(sandbox: boolean): string {
  return sandbox ? "https://sandbox.flow.cl/api" : "https://www.flow.cl/api";
}

/** Flow: 1 pendiente, 2 pagada, 3 rechazada, 4 anulada. */
export function estadoDesdeFlow(status: number): EstadoPago {
  switch (Number(status)) {
    case 1:
      return "pendiente";
    case 2:
      return "pagada";
    case 3:
      return "rechazada";
    case 4:
      return "anulada";
    default:
      return "desconocido";
  }
}

/** Token de Flow con forma razonable (evita inyectar cosas raras en la URL). */
export function tokenFlowValido(token: unknown): token is string {
  return typeof token === "string" && /^[A-Za-z0-9._-]{1,200}$/.test(token);
}

export function firmarFlow(
  params: Record<string, string>,
  secretKey: string
): Promise<string> {
  const concatenado = Object.keys(params)
    .sort()
    .map((nombre) => nombre + params[nombre])
    .join("");
  return hmacSha256Hex(secretKey, concatenado);
}

export async function crearCobroFlow(
  cred: CredencialesFlow,
  datos: DatosCobro
): Promise<CobroCreado> {
  const params: Record<string, string> = {
    apiKey: cred.apiKey,
    commerceOrder: datos.orden,
    subject: datos.descripcion,
    currency: "CLP",
    amount: String(Math.round(datos.monto)),
    email: datos.email,
    urlConfirmation: datos.urlConfirmacion,
    urlReturn: datos.urlRetorno,
  };
  const s = await firmarFlow(params, cred.secretKey);
  const res = await fetchConTimeout(`${baseUrlFlow(cred.sandbox)}/payment/create`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ ...params, s }),
  });
  if (!res.ok) {
    throw new Error(`Flow payment/create ${res.status}: ${await res.text()}`);
  }
  const data = (await res.json()) as { token?: string; url?: string };
  if (!data.token || !data.url) throw new Error("Flow no devolvió token/url");
  return { redirectUrl: `${data.url}?token=${data.token}`, idProveedor: data.token };
}

export async function consultarCobroFlow(
  cred: CredencialesFlow,
  token: string
): Promise<ResultadoProveedor> {
  const params: Record<string, string> = { apiKey: cred.apiKey, token };
  const s = await firmarFlow(params, cred.secretKey);
  const qs = new URLSearchParams({ ...params, s });
  const res = await fetchConTimeout(
    `${baseUrlFlow(cred.sandbox)}/payment/getStatus?${qs.toString()}`,
    { method: "GET" }
  );
  if (!res.ok) {
    throw new Error(`Flow getStatus ${res.status}: ${await res.text()}`);
  }
  const data = (await res.json()) as Record<string, unknown>;
  return {
    proveedor: "flow",
    estado: estadoDesdeFlow(Number(data.status)),
    orden: String(data.commerceOrder ?? ""),
    monto: Number(data.amount),
    moneda: typeof data.currency === "string" ? data.currency : undefined,
    idProveedor: token,
    crudo: data,
  };
}
