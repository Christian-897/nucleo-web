/**
 * MOTOR del módulo pago. Seguro por defecto:
 *
 *  1. El MONTO lo calcula el servidor (prepararPedido). El navegador no
 *     manda precios en los que se confíe.
 *  2. Al iniciar, se guarda el pedido con el monto ESPERADO.
 *  3. La confirmación NUNCA confía en lo que llega al webhook: consulta el
 *     pago al proveedor y compara monto y moneda con lo esperado. Si no
 *     calza, el pedido queda "en-revision" y NO se confirma.
 *  4. Mercado Pago: además se valida la firma x-signature del webhook.
 *  5. Idempotencia: un pedido ya pagado no se vuelve a confirmar aunque el
 *     proveedor reintente la notificación.
 *  6. Solo proveedores habilitados, tope de intentos por IP, límite de
 *     tamaño del cuerpo, tiempos límite hacia los proveedores, y errores
 *     genéricos hacia afuera (el detalle va solo al registro).
 */
import {
  checkRateLimit,
  getClientIp,
  isSameOrigin,
  jsonResponse,
} from "../../core/seguridad";
import { generarId } from "../../core/cripto";
import {
  type ConfigPago,
  type EnvPago,
  type PedidoGuardado,
  RUTAS_POR_DEFECTO,
  credencialesFlow,
  proveedorConfigurado,
  secretoWebhookMercadoPago,
  tokenMercadoPago,
} from "./config";
import {
  consultarCobroFlow,
  crearCobroFlow,
  tokenFlowValido,
} from "./proveedores/flow";
import {
  consultarCobroMercadoPago,
  crearCobroMercadoPago,
  idPagoMercadoPagoValido,
  verificarFirmaMercadoPago,
} from "./proveedores/mercadopago";
import {
  type CobroCreado,
  type DatosCobro,
  ErrorPedido,
  type Proveedor,
  type ResultadoProveedor,
  PROVEEDORES,
} from "./tipos";

const TAMANO_MAXIMO_CUERPO = 64 * 1024; // 64 KB: un carrito no pesa más
const MONTO_MAXIMO = 100_000_000; // tope de cordura: $100 millones
const ORDEN_VALIDA = /^[A-Za-z0-9_-]{1,64}$/;
const EMAIL_VALIDO = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;

// ───────────────────────── registro del pedido (KV) ─────────────────────────

const claveRegistro = (orden: string) => `pago:pedido:${orden}`;

async function leerRegistro(env: EnvPago, orden: string): Promise<PedidoGuardado | null> {
  if (!env.REVIEWS_KV) return null;
  const crudo = await env.REVIEWS_KV.get(claveRegistro(orden));
  if (!crudo) return null;
  try {
    return JSON.parse(crudo) as PedidoGuardado;
  } catch {
    return null;
  }
}

async function guardarRegistro(
  env: EnvPago,
  registro: PedidoGuardado,
  config: ConfigPago
): Promise<void> {
  if (!env.REVIEWS_KV) return;
  const dias = config.retencionDias ?? 30;
  await env.REVIEWS_KV.put(claveRegistro(registro.orden), JSON.stringify(registro), {
    expirationTtl: dias * 24 * 60 * 60,
  });
}

// ─────────────────────────────── utilidades ───────────────────────────────

function urlAbsoluta(origin: string, ruta: string): string {
  return ruta.startsWith("http") ? ruta : `${origin}${ruta}`;
}

