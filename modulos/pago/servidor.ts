/**
 * MOTOR del módulo pago. Orquesta Flow:
 *  - iniciar: arma el pedido autoritativo (el sitio valida el carrito),
 *    crea el pago en Flow y devuelve la URL de redirección.
 *  - confirmar: webhook que Flow llama servidor-a-servidor; consulta el
 *    estado real y, si está pagada, avisa al sitio (onConfirmado).
 *  - estado: para la página de retorno del comprador.
 */
import { isSameOrigin, jsonResponse } from "../../core/seguridad";
import {
  type ConfigPago,
  type EnvPago,
  credencialesDesdeEnv,
} from "./config";
import { crearPagoFlow, obtenerEstadoFlow } from "./flow";

function resolver(
  valor: string | ((origin: string, env: EnvPago) => string),
  origin: string,
  env: EnvPago
): string {
  return typeof valor === "function" ? valor(origin, env) : valor;
}

/** Lee el token de Flow, venga en el cuerpo (form) o en la query. */
async function leerToken(request: Request): Promise<string> {
  try {
    const ct = request.headers.get("Content-Type") || "";
    if (ct.includes("application/x-www-form-urlencoded") || ct.includes("form-data")) {
      const fd = await request.formData();
      const t = fd.get("token");
      if (typeof t === "string" && t) return t;
    }
  } catch {
    /* sigue con la query */
  }
  return new URL(request.url).searchParams.get("token") || "";
}

/** POST: inicia el pago y responde { redirectUrl } para que el cliente redirija. */
export async function iniciarPago(
  request: Request,
  env: EnvPago,
  config: ConfigPago
): Promise<Response> {
  if (!isSameOrigin(request)) {
    return jsonResponse(403, { message: "Origen no permitido." });
  }
  const cred = credencialesDesdeEnv(env, config.sandbox);
  if (!cred.apiKey || !cred.secretKey) {
    console.error("[pago] faltan FLOW_API_KEY / FLOW_SECRET_KEY");
    return jsonResponse(500, { message: "El pago no está configurado." });
  }

  let pedido;
  try {
    pedido = await config.prepararPedido(request, env);
  } catch (e) {
    console.error("[pago] prepararPedido falló", e);
    return jsonResponse(400, { message: "No se pudo preparar el pedido." });
  }
  if (!pedido || !(pedido.amount > 0)) {
    return jsonResponse(400, { message: "El pedido no tiene un monto válido." });
  }

  const origin = new URL(request.url).origin;
  try {
    const { redirectUrl } = await crearPagoFlow(cred, {
      commerceOrder: pedido.commerceOrder,
      subject: pedido.subject,
      amount: pedido.amount,
      email: pedido.email,
      urlConfirmation: resolver(config.urlConfirmation, origin, env),
      urlReturn: resolver(config.urlReturn, origin, env),
    });
    return jsonResponse(200, { redirectUrl });
  } catch (e) {
    console.error("[pago] crearPagoFlow falló", e);
    return jsonResponse(502, { message: "No se pudo iniciar el pago." });
  }
}

/**
 * Webhook de confirmación (servidor-a-servidor desde Flow). No lleva
 * same-origin: lo llama Flow, no el navegador. La verdad del pago se
 * obtiene consultando getStatus, nunca confiando en el cuerpo recibido.
 */
export async function confirmarPago(
  request: Request,
  env: EnvPago,
  config: ConfigPago
): Promise<Response> {
  const token = await leerToken(request);
  if (!token) return jsonResponse(400, { message: "Falta token." });

  const cred = credencialesDesdeEnv(env, config.sandbox);
  if (!cred.apiKey || !cred.secretKey) {
    console.error("[pago] webhook sin credenciales configuradas");
    return jsonResponse(500, { message: "El pago no está configurado." });
  }

  try {
    const estado = await obtenerEstadoFlow(cred, token);
    if (estado.estado === "pagada" && config.onConfirmado) {
      await config.onConfirmado(estado, env);
    }
  } catch (e) {
    console.error("[pago] confirmación falló", e);
    // Respondemos 200 igual: Flow reintenta, y un error de nuestro lado no
    // debe dejar el webhook en bucle. El estado real se puede reconsultar.
  }
  return new Response("OK", { status: 200 });
}

/** Para la página de retorno del comprador: devuelve el estado del pago. */
export async function consultarEstado(
  request: Request,
  env: EnvPago,
  config: ConfigPago
): Promise<Response> {
  const token = await leerToken(request);
  if (!token) return jsonResponse(400, { message: "Falta token." });
  const cred = credencialesDesdeEnv(env, config.sandbox);
  if (!cred.apiKey || !cred.secretKey) {
    return jsonResponse(500, { message: "El pago no está configurado." });
  }
  try {
    const estado = await obtenerEstadoFlow(cred, token);
    return jsonResponse(200, {
      estado: estado.estado,
      commerceOrder: estado.commerceOrder,
      amount: estado.amount,
    });
  } catch (e) {
    console.error("[pago] consultarEstado falló", e);
    return jsonResponse(502, { message: "No se pudo consultar el estado." });
  }
}
