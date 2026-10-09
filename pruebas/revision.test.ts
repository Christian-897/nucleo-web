/**
 * Revisión de pagos con Flow: Flow falso (fetch interceptado) y KV en
 * memoria. Se corre con `npm test`.
 */
import assert from "node:assert/strict";
import type { AlmacenKV } from "../core/tipos";
import { compararPagos, diasLocales, leerListaFlow, revisarPagosFlow, type PagoFlowListado } from "../modulos/pago/revision";
import type { EnvPago, PedidoGuardado } from "../modulos/pago/config";
import { firmarFlow } from "../modulos/pago/proveedores/flow";

let pasaron = 0;
async function prueba(nombre: string, fn: () => Promise<void> | void) {
  await fn();
  pasaron++;
  console.log("  ok —", nombre);
}

function kvMemoria() {
  const datos = new Map<string, string>();
  const kv: AlmacenKV = {
    async get(k) { return datos.get(k) ?? null; },
    async put(k, v) { datos.set(k, v); },
    async delete(k) { datos.delete(k); },
    async list(o) { return { keys: [...datos.keys()].filter((k) => k.startsWith(o?.prefix ?? "")).map((name) => ({ name })) }; },
  };
  return { kv, datos };
}

const AHORA = new Date("2026-10-09T15:00:00Z");
const pedido = (orden: string, monto: number, estado = "pagada", creado = "2026-10-08T12:00:00Z"): PedidoGuardado =>
  ({ orden, descripcion: "x", monto, moneda: "CLP", email: "c@c.cl", proveedor: "flow", estado, creado, actualizado: creado }) as PedidoGuardado;
const pago = (commerceOrder: string, amount: number, status = 2): PagoFlowListado => ({ commerceOrder, amount, status, requestDate: "2026-10-08 12:01:00", payer: "c@c.cl" });

async function run() {
  console.log("Revisión de pagos:");

  await prueba("acepta la lista de Flow como arreglo o como texto JSON", () => {
    assert.equal(leerListaFlow([{ a: 1 }]).length, 1);
    assert.equal(leerListaFlow('[{"a":1},{"b":2}]').length, 2);
    assert.equal(leerListaFlow("no es json").length, 0);
    assert.equal(leerListaFlow(null).length, 0);
  });

  await prueba("días en hora de Chile, sin repetir", () => {
    const d = diasLocales(3, new Date("2026-10-09T02:00:00Z"));
    assert.deepEqual(d, ["2026-10-08", "2026-10-07", "2026-10-06"], "a las 23:00 de Chile sigue siendo el 8");
  });

  await prueba("compara: cobro ajeno, monto distinto, sin confirmar y pedido que Flow no tiene", () => {
    const tienda = new Map([
      ["A1", pedido("A1", 10000)],
      ["A2", pedido("A2", 5000)],
      ["A3", pedido("A3", 7000, "pendiente")],
      ["A4", pedido("A4", 3000)],
      ["VIEJO", pedido("VIEJO", 1000, "pagada", "2026-09-01T00:00:00Z")],
    ]);
    const r = compararPagos([pago("A1", 10000), pago("A2", 9999), pago("A3", 7000), pago("X9", 50000), pago("R1", 100, 3)], tienda, "2026-10-03");
    const tipos = Object.fromEntries(r.alertas.map((a) => [a.orden, a.tipo]));
    assert.deepEqual(tipos, { A2: "monto", A3: "sin-confirmar", X9: "ajeno" });
    assert.deepEqual(r.dudosos.map((p) => p.orden), ["A4"], "los pedidos fuera del período no cuentan");
    assert.equal(r.pagados, 4, "solo cuentan los pagados en Flow");
  });

  // Flow falso: verifica la firma de cada llamada.
  const SECRETO = "secreto-de-prueba";
  function flowFalso(porDia: Record<string, unknown>, estados: Record<string, unknown> = {}, falla = false) {
    const llamadas: string[] = [];
    const f = (async (url: string | URL | Request) => {
      const u = new URL(String(url));
      llamadas.push(u.pathname);
      if (falla) return new Response("error", { status: 500 });
      const params = Object.fromEntries(u.searchParams);
      const { s, ...resto } = params;
      assert.equal(s, await firmarFlow(resto, SECRETO), "toda llamada va firmada");
      assert.ok(u.hostname === "sandbox.flow.cl");
      if (u.pathname.endsWith("/payment/getPayments")) return new Response(JSON.stringify({ total: 1, hasMore: 0, data: porDia[params.date] ?? "[]" }));
      if (u.pathname.endsWith("/payment/getStatusByCommerceId")) return new Response(JSON.stringify(estados[params.commerceOrder] ?? { status: 1, amount: 0, commerceOrder: params.commerceOrder }));
      return new Response("{}", { status: 404 });
    }) as typeof fetch;
    return { f, llamadas };
  }

  await prueba("revisa con Flow: un pedido pagado otro día no da falsa alarma; uno inventado sí", async () => {
    const { kv } = kvMemoria();
    await kv.put("pago:pedido:B1", JSON.stringify(pedido("B1", 2000)));
    await kv.put("pago:pedido:B2", JSON.stringify(pedido("B2", 4000)));
    const env: EnvPago = { REVIEWS_KV: kv, FLOW_API_KEY: "k", FLOW_SECRET_KEY: SECRETO + "\n", FLOW_SANDBOX: "1" };
    // El día 8 Flow lista B1 (como texto JSON) y un cobro ajeno; B2 no aparece en la lista pero sí está pagado.
    const { f } = flowFalso(
      { "2026-10-08": JSON.stringify([{ commerceOrder: "B1", status: 2, amount: 2000 }, { commerceOrder: "Z1", status: 2, amount: 99000, payer: "x@x.cl" }]) },
      { B2: { commerceOrder: "B2", status: 2, amount: 4000 } }
    );
    const r = await revisarPagosFlow(env, { fetch: f, ahora: AHORA });
    assert.equal(r.conectado, true);
    assert.equal(r.sandbox, true);
    assert.deepEqual(r.alertas!.map((a) => [a.tipo, a.orden]), [["ajeno", "Z1"]]);
    assert.equal(r.pedidosTienda, 2);
  });

  await prueba("guarda 30 minutos; 'forzar' consulta de nuevo", async () => {
    const { kv } = kvMemoria();
    const env: EnvPago = { REVIEWS_KV: kv, FLOW_API_KEY: "k", FLOW_SECRET_KEY: SECRETO, FLOW_SANDBOX: "1" };
    const a = flowFalso({});
    await revisarPagosFlow(env, { fetch: a.f, ahora: AHORA });
    const n = a.llamadas.length;
    await revisarPagosFlow(env, { fetch: a.f, ahora: AHORA });
    assert.equal(a.llamadas.length, n, "segunda vez desde la caché");
    await revisarPagosFlow(env, { fetch: a.f, ahora: AHORA, forzar: true });
    assert.ok(a.llamadas.length > n);
  });

  await prueba("sin claves no está conectado; si Flow falla, avisa sin romper", async () => {
    const { kv } = kvMemoria();
    assert.deepEqual(await revisarPagosFlow({ REVIEWS_KV: kv }), { conectado: false });
    const env: EnvPago = { REVIEWS_KV: kv, FLOW_API_KEY: "k", FLOW_SECRET_KEY: SECRETO, FLOW_SANDBOX: "1" };
    const r = await revisarPagosFlow(env, { fetch: flowFalso({}, {}, true).f, ahora: AHORA, forzar: true });
    assert.ok(r.error);
    assert.equal(r.alertas, undefined);
  });

  console.log(`\n${pasaron} pruebas pasaron.`);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
