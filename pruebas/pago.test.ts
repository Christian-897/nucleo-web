/**
 * Pruebas de SEGURIDAD del módulo pago (Flow + Mercado Pago). Intentan
 * romperlo como lo haría un atacante. No tocan los proveedores reales: se
 * intercepta fetch y se usa un KV en memoria. Se corre con `npm test`.
 */
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import type { AlmacenKV } from "../core/tipos";
import { validarCarrito } from "../modulos/carrito/servidor";
import {
  ErrorPedido,
  crearEndpointsPago,
  destinoPermitido,
  firmarFlow,
  verificarFirmaMercadoPago,
  type ConfigPago,
  type ConfirmacionPago,
  type EnvPago,
} from "../modulos/pago/index";

let pasaron = 0;
async function prueba(nombre: string, fn: () => Promise<void> | void) {
  await fn();
  pasaron++;
  console.log("  ok —", nombre);
}

const hmac = (secreto: string, msg: string) =>
  createHmac("sha256", secreto).update(msg).digest("hex");

// ─────────────── entorno de prueba: KV en memoria + proveedores falsos ───────────────

function kvMemoria() {
  const datos = new Map<string, string>();
  const kv: AlmacenKV = {
    async get(k) { return datos.get(k) ?? null; },
    async put(k, v) { datos.set(k, v); },
    async delete(k) { datos.delete(k); },
    async list(o = {}) {
      return { keys: [...datos.keys()].filter((k) => !o.prefix || k.startsWith(o.prefix)).map((name) => ({ name })) };
    },
  };
  return { kv, datos };
}

const pagosMP: Record<string, Record<string, unknown>> = {};
const pagosFlow: Record<string, Record<string, unknown>> = {};
let ultimaPreferenciaMP: Record<string, any> | null = null;
let ultimoCobroFlow: URLSearchParams | null = null;

const fetchOriginal = globalThis.fetch;
globalThis.fetch = (async (entrada: string | URL | Request, init?: RequestInit) => {
  const url = String(entrada);
  const json = (o: unknown) =>
    new Response(JSON.stringify(o), { status: 200, headers: { "Content-Type": "application/json" } });

  if (url === "https://api.mercadopago.com/checkout/preferences") {
    ultimaPreferenciaMP = JSON.parse(String(init?.body));
    return json({ id: "PREF1", init_point: "https://www.mercadopago.cl/checkout/v1/redirect?pref_id=PREF1" });
  }
  const mp = url.match(/^https:\/\/api\.mercadopago\.com\/v1\/payments\/(.+)$/);
  if (mp) return json(pagosMP[decodeURIComponent(mp[1])] ?? {});
  if (url === "https://sandbox.flow.cl/api/payment/create") {
    ultimoCobroFlow = new URLSearchParams(String(init?.body));
    return json({ token: "FTOK1", url: "https://sandbox.flow.cl/app/web/pay.php", flowOrder: 7 });
  }
  if (url.startsWith("https://sandbox.flow.cl/api/payment/getStatus")) {
    const token = new URL(url).searchParams.get("token") ?? "";
    return json(pagosFlow[token] ?? {});
  }
  throw new Error("fetch inesperado en prueba: " + url);
}) as typeof fetch;

const catalogo: Record<string, { id: string; nombre: string; precio: number; stock?: number }> = {
  silla: { id: "silla", nombre: "Silla", precio: 19990, stock: 10 },
};

const confirmados: ConfirmacionPago[] = [];

function crearConfig(proveedores: ConfigPago["proveedores"]): ConfigPago {
  return {
    proveedores,
    async prepararPedido(cuerpo) {
      const carrito = await validarCarrito(cuerpo.items, {
        obtenerProducto: (id) => catalogo[id] ?? null,
      });
      if (!carrito.listoParaPagar) throw new ErrorPedido("Tu carrito cambió, revísalo.");
      return {
        descripcion: "Compra de prueba",
        monto: carrito.total, // ← SIEMPRE del servidor
        email: String(cuerpo.email ?? ""),
        metadata: { lineas: carrito.lineas },
      };
    },
    onConfirmado(c) {
      confirmados.push(c);
    },
  };
}

const ORIGEN = "https://sitio.cl";
const { kv, datos } = kvMemoria();
const env: EnvPago = {
  REVIEWS_KV: kv,
  MP_ACCESS_TOKEN: "TEST-token",
  MP_WEBHOOK_SECRET: "secreto-webhook",
  FLOW_API_KEY: "API",
  FLOW_SECRET_KEY: "SECRETO",
  FLOW_SANDBOX: "1",
};

const pago = crearEndpointsPago(crearConfig(["flow", "mercadopago"]));

function pedirPago(cuerpo: unknown, origen = ORIGEN) {
  return pago.iniciar.onRequestPost({
    request: new Request(`${ORIGEN}/api/pago/iniciar`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: origen },
      body: JSON.stringify(cuerpo),
    }),
    env,
  });
}

