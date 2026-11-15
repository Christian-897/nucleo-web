/**
 * Pruebas del pago libre (v0.49): monto escrito por la persona, validado en
 * el servidor, con Turnstile, y registrado en el panel solo cuando Flow o
 * Mercado Pago lo confirman. Sin proveedores reales: se intercepta fetch y
 * se usa un KV en memoria. Se corre con `npm test`.
 */
import assert from "node:assert/strict";
import type { AlmacenKV } from "../core/tipos";
import { HONEYPOT_FIELD } from "../core/validar";
import {
  crearEndpointsPagoLibre,
  formatearMonto,
  leerMonto,
  listarPagosLibres,
  validarPagoLibre,
  type ConfigPagoLibre,
  type EnvPagoLibre,
} from "../modulos/pago-libre/index";
import { crearPanel } from "../modulos/panel/endpoint";

let pasaron = 0;
async function prueba(nombre: string, fn: () => Promise<void> | void) {
  await fn();
  pasaron++;
  console.log("  ok —", nombre);
}

// ─── entorno: KV en memoria + Turnstile, Flow y Resend falsos ───
const datos = new Map<string, string>();
const kv: AlmacenKV = {
  async get(k) { return datos.get(k) ?? null; },
  async put(k, v) { datos.set(k, v); },
  async delete(k) { datos.delete(k); },
  async list(o = {}) {
    const keys = [...datos.keys()].filter((k) => !o.prefix || k.startsWith(o.prefix)).sort();
    return { keys: keys.slice(0, o.limit ?? 1000).map((name) => ({ name })) };
  },
};
const pagosFlow: Record<string, Record<string, unknown>> = {};
let ultimoCobroFlow: URLSearchParams | null = null;
const correos: { to: string; subject: string; html: string }[] = [];
let tokenFlow = 0;

globalThis.fetch = (async (entrada: string | URL | Request, init?: RequestInit) => {
  const url = String(entrada);
  const json = (o: unknown) => new Response(JSON.stringify(o), { status: 200, headers: { "Content-Type": "application/json" } });
  if (url === "https://challenges.cloudflare.com/turnstile/v0/siteverify") {
    const token = new URLSearchParams(String(init?.body)).get("response");
    return json(token === "bueno" ? { success: true } : { success: false, "error-codes": ["invalid-input-response"] });
  }
  if (url === "https://sandbox.flow.cl/api/payment/create") {
    ultimoCobroFlow = new URLSearchParams(String(init?.body));
    tokenFlow++;
    return json({ token: `FTOK${tokenFlow}`, url: "https://sandbox.flow.cl/app/web/pay.php", flowOrder: tokenFlow });
  }
  if (url.startsWith("https://sandbox.flow.cl/api/payment/getStatus")) {
    return json(pagosFlow[new URL(url).searchParams.get("token") ?? ""] ?? {});
  }
  if (url === "https://api.resend.com/emails") {
    const c = JSON.parse(String(init?.body));
    correos.push({ to: Array.isArray(c.to) ? c.to[0] : c.to, subject: c.subject, html: c.html });
    return json({ id: "correo" });
  }
  throw new Error("fetch inesperado en prueba: " + url);
}) as typeof fetch;

const ORIGEN = "https://novalis.cl";
const env: EnvPagoLibre = {
  REVIEWS_KV: kv,
  FLOW_API_KEY: "API",
  FLOW_SECRET_KEY: "SECRETO",
  FLOW_SANDBOX: "1",
  TURNSTILE_SECRET_KEY: "secreto-turnstile",
  RESEND_API_KEY: "re_prueba",
  RESEND_FROM: "Novalis <avisos@novalis.cl>",
  ADMIN_NOTIFY_EMAIL: "dueno@novalis.cl",
} as EnvPagoLibre;
const config: ConfigPagoLibre = { nombreSitio: "Novalis", proveedores: ["flow"] };
const pago = crearEndpointsPagoLibre(config);

