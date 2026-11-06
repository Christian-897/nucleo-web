/**
 * Prueba de la medición (v0.46 Google Analytics, v0.47 píxel de Meta): decisión de cookies, que nada se active sin
 * aceptar, eventos de la tienda (carrito, ir a pagar, compra una sola vez) y
 * su traducción a Google Analytics. Se corre con `npm test`.
 */
import assert from "node:assert/strict";

// Navegador mínimo: window con eventos y localStorage en memoria.
const datos = new Map<string, string>();
const ventana = new EventTarget() as EventTarget & Record<string, unknown>;
(globalThis as Record<string, unknown>).window = ventana;
(globalThis as Record<string, unknown>).localStorage = {
  getItem: (k: string) => datos.get(k) ?? null,
  setItem: (k: string, v: string) => void datos.set(k, String(v)),
  removeItem: (k: string) => void datos.delete(k),
};

const { decisionVigente, guardarDecision, leerDecision, cuandoAcepte, CLAVE_DECISION } = await import("../modulos/medicion/consentimiento");
const { escucharEventos, avisarCompraConfirmada, emitirIniciarCompra, EVENTO_AGREGAR, EVENTO_COMPRA } = await import("../modulos/medicion/eventos");
const { idGoogleAnalyticsValido, eventoParaGoogle } = await import("../modulos/medicion/google-analytics");
const { crearCarrito } = await import("../modulos/carrito/cliente");
const { idPixelMetaValido, eventoParaMeta } = await import("../modulos/medicion/pixel-meta");

let pasaron = 0;
async function prueba(nombre: string, fn: () => Promise<void> | void) {
  await fn();
  pasaron++;
  console.log("  ok —", nombre);
}

console.log("Medición:");

await prueba("decisión: válida, vencida a los 180 días, futura o basura = sin decisión", () => {
  const ahora = Date.parse("2026-11-05T12:00:00Z");
  const d = (dias: number, extra: Record<string, unknown> = {}) =>
    JSON.stringify({ v: 1, medicion: true, fecha: new Date(ahora - dias * 86_400_000).toISOString(), ...extra });
  assert.equal(decisionVigente(d(10), ahora)?.medicion, true);
  assert.equal(decisionVigente(d(181), ahora), null);
  assert.equal(decisionVigente(d(-2), ahora), null, "fecha en el futuro");
  assert.equal(decisionVigente(d(1, { v: 2 }), ahora), null, "otra versión");
  assert.equal(decisionVigente(d(1, { medicion: "si" }), ahora), null);
  assert.equal(decisionVigente("{roto", ahora), null);
  assert.equal(decisionVigente(null, ahora), null);
});

await prueba("nada se activa antes de aceptar; al rechazar después, se apaga", () => {
  datos.clear();
  let activa = 0;
  let apagada = 0;
  cuandoAcepte(() => activa++, () => apagada++);
  assert.equal(activa, 0, "sin decisión no carga nada");
  guardarDecision(false);
  assert.equal(activa, 0, "rechazar no carga nada");
  guardarDecision(true);
  assert.equal(activa, 1);
  guardarDecision(true);
  assert.equal(activa, 1, "aceptar dos veces no carga dos veces");
  guardarDecision(false);
  assert.equal(apagada, 1);
  assert.equal(leerDecision()?.medicion, false);
  assert.ok(datos.get(CLAVE_DECISION)!.includes('"medicion":false'));
  // Una página nueva con la decisión ya tomada: se activa al tiro.
  guardarDecision(true);
  let enPaginaNueva = 0;
  cuandoAcepte(() => enPaginaNueva++);
  assert.equal(enPaginaNueva, 1);
});

await prueba("el carrito avisa al agregar (solo datos del producto) y la cola sirve a quien llega tarde", () => {
  const carrito = crearCarrito({ storageKey: "c-prueba" });
  carrito.agregar({ productoId: "lana~azul", nombre: "Lana · Azul", precio: 3990, cantidad: 2 });
  const vistos: { nombre: string; detalle: unknown }[] = [];
  const dejar = escucharEventos((e) => vistos.push(e));
  assert.equal(vistos.length, 1, "el evento de antes llega desde la cola");
  assert.equal(vistos[0].nombre, EVENTO_AGREGAR);
  assert.deepEqual(vistos[0].detalle, { producto: { productoId: "lana~azul", nombre: "Lana · Azul", precio: 3990, cantidad: 2 } });
  emitirIniciarCompra([{ productoId: "lana~azul", nombre: "Lana · Azul", precio: 3990, cantidad: 2 }], 7980);
  assert.equal(vistos.length, 2, "y los nuevos llegan en vivo");
  dejar();
  carrito.agregar({ productoId: "x", nombre: "X", precio: 1 });
  assert.equal(vistos.length, 2, "dejar de escuchar funciona");
});

