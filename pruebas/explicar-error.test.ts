/**
 * Motivos de error de Flow y Mercado Pago en palabras simples (v0.43.1).
 */
import assert from "node:assert/strict";
import { explicarErrorPago } from "../modulos/pago/explicar-error";

let pasaron = 0;
function prueba(nombre: string, fn: () => void) {
  fn();
  pasaron++;
  console.log("  ok —", nombre);
}
console.log("Motivos de error de pago:");

prueba("Flow: API Key inválida, firma, falla de Flow y otro", () => {
  assert.match(explicarErrorPago("flow", new Error('Flow payment/create 400: {"code":109,"message":"Invalid ApiKey"}')), /no reconoce la API Key \(FLOW_API_KEY\)/);
  assert.match(explicarErrorPago("flow", new Error('Flow payment/getPayments respondió 400: {"code":108,"message":"Invalid apiKey"}')), /FLOW_API_KEY/);
  assert.match(explicarErrorPago("flow", new Error('Flow payment/create 400: {"code":106,"message":"Invalid signature"}')), /FLOW_SECRET_KEY/);
  assert.match(explicarErrorPago("flow", new Error("Flow payment/create 502: <html>")), /falla de su lado/);
  assert.match(explicarErrorPago("flow", new Error('Flow payment/create 400: {"code":1620,"message":"Amount too low"}')), /^Flow rechazó la operación \(400\): Amount too low$/);
});

prueba("Mercado Pago: 401 token, 403 política, 500", () => {
  assert.match(explicarErrorPago("mercadopago", new Error('Mercado Pago preferences 401: {"message":"invalid access token"}')), /MP_ACCESS_TOKEN/);
  assert.match(
    explicarErrorPago("mercadopago", new Error('Mercado Pago preferences 403: {"code":"PA_UNAUTHORIZED_RESULT_FROM_POLICIES","blocked_by":"PolicyAgent","status":403}')),
    /no autoriza a esta cuenta a cobrar/
  );
  assert.match(explicarErrorPago("mercadopago", new Error("Mercado Pago preferences 500: oops")), /falla de su lado/);
});

prueba("sin conexión; nunca devuelve marcado ni textos larguísimos", () => {
  assert.match(explicarErrorPago("flow", new Error("The operation was aborted due to timeout")), /no respondió a tiempo/);
  const raro = explicarErrorPago("mercadopago", new Error('MP 422: {"message":"<script>alert(1)</script>' + "x".repeat(500) + '"}'));
  assert.ok(!/[<>]/.test(raro) && raro.length < 260, raro);
});

console.log(`\n${pasaron} pruebas pasaron.`);