const base = {
  proveedor: "flow",
  nombre: "Ana Pérez",
  email: "ana@cliente.cl",
  concepto: "anticipo",
  monto: "154.700",
  detalle: "Sitio web, cotización 12",
  aceptaTerminos: true,
  turnstileToken: "bueno",
};
let ip = 0;
function pedir(cuerpo: Record<string, unknown>) {
  ip++; // cada prueba desde otra IP, para no chocar con el tope de intentos
  return pago.iniciar.onRequestPost({
    request: new Request(`${ORIGEN}/api/pago/iniciar`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: ORIGEN, "CF-Connecting-IP": `10.0.0.${ip}` },
      body: JSON.stringify(cuerpo),
    }),
    env,
  });
}
function avisoFlow(token: string) {
  return pago.webhookFlow.onRequestPost({
    request: new Request(`${ORIGEN}/api/pago/webhook-flow`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `token=${token}`,
    }),
    env,
  });
}

console.log("Pago libre:");

await prueba("leerMonto: entiende cómo escribe la gente y rechaza lo raro", () => {
  assert.equal(leerMonto("154.700"), 154700);
  assert.equal(leerMonto("$154.700"), 154700);
  assert.equal(leerMonto(" 154 700 "), 154700);
  assert.equal(leerMonto(90000), 90000);
  for (const malo of ["", "abc", "154,70", "154.700,50", "-5000", "0", "1e6", 12.5, -1, "99999999999", null, {}])
    assert.equal(leerMonto(malo), null, String(malo));
  assert.equal(formatearMonto(154700), "$154.700");
});

await prueba("validación: mínimo, máximo, concepto y términos, cada uno en su campo", () => {
  const v = (extra: Record<string, unknown>) => validarPagoLibre({ ...base, ...extra }, config);
  assert.equal(v({}).ok, true);
  const chico = v({ monto: "1.000" });
  assert.ok(!chico.ok && /mínimo es \$5\.000/.test(chico.fieldErrors.monto[0]));
  const grande = v({ monto: "9.000.000" });
  assert.ok(!grande.ok && /máximo/.test(grande.fieldErrors.monto[0]));
  const concepto = v({ concepto: "regalo" });
  assert.ok(!concepto.ok && concepto.fieldErrors.concepto);
  const terminos = v({ aceptaTerminos: false });
  assert.ok(!terminos.ok && terminos.fieldErrors.aceptaTerminos);
  const correo = v({ email: "no-es-correo" });
  assert.ok(!correo.ok && correo.fieldErrors.email);
});

await prueba("iniciar: a Flow va exactamente el monto escrito, con su concepto", async () => {
  const r = await pedir(base);
  assert.equal(r.status, 200);
  const enviado = Object.fromEntries(ultimoCobroFlow!.entries());
  assert.equal(enviado.amount, "154700");
  assert.equal(enviado.email, "ana@cliente.cl");
  assert.match(enviado.subject, /Anticipo \(50 %\) — Novalis/);
});

await prueba("iniciar: datos malos → 400 con el error en su campo, sin llamar a Flow", async () => {
  ultimoCobroFlow = null;
  const r = await pedir({ ...base, monto: "100" });
  assert.equal(r.status, 400);
  const c = (await r.json()) as { message: string; fieldErrors: Record<string, string[]> };
  assert.equal(c.message, "Revisa los campos marcados.");
  assert.ok(c.fieldErrors.monto?.length);
  assert.equal(ultimoCobroFlow, null);
});

await prueba("iniciar: sin Turnstile válido no hay cobro", async () => {
  ultimoCobroFlow = null;
  const r = await pedir({ ...base, turnstileToken: "malo" });
  assert.equal(r.status, 400);
  assert.match(((await r.json()) as { message: string }).message, /robot/);
  assert.equal(ultimoCobroFlow, null);
});

await prueba("iniciar: el campo trampa lleno frena el cobro", async () => {
  ultimoCobroFlow = null;
  const r = await pedir({ ...base, [HONEYPOT_FIELD]: "http://spam" });
  assert.equal(r.status, 400);
  assert.equal(ultimoCobroFlow, null);
});

