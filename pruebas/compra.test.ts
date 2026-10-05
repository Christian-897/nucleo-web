/**
 * Prueba de catálogo + compra: intenta romperlo. Fetch interceptado
 * (Mercado Pago y Resend falsos) y KV en memoria. Se corre con `npm test`.
 */
import assert from "node:assert/strict";
import type { AlmacenKV } from "../core/tipos";
import { crearCatalogo, ErrorCatalogo, productoDisponible } from "../modulos/catalogo/index";
import { crearConfigPagoCompra, crearEndpointsCompra, validarComprador } from "../modulos/compra/index";
import { necesitaDespacho } from "../modulos/compra/cliente";
import { aplicarResultado } from "../modulos/pago/servidor";
import { productosDeLista, imagenSegura, idDeRuta, crearCatalogoEditable, crearSitemap } from "../modulos/catalogo/index";
import type { EnvPago } from "../modulos/pago/config";

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

const correos: { para: string; asunto: string; html: string }[] = [];
let ultimaPreferencia: Record<string, unknown> | null = null;
globalThis.fetch = (async (entrada: string | URL | Request, init?: RequestInit) => {
  const url = String(entrada instanceof Request ? entrada.url : entrada);
  if (url.includes("api.resend.com")) {
    const b = JSON.parse(String(init?.body));
    correos.push({ para: b.to[0], asunto: b.subject, html: b.html });
    return new Response("{}");
  }
  if (url.endsWith("/checkout/preferences")) {
    ultimaPreferencia = JSON.parse(String(init?.body));
    return new Response(JSON.stringify({ id: "pref1", init_point: "https://www.mercadopago.cl/checkout/v1/redirect?pref_id=pref1" }), { status: 201 });
  }
  throw new Error("fetch inesperado: " + url);
}) as typeof fetch;

const catalogo = crearCatalogo(
  [
    { id: "gatito", nombre: "Gatito", precio: 18000, stock: 2, categoria: "peluches", tipo: "fisico" },
    { id: "curso", nombre: "Curso <b>crochet</b>", precio: 15000, categoria: "cursos", tipo: "digital" },
  ],
  [{ id: "peluches", nombre: "Peluches" }, { id: "cursos", nombre: "Cursos" }]
);

const config = {
  nombreSitio: "Tienda Prueba",
  catalogo,
  proveedores: ["mercadopago" as const],
  envio: { modalidad: "Envío por pagar", detalle: "Se paga al recibir." },
};

function entorno() {
  const { kv, datos } = kvMemoria();
  const env: EnvPago = { REVIEWS_KV: kv, MP_ACCESS_TOKEN: "TEST-1", RESEND_API_KEY: "re_x", ADMIN_NOTIFY_EMAIL: "duena@tienda.cl" };
  return { env, datos };
}

const comprador = {
  nombre: "Ana Pérez", email: "ana@correo.cl", telefono: "+56 9 1234 5678",
  region: "Valparaíso", comuna: "Viña del Mar", direccion: "Av. Libertad 123", aceptaPolitica: true,
};

const iniciar = (env: EnvPago, cuerpo: unknown) =>
  crearEndpointsCompra(config).pago.iniciar.onRequestPost({
    env,
    request: new Request("https://tienda.cl/api/pago/iniciar", {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: "https://tienda.cl" },
      body: JSON.stringify(cuerpo),
    }),
  });

