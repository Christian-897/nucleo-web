/**
 * Cliente de la API de Flow (https://www.flow.cl). Puro: no sabe de
 * Cloudflare ni de carritos; recibe credenciales y datos, habla con Flow.
 *
 * Firma (lo crítico): Flow exige el parámetro `s` = HMAC-SHA256 en hex de
 * los parámetros ordenados por nombre y concatenados como nombre+valor
 * (sin separadores), usando la secretKey. Si la firma está mal, Flow
 * rechaza todo. Se implementa con Web Crypto (disponible en Workers).
 */

export interface CredencialesFlow {
  apiKey: string;
  secretKey: string;
  /** true = sandbox.flow.cl, false = www.flow.cl. */
  sandbox: boolean;
}

export function baseUrlFlow(sandbox: boolean): string {
  return sandbox ? "https://sandbox.flow.cl/api" : "https://www.flow.cl/api";
}

/** Estados de pago de Flow. */
export const ESTADO_FLOW = {
  1: "pendiente",
  2: "pagada",
  3: "rechazada",
  4: "anulada",
} as const;

export type EstadoFlow = (typeof ESTADO_FLOW)[keyof typeof ESTADO_FLOW];

export function nombreEstado(status: number): EstadoFlow | "desconocido" {
  return (ESTADO_FLOW as Record<number, EstadoFlow>)[status] ?? "desconocido";
}

function aHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Firma los parámetros como lo exige Flow: ordenar por nombre, concatenar
 * nombre+valor sin separadores, HMAC-SHA256 con la secretKey, salida hex.
 */
export async function firmarFlow(
  params: Record<string, string>,
  secretKey: string
): Promise<string> {
  const concatenado = Object.keys(params)
    .sort()
    .map((nombre) => nombre + params[nombre])
    .join("");

  const enc = new TextEncoder();
  const clave = await crypto.subtle.importKey(
    "raw",
    enc.encode(secretKey),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const firma = await crypto.subtle.sign("HMAC", clave, enc.encode(concatenado));
  return aHex(firma);
}

export interface DatosPagoFlow {
  /** Identificador único del pedido en el comercio. */
  commerceOrder: string;
  subject: string;
  /** Monto en pesos enteros (CLP). */
  amount: number;
  email: string;
  /** URL del webhook servidor-a-servidor que Flow llama al confirmar. */
  urlConfirmation: string;
  /** URL a la que Flow devuelve el navegador del comprador. */
  urlReturn: string;
}

export interface RespuestaCrearPago {
  token: string;
  url: string;
  flowOrder: number;
  /** URL completa a la que se debe redirigir al comprador. */
  redirectUrl: string;
}

/** Crea un pago en Flow (payment/create) y arma la URL de redirección. */
export async function crearPagoFlow(
  cred: CredencialesFlow,
  datos: DatosPagoFlow
): Promise<RespuestaCrearPago> {
  const params: Record<string, string> = {
    apiKey: cred.apiKey,
    commerceOrder: datos.commerceOrder,
    subject: datos.subject,
    currency: "CLP",
    amount: String(Math.round(datos.amount)),
    email: datos.email,
    urlConfirmation: datos.urlConfirmation,
    urlReturn: datos.urlReturn,
  };
  const s = await firmarFlow(params, cred.secretKey);
  const body = new URLSearchParams({ ...params, s });

  const res = await fetch(`${baseUrlFlow(cred.sandbox)}/payment/create`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    throw new Error(`Flow payment/create respondió ${res.status}: ${await res.text()}`);
  }
  const data = (await res.json()) as { token: string; url: string; flowOrder: number };
  return { ...data, redirectUrl: `${data.url}?token=${data.token}` };
}

export interface EstadoPagoFlow {
  status: number;
  estado: EstadoFlow | "desconocido";
  commerceOrder: string;
  amount: number;
  /** Respuesta cruda de Flow, por si el sitio necesita más campos. */
  crudo: Record<string, unknown>;
}

/** Consulta el estado de un pago en Flow (payment/getStatus) por token. */
export async function obtenerEstadoFlow(
  cred: CredencialesFlow,
  token: string
): Promise<EstadoPagoFlow> {
  const params: Record<string, string> = { apiKey: cred.apiKey, token };
  const s = await firmarFlow(params, cred.secretKey);
  const qs = new URLSearchParams({ ...params, s });

  const res = await fetch(
    `${baseUrlFlow(cred.sandbox)}/payment/getStatus?${qs.toString()}`,
    { method: "GET" }
  );
  if (!res.ok) {
    throw new Error(`Flow getStatus respondió ${res.status}: ${await res.text()}`);
  }
  const data = (await res.json()) as {
    status: number;
    commerceOrder: string;
    amount: number;
    [k: string]: unknown;
  };
  return {
    status: data.status,
    estado: nombreEstado(data.status),
    commerceOrder: data.commerceOrder,
    amount: Number(data.amount),
    crudo: data,
  };
}