await prueba("iniciar: el tope de intentos por IP también rige", async () => {
  const misma = (n: number) =>
    pago.iniciar.onRequestPost({
      request: new Request(`${ORIGEN}/api/pago/iniciar`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: ORIGEN, "CF-Connecting-IP": "10.9.9.9" },
        body: JSON.stringify({ ...base, monto: String(10000 + n) }),
      }),
      env,
    });
  const estados: number[] = [];
  for (let i = 0; i < 7; i++) estados.push((await misma(i)).status);
  assert.ok(estados.includes(400) || estados.includes(429), `estados: ${estados}`);
  assert.equal(estados[0], 200);
});

await prueba("confirmado por Flow: queda en el panel y salen dos correos, con el texto escapado", async () => {
  correos.length = 0;
  const r = await pedir({ ...base, nombre: "Ana <script>x</script>", monto: "80.000", concepto: "saldo" });
  assert.equal(r.status, 200);
  const { orden } = (await r.json()) as { orden: string };
  const token = `FTOK${tokenFlow}`;
  pagosFlow[token] = { status: 2, commerceOrder: orden, amount: 80000, currency: "CLP" };
  assert.equal((await avisoFlow(token)).status, 200);

  const { pagos } = await listarPagosLibres(env);
  const p = pagos.find((x) => x.orden === orden)!;
  assert.ok(p, "el pago quedó registrado");
  assert.equal(p.monto, 80000);
  assert.equal(p.conceptoLabel, "Saldo final (50 %)");
  assert.equal(p.proveedor, "flow");

  assert.equal(correos.length, 2);
  assert.ok(correos.some((c) => c.to === "dueno@novalis.cl" && /Pago recibido: \$80\.000/.test(c.subject)));
  assert.ok(correos.some((c) => c.to === "ana@cliente.cl"));
  for (const c of correos) assert.ok(!c.html.includes("<script>"), "el nombre va escapado");

  // El proveedor reintenta el aviso: no se duplica ni se repiten correos.
  assert.equal((await avisoFlow(token)).status, 200);
  assert.equal((await listarPagosLibres(env)).pagos.filter((x) => x.orden === orden).length, 1);
  assert.equal(correos.length, 2);
});

await prueba("Flow informa otro monto: no se registra como pago", async () => {
  const r = await pedir({ ...base, monto: "60.000" });
  const { orden } = (await r.json()) as { orden: string };
  const token = `FTOK${tokenFlow}`;
  pagosFlow[token] = { status: 2, commerceOrder: orden, amount: 6000, currency: "CLP" };
  await avisoFlow(token);
  assert.ok(!(await listarPagosLibres(env)).pagos.some((x) => x.orden === orden));
});

await prueba("pagos rechazados no aparecen", async () => {
  const r = await pedir({ ...base, monto: "70.000" });
  const { orden } = (await r.json()) as { orden: string };
  const token = `FTOK${tokenFlow}`;
  pagosFlow[token] = { status: 3, commerceOrder: orden, amount: 70000, currency: "CLP" };
  await avisoFlow(token);
  assert.ok(!(await listarPagosLibres(env)).pagos.some((x) => x.orden === orden));
});

await prueba("lista del panel: el más nuevo primero", async () => {
  const r = await pedir({ ...base, monto: "33.000" });
  const { orden } = (await r.json()) as { orden: string };
  const token = `FTOK${tokenFlow}`;
  pagosFlow[token] = { status: 2, commerceOrder: orden, amount: 33000, currency: "CLP" };
  await new Promise((ok) => setTimeout(ok, 5));
  await avisoFlow(token);
  const { pagos } = await listarPagosLibres(env);
  assert.equal(pagos[0].orden, orden);
  assert.equal(pagos.length, 2);
});

await prueba("panel: /api/admin/pagos exige sesión, y sin `pagos: true` no existe", async () => {
  const con = crearPanel({ nombreSitio: "Novalis", pagos: true });
  const sin = crearPanel({ nombreSitio: "Novalis" });
  const pedirPanel = (p: typeof con) => p.pagos.onRequestGet({ request: new Request(`${ORIGEN}/api/admin/pagos`), env } as never);
  assert.equal((await pedirPanel(con)).status, 401);
  assert.equal((await pedirPanel(sin)).status, 404);
});

console.log(`\n${pasaron} pruebas pasaron.`);