await prueba("compra: se avisa UNA vez por orden (aunque recargue) y se rechaza basura", () => {
  const compras: unknown[] = [];
  ventana.addEventListener(EVENTO_COMPRA, (e) => compras.push((e as CustomEvent).detail));
  assert.equal(avisarCompraConfirmada("SA-1234ABCD", 15980), true);
  assert.equal(avisarCompraConfirmada("SA-1234ABCD", 15980), false, "recargar no cuenta otra compra");
  assert.equal(avisarCompraConfirmada("<script>", 1), false);
  assert.equal(avisarCompraConfirmada("SA-OTRA0001", Number.NaN), false);
  assert.deepEqual(compras, [{ orden: "SA-1234ABCD", monto: 15980 }]);
});

await prueba("Google Analytics: ID válido y eventos traducidos sin datos del comprador", () => {
  assert.ok(idGoogleAnalyticsValido("G-746XN9Y1YV"));
  for (const malo of ["", "UA-1234-1", "G-", "g-abc123", "G-ABC 123", 'G-ABC"><script>', null]) assert.ok(!idGoogleAnalyticsValido(malo), String(malo));
  const p = { productoId: "lana~azul", nombre: "Lana · Azul", precio: 3990, cantidad: 2 };
  assert.deepEqual(eventoParaGoogle({ nombre: EVENTO_AGREGAR, detalle: { producto: p } }), [
    "add_to_cart",
    { currency: "CLP", value: 7980, items: [{ item_id: "lana~azul", item_name: "Lana · Azul", price: 3990, quantity: 2 }] },
  ]);
  const inicio = eventoParaGoogle({ nombre: "nucleo:compra-iniciada", detalle: { productos: [p], total: 9980 } });
  assert.equal(inicio?.[0], "begin_checkout");
  assert.equal(inicio?.[1].value, 9980);
  assert.deepEqual(eventoParaGoogle({ nombre: EVENTO_COMPRA, detalle: { orden: "SA-1", monto: 9980 } }), [
    "purchase",
    { transaction_id: "SA-1", currency: "CLP", value: 9980 },
  ]);
  assert.equal(eventoParaGoogle({ nombre: "otro", detalle: {} }), null);
  assert.equal(eventoParaGoogle({ nombre: EVENTO_AGREGAR, detalle: null }), null);
});

await prueba("píxel de Meta: identificador válido y eventos estándar, con eventID en la compra", () => {
  assert.ok(idPixelMetaValido("2002860303742506"));
  assert.ok(idPixelMetaValido("123456789012345"));
  for (const malo of ["", "12345", "20028603037425067", "2002860303742506 ", "abc123456789012", "<script>", null]) assert.ok(!idPixelMetaValido(malo), String(malo));
  const p = { productoId: "lana~azul", nombre: "Lana · Azul", precio: 3990, cantidad: 2 };
  assert.deepEqual(eventoParaMeta({ nombre: EVENTO_AGREGAR, detalle: { producto: p } }), [
    "AddToCart",
    { content_ids: ["lana~azul"], content_name: "Lana · Azul", content_type: "product", contents: [{ id: "lana~azul", quantity: 2 }], value: 7980, currency: "CLP" },
  ]);
  const inicio = eventoParaMeta({ nombre: "nucleo:compra-iniciada", detalle: { productos: [p, { ...p, productoId: "gato", cantidad: 1 }], total: 12000 } });
  assert.equal(inicio?.[0], "InitiateCheckout");
  assert.equal(inicio?.[1].num_items, 3);
  assert.deepEqual(inicio?.[1].content_ids, ["lana~azul", "gato"]);
  assert.deepEqual(eventoParaMeta({ nombre: EVENTO_COMPRA, detalle: { orden: "SA-1", monto: 9980 } }), [
    "Purchase",
    { value: 9980, currency: "CLP", content_type: "product" },
    "SA-1",
  ]);
  assert.equal(eventoParaMeta({ nombre: "otro", detalle: {} }), null);
  // Nada del comprador: ni correo, ni teléfono, ni nombre de persona en ningún evento.
  const todo = JSON.stringify([inicio, eventoParaMeta({ nombre: EVENTO_AGREGAR, detalle: { producto: p } })]);
  assert.ok(!/email|correo|phone|telefono|fn|ln/i.test(todo.replace(/content_name/g, "")));
});

console.log(`\n${pasaron} pruebas pasaron.`);