function webhookMP(id: string, opciones: { firmaFalsa?: boolean } = {}) {
  const ts = "1700000000";
  const requestId = "req-" + id;
  const v1 = opciones.firmaFalsa
    ? "0".repeat(64)
    : hmac("secreto-webhook", `id:${id.toLowerCase()};request-id:${requestId};ts:${ts};`);
  return pago.webhookMercadoPago.onRequestPost({
    request: new Request(`${ORIGEN}/api/pago/webhook-mercadopago?data.id=${id}&type=payment`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-signature": `ts=${ts},v1=${v1}`,
        "x-request-id": requestId,
      },
      body: JSON.stringify({ type: "payment", data: { id } }),
    }),
    env,
  });
}

const registro = (orden: string) => JSON.parse(datos.get(`pago:pedido:${orden}`) ?? "null");

// ─────────────────────────────────── pruebas ───────────────────────────────────

async function run() {
  console.log("Firmas:");

  await prueba("firma Flow = HMAC-SHA256 de referencia", async () => {
    const p = { b: "2", a: "1", amount: "19990" };
    const concat = Object.keys(p).sort().map((k) => k + p[k as keyof typeof p]).join("");
    assert.equal(await firmarFlow(p, "s3cr3t"), hmac("s3cr3t", concat));
  });

  await prueba("firma Mercado Pago válida se acepta (data.id en mayúsculas se normaliza)", async () => {
    const v1 = hmac("k", "id:abc123;request-id:r1;ts:99;");
    assert.equal(
      await verificarFirmaMercadoPago({ xSignature: `ts=99,v1=${v1}`, xRequestId: "r1", dataId: "ABC123", secreto: "k" }),
      true
    );
  });

  await prueba("firma Mercado Pago alterada, con otra clave o sin ts se rechaza", async () => {
    const v1 = hmac("k", "id:1;request-id:r1;ts:99;");
    assert.equal(await verificarFirmaMercadoPago({ xSignature: `ts=99,v1=${v1.replace(/.$/, "0")}`, xRequestId: "r1", dataId: "1", secreto: "k" }), false);
    assert.equal(await verificarFirmaMercadoPago({ xSignature: `ts=99,v1=${v1}`, xRequestId: "r1", dataId: "1", secreto: "otra" }), false);
    assert.equal(await verificarFirmaMercadoPago({ xSignature: `v1=${v1}`, xRequestId: "r1", dataId: "1", secreto: "k" }), false);
  });

  console.log("Redirección:");

  await prueba("solo redirige a HTTPS de Flow / Mercado Pago", () => {
    assert.equal(destinoPermitido("https://sandbox.flow.cl/pay?token=x"), true);
    assert.equal(destinoPermitido("https://www.mercadopago.cl/checkout/v1/redirect"), true);
    assert.equal(destinoPermitido("http://www.flow.cl/pay"), false);
    assert.equal(destinoPermitido("https://flow.cl.sitio-falso.com/pay"), false);
    assert.equal(destinoPermitido("https://evil.com"), false);
  });

  console.log("Iniciar pago:");

  let ordenMP = "";
  await prueba("el monto que manda el navegador se IGNORA (se cobra el del servidor)", async () => {
    const res = await pedirPago({
      proveedor: "mercadopago",
      email: "cliente@example.com",
      monto: 1, // intento de manipulación
      items: [{ productoId: "silla", cantidad: 2, precio: 1 }],
    });
    assert.equal(res.status, 200);
    const body = (await res.json()) as { redirectUrl: string; orden: string };
    ordenMP = body.orden;
    assert.equal(ultimaPreferenciaMP?.items[0].unit_price, 39980);
    assert.equal(registro(ordenMP).monto, 39980);
    assert.equal(registro(ordenMP).estado, "pendiente");
  });

  await prueba("rechaza un proveedor no habilitado", async () => {
    const soloMP = crearEndpointsPago(crearConfig(["mercadopago"]));
    const res = await soloMP.iniciar.onRequestPost({
      request: new Request(`${ORIGEN}/api/pago/iniciar`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: ORIGEN },
        body: JSON.stringify({ proveedor: "flow", email: "a@b.cl", items: [{ productoId: "silla", cantidad: 1 }] }),
      }),
      env,
    });
    assert.equal(res.status, 400);
  });

  await prueba("rechaza peticiones desde otro origen", async () => {
    const res = await pedirPago({ proveedor: "mercadopago", email: "a@b.cl", items: [] }, "https://evil.com");
    assert.equal(res.status, 403);
  });

  await prueba("muestra el mensaje de ErrorPedido (carrito inválido)", async () => {
    const res = await pedirPago({ proveedor: "mercadopago", email: "a@b.cl", items: [{ productoId: "no-existe", cantidad: 1 }] });
    assert.equal(res.status, 400);
    assert.equal(((await res.json()) as { message: string }).message, "Tu carrito cambió, revísalo.");
  });

  console.log("Webhook Mercado Pago:");

  await prueba("firma falsa → 401 y no confirma nada", async () => {
    pagosMP["555"] = { id: 555, status: "approved", transaction_amount: 39980, currency_id: "CLP", external_reference: ordenMP };
    const antes = confirmados.length;
    const res = await webhookMP("555", { firmaFalsa: true });
    assert.equal(res.status, 401);
    assert.equal(confirmados.length, antes);
  });

  await prueba("pago aprobado con monto correcto → confirma UNA vez", async () => {
    const antes = confirmados.length;
    const res = await webhookMP("555");
    assert.equal(res.status, 200);
    assert.equal(confirmados.length, antes + 1);
    assert.equal(registro(ordenMP).estado, "pagada");
    assert.ok(confirmados.at(-1)?.pedido?.metadata, "onConfirmado recibe la metadata del pedido");
  });

  await prueba("el mismo aviso repetido NO confirma dos veces (idempotente)", async () => {
    const antes = confirmados.length;
    await webhookMP("555");
    await webhookMP("555");
    assert.equal(confirmados.length, antes);
  });

  await prueba("pago aprobado por un monto DISTINTO → en-revision, no confirma", async () => {
    const res = await pedirPago({ proveedor: "mercadopago", email: "c@d.cl", items: [{ productoId: "silla", cantidad: 1 }] });
    const { orden } = (await res.json()) as { orden: string };
    pagosMP["777"] = { id: 777, status: "approved", transaction_amount: 100, currency_id: "CLP", external_reference: orden };
    const antes = confirmados.length;
    await webhookMP("777");
    assert.equal(confirmados.length, antes);
    assert.equal(registro(orden).estado, "en-revision");
  });

  await prueba("pago de una orden que no existe → no confirma", async () => {
    pagosMP["888"] = { id: 888, status: "approved", transaction_amount: 39980, currency_id: "CLP", external_reference: "ORDinventada" };
    const antes = confirmados.length;
    const res = await webhookMP("888");
    assert.equal(res.status, 200);
    assert.equal(confirmados.length, antes);
  });

  console.log("Webhook Flow:");

  await prueba("Flow: cobro bien firmado y confirmación con monto correcto", async () => {
    const res = await pedirPago({ proveedor: "flow", email: "e@f.cl", items: [{ productoId: "silla", cantidad: 1 }] });
    const { orden } = (await res.json()) as { orden: string };
    // El request a Flow va firmado correctamente.
    const enviado = Object.fromEntries(ultimoCobroFlow!.entries());
    const { s, ...sinFirma } = enviado;
    assert.equal(s, await firmarFlow(sinFirma, "SECRETO"));
    assert.equal(sinFirma.amount, "19990");
    // Flow vuelve con POST: el retorno apunta a la función que lo pasa a GET.
    assert.equal(sinFirma.urlReturn, `${ORIGEN}/api/pago/retorno-flow`);

    pagosFlow["FTOK1"] = { status: 2, commerceOrder: orden, amount: 19990, currency: "CLP" };
    const antes = confirmados.length;
    const r = await pago.webhookFlow.onRequestPost({
      request: new Request(`${ORIGEN}/api/pago/webhook-flow`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: "token=FTOK1",
      }),
      env,
    });
    assert.equal(r.status, 200);
    assert.equal(confirmados.length, antes + 1);
    assert.equal(registro(orden).estado, "pagada");
  });

  console.log("Retorno de Flow (POST → GET):");

  await prueba("el POST de Flow se convierte en GET a la página de retorno con el token", async () => {
    const r = await pago.retornoFlow.onRequestPost({
      request: new Request(`${ORIGEN}/api/pago/retorno-flow`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: "token=FTOK1",
      }),
      env,
    });
    assert.equal(r.status, 303);
    assert.equal(r.headers.get("Location"), "/pago/retorno?proveedor=flow&token=FTOK1");
  });

  await prueba("retorno de Flow: un token raro no se reenvía y no se puede redirigir afuera", async () => {
    for (const token of ["<script>", "a".repeat(500), "x\r\nSet-Cookie: a=b"]) {
      const r = await pago.retornoFlow.onRequestPost({
        request: new Request(`${ORIGEN}/api/pago/retorno-flow`, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ token }).toString(),
        }),
        env,
      });
      assert.equal(r.status, 303);
      assert.equal(r.headers.get("Location"), "/pago/retorno?proveedor=flow");
    }
    const r = await pago.retornoFlow.onRequestGet({ request: new Request(`${ORIGEN}/api/pago/retorno-flow`), env });
    assert.ok(r.headers.get("Location")!.startsWith("/pago/retorno"));
  });

  console.log(`\n${pasaron} pruebas pasaron.`);
}

run()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => {
    globalThis.fetch = fetchOriginal;
  });