async function leerCuerpoJson(request: Request): Promise<Record<string, unknown> | null> {
  const largo = Number(request.headers.get("Content-Length") || "0");
  if (largo > TAMANO_MAXIMO_CUERPO) return null;
  const texto = await request.text();
  if (texto.length > TAMANO_MAXIMO_CUERPO) return null;
  if (!texto) return {};
  try {
    const datos = JSON.parse(texto);
    return datos && typeof datos === "object" && !Array.isArray(datos)
      ? (datos as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function elegirProveedor(
  pedido: unknown,
  config: ConfigPago
): Proveedor | null {
  const habilitados = config.proveedores.filter((p) => PROVEEDORES.includes(p));
  if (typeof pedido === "string" && (habilitados as string[]).includes(pedido)) {
    return pedido as Proveedor;
  }
  // Usable: si hay uno solo habilitado y no se indicó, se usa ese.
  if (pedido === undefined && habilitados.length === 1) return habilitados[0];
  return null;
}

async function crearCobro(
  proveedor: Proveedor,
  env: EnvPago,
  config: ConfigPago,
  datos: DatosCobro
): Promise<CobroCreado> {
  if (proveedor === "flow") {
    return crearCobroFlow(credencialesFlow(env, config.sandboxFlow), datos);
  }
  return crearCobroMercadoPago(tokenMercadoPago(env), datos);
}

// ───────────────────────────────── INICIAR ─────────────────────────────────

/** POST: valida, arma el pedido con el monto real, crea el cobro y devuelve la URL. */
export async function iniciarPago(
  request: Request,
  env: EnvPago,
  config: ConfigPago
): Promise<Response> {
  if (!isSameOrigin(request)) {
    return jsonResponse(403, { message: "Origen no permitido." });
  }

  const tope = config.rateLimit ?? { max: 10, ventanaSeg: 600 };
  const dentro = await checkRateLimit(
    env.REVIEWS_KV,
    `pago:${getClientIp(request)}`,
    tope.max,
    tope.ventanaSeg
  );
  if (!dentro) {
    return jsonResponse(429, { message: "Demasiados intentos. Espera unos minutos." });
  }

  const cuerpo = await leerCuerpoJson(request);
  if (!cuerpo) return jsonResponse(400, { message: "Solicitud inválida." });

  const proveedor = elegirProveedor(cuerpo.proveedor, config);
  if (!proveedor) {
    return jsonResponse(400, { message: "Medio de pago no disponible." });
  }
  if (!proveedorConfigurado(proveedor, env)) {
    console.error(`[pago] ${proveedor} habilitado pero sin credenciales en Cloudflare`);
    return jsonResponse(503, { message: "Este medio de pago no está disponible ahora." });
  }
  if (!env.REVIEWS_KV && !config.verificarPedido) {
    // Sin dónde guardar el monto esperado no se puede verificar después.
    console.error("[pago] falta REVIEWS_KV o verificarPedido: no se aceptan pagos");
    return jsonResponse(503, { message: "El pago no está disponible ahora." });
  }

  let pedido;
  try {
    pedido = await config.prepararPedido(cuerpo, env, request);
  } catch (e) {
    if (e instanceof ErrorPedido) return jsonResponse(400, { message: e.message });
    console.error("[pago] prepararPedido falló", e);
    return jsonResponse(400, { message: "No se pudo preparar tu pedido." });
  }

  const monto = Number(pedido?.monto);
  if (!Number.isInteger(monto) || monto <= 0 || monto > MONTO_MAXIMO) {
    console.error("[pago] monto inválido desde prepararPedido:", pedido?.monto);
    return jsonResponse(400, { message: "El pedido no tiene un monto válido." });
  }
  const email = String(pedido.email ?? "").trim();
  if (!EMAIL_VALIDO.test(email)) {
    return jsonResponse(400, { message: "Revisa tu correo electrónico." });
  }
  const orden = pedido.orden ?? generarId("ORD");
  if (!ORDEN_VALIDA.test(orden)) {
    console.error("[pago] orden con formato inválido:", orden);
    return jsonResponse(400, { message: "No se pudo preparar tu pedido." });
  }
  const descripcion = String(pedido.descripcion ?? "Compra").trim().slice(0, 120) || "Compra";

  const origin = new URL(request.url).origin;
  const rutas = { ...RUTAS_POR_DEFECTO, ...config.rutas };
  const ahora = new Date().toISOString();
  const registro: PedidoGuardado = {
    orden,
    descripcion,
    monto,
    moneda: "CLP",
    email,
    proveedor,
    estado: "pendiente",
    creado: ahora,
    actualizado: ahora,
    metadata: pedido.metadata,
  };

  try {
    // Primero se guarda lo esperado; recién después se crea el cobro.
    await guardarRegistro(env, registro, config);
    const cobro = await crearCobro(proveedor, env, config, {
      orden,
      descripcion,
      monto,
      email,
      urlConfirmacion: urlAbsoluta(
        origin,
        proveedor === "flow" ? rutas.webhookFlow : rutas.webhookMercadoPago
      ),
      urlRetorno: urlAbsoluta(origin, `${rutas.retorno}?proveedor=${proveedor}`),
    });
    registro.idProveedor = cobro.idProveedor;
    await guardarRegistro(env, registro, config);
    return jsonResponse(200, { redirectUrl: cobro.redirectUrl, orden });
  } catch (e) {
    console.error(`[pago] no se pudo crear el cobro en ${proveedor}`, e);
    return jsonResponse(502, { message: "No se pudo iniciar el pago. Intenta nuevamente." });
  }
}

// ─────────────────────────── aplicar confirmación ───────────────────────────

type Desenlace =
  | "confirmado"
  | "ya-confirmado"
  | "orden-desconocida"
  | "monto-no-coincide"
  | "estado-actualizado";

/**
 * Corazón de la seguridad: compara lo que dice el PROVEEDOR con lo que se
 * ESPERABA cobrar, y solo entonces confirma. Devuelve qué pasó.
 */
export async function aplicarResultado(
  resultado: ResultadoProveedor,
  env: EnvPago,
  config: ConfigPago
): Promise<Desenlace> {
  if (!ORDEN_VALIDA.test(resultado.orden)) return "orden-desconocida";

  const registro = await leerRegistro(env, resultado.orden);
  const esperado = config.verificarPedido
    ? await config.verificarPedido(resultado.orden, env)
    : registro
      ? { monto: registro.monto }
      : null;

  if (!esperado) {
    console.error(`[pago] confirmación de una orden desconocida: ${resultado.orden}`);
    return "orden-desconocida";
  }

  if (registro?.estado === "pagada") return "ya-confirmado";

  const actualizar = async (estado: PedidoGuardado["estado"]) => {
    if (!registro) return;
    registro.estado = estado;
    registro.idProveedor = resultado.idProveedor;
    registro.actualizado = new Date().toISOString();
    await guardarRegistro(env, registro, config);
  };

  if (resultado.estado !== "pagada") {
    await actualizar(resultado.estado);
    return "estado-actualizado";
  }

  const monedaOk = !resultado.moneda || resultado.moneda === "CLP";
  const montoOk = Math.round(resultado.monto) === Math.round(esperado.monto);
  if (!monedaOk || !montoOk) {
    console.error(
      `[pago] ALERTA: ${resultado.proveedor} informa pago de ${resultado.monto} ${resultado.moneda ?? ""}` +
        ` para la orden ${resultado.orden}, se esperaba ${esperado.monto} CLP. No se confirma.`
    );
    await actualizar("en-revision");
    return "monto-no-coincide";
  }

  // Primero el sitio hace lo suyo; solo si sale bien se marca pagada, para
  // que un error del sitio provoque un reintento del proveedor.
  await config.onConfirmado(
    {
      orden: resultado.orden,
      monto: Math.round(resultado.monto),
      proveedor: resultado.proveedor,
      idProveedor: resultado.idProveedor,
      pedido: registro,
    },
    env
  );
  await actualizar("pagada");
  return "confirmado";
}

async function responderDesenlace(
  promesa: Promise<Desenlace>,
  etiqueta: string
): Promise<Response> {
  try {
    await promesa;
    return new Response("OK", { status: 200 });
  } catch (e) {
    // Falló algo de NUESTRO lado (onConfirmado, KV, red): 500 para que el
    // proveedor reintente más tarde.
    console.error(`[pago] ${etiqueta}: error al confirmar`, e);
    return new Response("Error", { status: 500 });
  }
}

// ──────────────────────────────── WEBHOOKS ────────────────────────────────

/** Webhook de Flow: llega un token; la verdad se consulta con getStatus. */
export async function webhookFlow(
  request: Request,
  env: EnvPago,
  config: ConfigPago
): Promise<Response> {
  if (!config.proveedores.includes("flow")) return new Response("No", { status: 404 });

  let token: unknown = null;
  try {
    const fd = await request.formData();
    token = fd.get("token");
  } catch {
    token = new URL(request.url).searchParams.get("token");
  }
  if (!tokenFlowValido(token)) return new Response("Token inválido", { status: 400 });
  if (!proveedorConfigurado("flow", env)) return new Response("No configurado", { status: 503 });

  return responderDesenlace(
    (async () => {
      const resultado = await consultarCobroFlow(
        credencialesFlow(env, config.sandboxFlow),
        token as string
      );
      return aplicarResultado(resultado, env, config);
    })(),
    "flow"
  );
}

/**
 * Webhook de Mercado Pago: valida la firma x-signature (si hay secreto
 * configurado) y luego consulta el pago a la API. Solo procesa avisos de
 * tipo "payment"; el resto se acepta y se ignora.
 */
export async function webhookMercadoPago(
  request: Request,
  env: EnvPago,
  config: ConfigPago
): Promise<Response> {
  if (!config.proveedores.includes("mercadopago")) {
    return new Response("No", { status: 404 });
  }

  const url = new URL(request.url);
  let cuerpo: Record<string, unknown> = {};
  try {
    const texto = await request.text();
    if (texto.length <= TAMANO_MAXIMO_CUERPO && texto) cuerpo = JSON.parse(texto);
  } catch {
    cuerpo = {};
  }

  const tipo =
    url.searchParams.get("type") ??
    url.searchParams.get("topic") ??
    (typeof cuerpo.type === "string" ? cuerpo.type : null);
  const datos = (cuerpo.data ?? {}) as { id?: unknown };
  const dataId =
    url.searchParams.get("data.id") ??
    url.searchParams.get("id") ??
    (datos.id !== undefined ? String(datos.id) : null);

  const secreto = secretoWebhookMercadoPago(env);
  if (secreto) {
    const valida = await verificarFirmaMercadoPago({
      xSignature: request.headers.get("x-signature"),
      xRequestId: request.headers.get("x-request-id"),
      dataId,
      secreto,
    });
    if (!valida) {
      console.warn("[pago] webhook Mercado Pago con firma inválida: rechazado");
      return new Response("Firma inválida", { status: 401 });
    }
  } else {
    console.warn(
      "[pago] MP_WEBHOOK_SECRET no configurado: no se valida la firma (igual se consulta el pago a la API)."
    );
  }

  if (tipo !== "payment") return new Response("OK", { status: 200 });
  if (!idPagoMercadoPagoValido(dataId)) return new Response("Id inválido", { status: 400 });
  if (!proveedorConfigurado("mercadopago", env)) {
    return new Response("No configurado", { status: 503 });
  }

  return responderDesenlace(
    (async () => {
      const resultado = await consultarCobroMercadoPago(tokenMercadoPago(env), dataId as string);
      return aplicarResultado(resultado, env, config);
    })(),
    "mercadopago"
  );
}

// ─────────────────────────── estado (página de retorno) ───────────────────────────

/**
 * Para MOSTRARLE el resultado al comprador al volver del proveedor. Solo
 * informa; lo que confirma el pedido es el webhook. Si hay registro en KV,
 * se prefiere ese (ya pasó por la verificación de monto).
 */
export async function consultarEstado(
  request: Request,
  env: EnvPago,
  config: ConfigPago
): Promise<Response> {
  const url = new URL(request.url);
  let token: string | null = url.searchParams.get("token");
  if (!token && request.method === "POST") {
    try {
      const fd = await request.formData();
      const t = fd.get("token");
      token = typeof t === "string" ? t : null;
    } catch {
      token = null;
    }
  }
  const paymentId = url.searchParams.get("payment_id");

  try {
    let resultado: ResultadoProveedor | null = null;
    if (paymentId && config.proveedores.includes("mercadopago") && idPagoMercadoPagoValido(paymentId)) {
      resultado = await consultarCobroMercadoPago(tokenMercadoPago(env), paymentId);
    } else if (token && config.proveedores.includes("flow") && tokenFlowValido(token)) {
      resultado = await consultarCobroFlow(credencialesFlow(env, config.sandboxFlow), token);
    }

    const orden = resultado?.orden ?? url.searchParams.get("external_reference") ?? "";
    const registro = ORDEN_VALIDA.test(orden) ? await leerRegistro(env, orden) : null;

    if (!resultado && !registro) {
      return jsonResponse(200, { estado: "desconocido" });
    }
    return jsonResponse(200, {
      estado: registro?.estado ?? resultado?.estado ?? "desconocido",
      orden,
      monto: registro?.monto ?? resultado?.monto,
    });
  } catch (e) {
    console.error("[pago] consultarEstado falló", e);
    return jsonResponse(200, { estado: "desconocido" });
  }
}