async function run() {
  console.log("Catálogo:");

  await prueba("rechaza un catálogo con precio mal escrito", () => {
    assert.throws(
      () => crearCatalogo([{ id: "x", nombre: "X", precio: 18.0005, categoria: "a", tipo: "fisico" }], []),
      ErrorCatalogo
    );
    assert.throws(
      () => crearCatalogo([{ id: "Con Espacio", nombre: "X", precio: 1, categoria: "a", tipo: "fisico" }], []),
      ErrorCatalogo
    );
  });

  await prueba("rechaza un producto con categoría inexistente o repetido", () => {
    assert.throws(() => crearCatalogo([{ id: "a", nombre: "A", precio: 1, categoria: "nada", tipo: "fisico" }], [{ id: "b", nombre: "B" }]));
    assert.throws(() => crearCatalogo([
      { id: "a", nombre: "A", precio: 1, categoria: "b", tipo: "fisico" },
      { id: "a", nombre: "A", precio: 1, categoria: "b", tipo: "fisico" },
    ], [{ id: "b", nombre: "B" }]));
  });

  console.log("Compra:");

  await prueba("el monto cobrado es el del catálogo aunque el navegador mande otro precio", async () => {
    const { env } = entorno();
    const r = await iniciar(env, { items: [{ productoId: "gatito", cantidad: 1, precio: 1 }], comprador, monto: 1 });
    assert.equal(r.status, 200);
    const item = (ultimaPreferencia!.items as { unit_price: number }[])[0];
    assert.equal(item.unit_price, 18000);
  });

  await prueba("no deja comprar más del stock disponible", async () => {
    const { env } = entorno();
    const r = await iniciar(env, { items: [{ productoId: "gatito", cantidad: 5 }], comprador });
    assert.equal(r.status, 400);
    assert.match(((await r.json()) as { message: string }).message, /carrito cambió/);
  });

  await prueba("exige dirección si hay productos físicos, pero no para un curso", async () => {
    const { env } = entorno();
    const sinDireccion = { ...comprador, region: undefined, comuna: undefined, direccion: undefined };
    const fisico = await iniciar(env, { items: [{ productoId: "gatito", cantidad: 1 }], comprador: sinDireccion });
    assert.equal(fisico.status, 400);
    const digital = await iniciar(env, { items: [{ productoId: "curso", cantidad: 1 }], comprador: sinDireccion });
    assert.equal(digital.status, 200);
  });

  await prueba("rechaza región inventada, teléfono no chileno y sin aceptar la política", () => {
    assert.equal(validarComprador({ ...comprador, region: "Mendoza" }, true).ok, false);
    assert.equal(validarComprador({ ...comprador, telefono: "123" }, true).ok, false);
    assert.equal(validarComprador({ ...comprador, aceptaPolitica: false }, true).ok, false);
  });

  await prueba("rechaza carritos gigantes (tope de líneas)", async () => {
    const { env } = entorno();
    const items = Array.from({ length: 40 }, (_, i) => ({ productoId: `p${i}`, cantidad: 1 }));
    const r = await iniciar(env, { items, comprador });
    assert.equal(r.status, 400);
  });

  await prueba("al confirmar: descuenta stock UNA vez, suma a métricas y avisa a la tienda y al comprador", async () => {
    const { env, datos } = entorno();
    const r = await iniciar(env, { items: [{ productoId: "gatito", cantidad: 1 }, { productoId: "curso", cantidad: 1 }], comprador });
    const { orden } = (await r.json()) as { orden: string };
    const antes = correos.length;
    const cfg = crearConfigPagoCompra(config);
    const resultado = { proveedor: "mercadopago" as const, estado: "pagada" as const, orden, monto: 33000, moneda: "CLP", idProveedor: "1", crudo: {} };
    assert.equal(await aplicarResultado(resultado, env, cfg), "confirmado");
    assert.equal(await aplicarResultado(resultado, env, cfg), "ya-confirmado");
    assert.equal((await productoDisponible(catalogo, env, "gatito"))!.stock, 1);
    // Queda en las métricas una sola vez (aunque el aviso llegó dos veces).
    const dias = [...datos.keys()].filter((k) => k.startsWith("metricas:dia:"));
    assert.equal(dias.length, 1);
    const dia = JSON.parse(datos.get(dias[0])!);
    assert.equal(dia.n, 1);
    assert.equal(dia.v, 33000);
    const nuevos = correos.slice(antes);
    assert.equal(nuevos.length, 2);
    assert.deepEqual(nuevos.map((c) => c.para).sort(), ["ana@correo.cl", "duena@tienda.cl"]);
    // El nombre del producto viaja escapado en el correo.
    assert.ok(nuevos.every((c) => !c.html.includes("<b>crochet</b>")));
  });

  await prueba("un pago por menos plata no descuenta stock ni manda correos", async () => {
    const { env } = entorno();
    const r = await iniciar(env, { items: [{ productoId: "gatito", cantidad: 1 }], comprador });
    const { orden } = (await r.json()) as { orden: string };
    const antes = correos.length;
    const cfg = crearConfigPagoCompra(config);
    const res = await aplicarResultado(
      { proveedor: "mercadopago", estado: "pagada", orden, monto: 100, moneda: "CLP", idProveedor: "1", crudo: {} },
      env, cfg
    );
    assert.equal(res, "monto-no-coincide");
    assert.equal((await productoDisponible(catalogo, env, "gatito"))!.stock, 2);
    assert.equal(correos.length, antes);
  });

  await prueba("el cliente pide dirección si no conoce el tipo de un producto", () => {
    assert.equal(necesitaDespacho([{ productoId: "curso" }], { curso: "digital" }), false);
    assert.equal(necesitaDespacho([{ productoId: "raro" }], { curso: "digital" }), true);
  });

  console.log("Catálogo en el borde:");

  await prueba("filtros de listas: todos, destacados, categoría y relacionados sin el propio", () => {
    const c = crearCatalogo(
      [
        { id: "a", nombre: "A", precio: 1, categoria: "x", tipo: "fisico", destacado: true },
        { id: "b", nombre: "B", precio: 1, categoria: "x", tipo: "fisico" },
        { id: "c", nombre: "C", precio: 1, categoria: "y", tipo: "digital" },
      ],
      [{ id: "x", nombre: "X" }, { id: "y", nombre: "Y" }]
    );
    assert.equal(productosDeLista(c, "todos").length, 3);
    assert.deepEqual(productosDeLista(c, "destacados").map((p) => p.id), ["a"]);
    const c2 = crearCatalogo(
      [
        { id: "viejo", nombre: "V", precio: 1, categoria: "x", tipo: "fisico", destacado: true },
        { id: "nuevo", nombre: "N", precio: 1, categoria: "x", tipo: "fisico", destacado: true },
      ],
      [{ id: "x", nombre: "X" }]
    );
    assert.deepEqual(productosDeLista(c2, "destacados").map((p) => p.id), ["nuevo", "viejo"], "lo recién agregado primero");
    assert.deepEqual(productosDeLista(c, "categoria:y").map((p) => p.id), ["c"]);
    assert.deepEqual(productosDeLista(c, "relacionados:x:a").map((p) => p.id), ["b"]);
    assert.deepEqual(productosDeLista(c, "inventado"), []);
  });

  await prueba("imágenes: solo /media/ o /img/ propias; nada de javascript:, otros dominios ni '..'", () => {
    const d = "/img/defecto.png";
    assert.equal(imagenSegura("/media/producto-a-0123456789ab", d), "/media/producto-a-0123456789ab");
    assert.equal(imagenSegura("javascript:alert(1)", d), d);
    assert.equal(imagenSegura("https://malo.com/x.png", d), d);
    assert.equal(imagenSegura("//malo.com/x.png", d), d);
    assert.equal(imagenSegura("/img/../admin", d), d);
    assert.equal(imagenSegura('/img/a.png" onerror="x', d), d);
  });

  await prueba("ficha: solo direcciones de producto válidas", () => {
    assert.equal(idDeRuta("/producto/gatito/"), "gatito");
    assert.equal(idDeRuta("/producto/gatito"), "gatito");
    assert.equal(idDeRuta("/producto/../admin/"), null);
    assert.equal(idDeRuta("/producto/Gatito<script>/"), null);
  });

  await prueba("sitemap con el catálogo editado (y escapado)", async () => {
    const { env } = entorno();
    const fuente = crearCatalogoEditable([{ id: "a", nombre: "A", precio: 1, categoria: "x", tipo: "fisico" }], [{ id: "x", nombre: "X" }]);
    await fuente.guardar(env, [
      { id: "a", nombre: "A", precio: 1, categoria: "x", tipo: "fisico" },
      { id: "nuevo", nombre: "N", precio: 1, categoria: "x", tipo: "fisico" },
    ]);
    const xml = await (await crearSitemap(fuente, { dominio: "https://t.cl", rutasFijas: ["/"] }).onRequestGet({ env })).text();
    assert.match(xml, /https:\/\/t\.cl\/producto\/nuevo\//);
    assert.match(xml, /https:\/\/t\.cl\/tienda\/x\//);
  });

  console.log(`\n${pasaron} pruebas pasaron.`);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
