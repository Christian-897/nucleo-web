/**
 * Prueba del cliente de Flow. Lo crítico es la FIRMA: si está mal, Flow
 * rechaza todo. Se compara contra un HMAC de referencia (node:crypto) y se
 * verifica que el request a payment/create vaya correctamente firmado.
 * No se toca Flow de verdad: se intercepta fetch. Se corre con `npm test`.
 */
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import {
  firmarFlow,
  crearPagoFlow,
  nombreEstado,
} from "../modulos/pago/flow";

let pasaron = 0;
async function prueba(nombre: string, fn: () => Promise<void> | void) {
  await fn();
  pasaron++;
  console.log("  ok —", nombre);
}

function firmaReferencia(params: Record<string, string>, secret: string): string {
  const concat = Object.keys(params)
    .sort()
    .map((k) => k + params[k])
    .join("");
  return createHmac("sha256", secret).update(concat).digest("hex");
}

async function run() {
  console.log("Pago (Flow):");

  await prueba("la firma coincide con el HMAC-SHA256 de referencia", async () => {
    const params = { b: "2", a: "1", c: "3", monto: "19990" };
    const secret = "secreto-de-prueba";
    const nuestra = await firmarFlow(params, secret);
    assert.equal(nuestra, firmaReferencia(params, secret));
  });

  await prueba("crearPagoFlow arma un request bien firmado a sandbox", async () => {
    const original = globalThis.fetch;
    let urlLlamada = "";
    let bodyLlamado = "";
    // @ts-expect-error reemplazo temporal de fetch para la prueba
    globalThis.fetch = async (url: string, init: RequestInit) => {
      urlLlamada = String(url);
      bodyLlamado = String(init?.body ?? "");
      return new Response(
        JSON.stringify({ token: "TK123", url: "https://sandbox.flow.cl/pay", flowOrder: 99 }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    };

    try {
      const r = await crearPagoFlow(
        { apiKey: "API", secretKey: "SECRETO", sandbox: true },
        {
          commerceOrder: "ORD-1",
          subject: "Pedido 1",
          amount: 19990,
          email: "cliente@example.com",
          urlConfirmation: "https://sitio.cl/api/pago/confirmacion",
          urlReturn: "https://sitio.cl/pago/retorno",
        }
      );

      assert.ok(urlLlamada.startsWith("https://sandbox.flow.cl/api/payment/create"));
      assert.equal(r.redirectUrl, "https://sandbox.flow.cl/pay?token=TK123");

      // Reconstruir params del body, sacar s y re-firmar: debe coincidir.
      const enviados = new URLSearchParams(bodyLlamado);
      const s = enviados.get("s");
      assert.ok(s, "el body debe incluir la firma s");
      const sinS: Record<string, string> = {};
      enviados.forEach((v, k) => {
        if (k !== "s") sinS[k] = v;
      });
      assert.equal(s, firmaReferencia(sinS, "SECRETO"));
      // Y el monto va como entero en CLP.
      assert.equal(sinS.amount, "19990");
      assert.equal(sinS.currency, "CLP");
    } finally {
      globalThis.fetch = original;
    }
  });

  await prueba("mapea los estados de Flow", () => {
    assert.equal(nombreEstado(1), "pendiente");
    assert.equal(nombreEstado(2), "pagada");
    assert.equal(nombreEstado(3), "rechazada");
    assert.equal(nombreEstado(4), "anulada");
    assert.equal(nombreEstado(99), "desconocido");
  });

  console.log(`\n${pasaron} pruebas pasaron.`);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
