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
import { calcularDespacho, crearDespachoEditable, textosDespacho, validarTarifas } from "../modulos/despacho/index";
import { correoComprador, correoTienda } from "../modulos/compra/plantilla-correo";

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

  await prueba("galería en la ficha: solo fotos propias, sin repetir, y las miniaturas no pueden meter marcado", async () => {
    const { fotosSeguras, htmlGaleria } = await import("../modulos/catalogo/borde");
    const fotos = fotosSeguras({ imagen: "/media/a-1", fotos: ["/media/b-2", "javascript:alert(1)", "/img/x.webp", "/media/a-1", '/media/c"><script>'] });
    assert.deepEqual(fotos, ["/media/a-1", "/media/b-2", "/img/x.webp"]);
    const html = htmlGaleria(fotos);
    assert.equal((html.match(/<li>/g) || []).length, 3);
    assert.match(html, /aria-label="Ver foto 2 de 3"/);
    assert.doesNotMatch(html, /script|javascript/);
    assert.throws(() => crearCatalogo([{ id: "a", nombre: "A", precio: 1, categoria: "x", tipo: "fisico", fotos: ["https://otro.cl/f.jpg"] }], [{ id: "x", nombre: "X" }]));
    assert.throws(() => crearCatalogo([{ id: "a", nombre: "A", precio: 1, categoria: "x", tipo: "fisico", fotos: new Array(20).fill("/media/a-1") }], [{ id: "x", nombre: "X" }]), "máximo 20 contando la principal");
  });

  await prueba("video del producto: solo YouTube, se guarda el código y la miniatura no mete marcado", async () => {
    const { idVideoYoutube, urlInsercionVideo } = await import("../modulos/catalogo/video");
    const { htmlGaleria } = await import("../modulos/catalogo/borde");
    const id = "dQw4w9WgXcQ";
    for (const e of [
      `https://youtu.be/${id}`, `https://youtu.be/${id}?si=abc`, `youtu.be/${id}`,
      `https://www.youtube.com/watch?v=${id}&t=3s`, `https://m.youtube.com/watch?v=${id}`,
      `https://youtube.com/shorts/${id}?feature=share`, `https://www.youtube.com/embed/${id}`, id,
    ]) assert.equal(idVideoYoutube(e), id, e);
    for (const e of [
      "", "hola", "https://vimeo.com/123456", `https://evil.com/watch?v=${id}`, `https://youtube.com.evil.cl/watch?v=${id}`,
      `javascript:alert(1)//youtu.be/${id}`, `https://youtu.be/${id}"><script>`, `https://www.youtube.com/watch?v=abc`, 42, null,
    ]) assert.equal(idVideoYoutube(e), null, String(e));
    assert.equal(urlInsercionVideo(id), `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0&playsinline=1`);
    assert.throws(() => urlInsercionVideo('x"><script>'));
    const html = htmlGaleria(["/media/a-1"], id);
    assert.equal((html.match(/<li>/g) || []).length, 2);
    assert.match(html, /aria-label="Ver foto 1 de 2"/);
    assert.match(html, new RegExp(`data-galeria-video="${id}"`));
    assert.match(html, new RegExp(`src="https://i.ytimg.com/vi/${id}/mqdefault.jpg"`));
    assert.doesNotMatch(htmlGaleria(["/media/a-1"], '"><script>alert(1)</script>'), /script|galeria-video/);
    assert.ok(crearCatalogo([{ id: "a", nombre: "A", precio: 1, categoria: "x", tipo: "fisico", video: id }], [{ id: "x", nombre: "X" }]));
    assert.throws(() => crearCatalogo([{ id: "a", nombre: "A", precio: 1, categoria: "x", tipo: "fisico", video: "https://youtu.be/" + id }], [{ id: "x", nombre: "X" }]));
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

  console.log("Despacho por zona:");

  const despacho = crearDespachoEditable({
    inicial: { pagarAhora: true, pagarAlRecibir: true, centro: 3500, alejada: 5000, cercana: 5500, extrema: 7000, gratisDesde: 40000 },
    detallePorPagar: "Se paga al recibir.",
  });
  const configDespacho = { ...config, despacho };
  const tiendaDespacho = crearEndpointsCompra(configDespacho);
  const iniciarConDespacho = (env: EnvPago, cuerpo: unknown) =>
    tiendaDespacho.pago.iniciar.onRequestPost({
      env,
      request: new Request("https://tienda.cl/api/pago/iniciar", {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: "https://tienda.cl" },
        body: JSON.stringify(cuerpo),
      }),
    });
  const cobrado = () => (ultimaPreferencia!.items as { unit_price: number }[])[0].unit_price;
  const pedidoGuardado = (datos: Map<string, string>) => {
    const k = [...datos.keys()].find((x) => x.startsWith("pago:pedido:"))!;
    return JSON.parse(datos.get(k)!) as { monto: number; metadata: Record<string, any> };
  };
  const RM = "Metropolitana de Santiago";
  const destino = (region: string, comuna: string) => ({ ...comprador, region, comuna });
  const gatito = [{ productoId: "gatito", cantidad: 1 }];

  await prueba("el despacho sale de la comuna (RM) o la región, según las casillas", async () => {
    for (const [region, comuna, esperado, zona] of [
      [RM, "Providencia", 18000 + 3500, "centro"],
      [RM, "Buin", 18000 + 5000, "alejada"],
      [RM, "Lampa", 18000 + 5000, "alejada"],
      ["Valparaíso", "Viña del Mar", 18000 + 5500, "cercana"],
      ["Magallanes y de la Antártica Chilena", "Punta Arenas", 18000 + 7000, "extrema"],
    ] as const) {
      const { env, datos } = entorno();
      const r = await iniciarConDespacho(env, { items: gatito, comprador: destino(region, comuna), formaDespacho: "ahora" });
      assert.equal(r.status, 200, comuna);
      assert.equal(cobrado(), esperado, comuna);
      const p = pedidoGuardado(datos);
      assert.equal(p.metadata.despacho.zona, zona);
      assert.equal(p.metadata.despacho.forma, "ahora");
    }
  });

  await prueba("el comprador elige pagarlo al recibir: no se suma", async () => {
    const { env, datos } = entorno();
    await iniciarConDespacho(env, { items: gatito, comprador: destino(RM, "Buin"), formaDespacho: "al-recibir" });
    assert.equal(cobrado(), 18000);
    assert.equal(pedidoGuardado(datos).metadata.despacho.forma, "al-recibir");
  });

  await prueba("el navegador no puede inventar zona, monto ni forma no permitida", async () => {
    const { env } = entorno();
    const r = await iniciarConDespacho(env, {
      items: gatito, comprador: destino("Magallanes y de la Antártica Chilena", "Punta Arenas"),
      formaDespacho: "ahora", despacho: 0, monto: 18000, zona: "centro", gratisDesde: 1,
    });
    assert.equal(r.status, 200);
    assert.equal(cobrado(), 25000);
    const comunaFalsa = await iniciarConDespacho(env, { items: gatito, comprador: destino(RM, "Santiago Centro") });
    assert.equal(comunaFalsa.status, 400, "en la RM la comuna tiene que ser de la lista");
    const regionFalsa = await iniciarConDespacho(env, { items: gatito, comprador: destino("Santiago", "Providencia") });
    assert.equal(regionFalsa.status, 400);
    const { env: env2 } = entorno();
    await despacho.guardar(env2, { ...despacho.inicial, pagarAlRecibir: false });
    await iniciarConDespacho(env2, { items: gatito, comprador: destino(RM, "Providencia"), formaDespacho: "al-recibir" });
    assert.equal(cobrado(), 18000, "pagar al recibir siempre queda disponible para el comprador");
  });

  await prueba("si el total que vio la persona no calza, no se cobra y se avisa", async () => {
    const { env } = entorno();
    const cuerpo = { items: gatito, comprador: destino("Valparaíso", "Viña del Mar"), formaDespacho: "ahora" };
    const r = await iniciarConDespacho(env, { ...cuerpo, totalVisto: 18000 });
    assert.equal(r.status, 400);
    assert.match(((await r.json()) as { message: string }).message, /El total cambió a \$23\.500/);
    assert.equal((await iniciarConDespacho(env, { ...cuerpo, totalVisto: 23500 })).status, 200);
  });

  await prueba("gratis desde el monto y nunca cobra despacho a un curso", async () => {
    const { env } = entorno();
    await iniciarConDespacho(env, { items: [{ productoId: "gatito", cantidad: 2 }, { productoId: "curso", cantidad: 1 }], comprador: destino("Valparaíso", "Viña"), formaDespacho: "ahora" });
    assert.equal(cobrado(), 36000 + 15000);
    const { env: env2, datos } = entorno();
    const sinDireccion = { nombre: "Ana", email: "ana@correo.cl", telefono: "+56 9 1234 5678", aceptaPolitica: true };
    assert.equal((await iniciarConDespacho(env2, { items: [{ productoId: "curso", cantidad: 1 }], comprador: sinDireccion })).status, 200);
    assert.equal(cobrado(), 15000);
    assert.equal(pedidoGuardado(datos).metadata.despacho, undefined);
  });

  await prueba("mover una comuna de zona en el panel cambia el cobro siguiente", async () => {
    const { env } = entorno();
    const t = await despacho.obtener(env);
    await despacho.guardar(env, { ...t, comunasCentro: [...t.comunasCentro, "Buin"] });
    await iniciarConDespacho(env, { items: gatito, comprador: destino(RM, "Buin"), formaDespacho: "ahora" });
    assert.equal(cobrado(), 21500);
  });

  await prueba("tarifas inválidas no se guardan", async () => {
    const { env } = entorno();
    const base = despacho.inicial;
    for (const malo of [
      { ...base, centro: -1 }, { ...base, centro: 3500.5 }, { ...base, centro: "3500" }, { ...base, gratisDesde: 5 },
      { ...base, pagarAhora: "si" }, { ...base, comunasCentro: ["Providencia", "Mendoza"] },
      { ...base, regionesCercanas: ["Metropolitana de Santiago"] }, { ...base, extrema: 999999999 },
    ]) {
      assert.equal((await despacho.guardar(env, malo)).ok, false, JSON.stringify(malo).slice(0, 80));
    }
  });

  await prueba("lo guardado con la versión anterior (rm/regiones/extremas) sigue sirviendo", () => {
    const r = validarTarifas({ modo: "tarifa", rm: 3500, regiones: 5000, extremas: 7000, gratisDesde: 30000 });
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.datos.pagarAhora, true);
      assert.equal(r.datos.centro, 3500);
      assert.equal(r.datos.extrema, 7000);
      assert.ok(r.datos.comunasCentro.includes("Providencia"));
    }
    const pp = validarTarifas({ modo: "por-pagar", rm: 0, regiones: 0, extremas: 0, gratisDesde: null });
    assert.ok(pp.ok && pp.datos.pagarAlRecibir && !pp.datos.pagarAhora);
  });

  await prueba("los avisos nunca dicen gratis si hay cobro, y la ficha muestra los valores", () => {
    const base = { ...despacho.inicial, gratisDesde: null };
    const t = (x: object) => textosDespacho({ ...base, ...x }, "Por pagar.");
    assert.equal(t({}).corto, "Envíos a todo Chile");
    assert.match(t({}).ficha, /Santiago zona centro \$3\.500 · Santiago zona alejada \$5\.000 · Regiones zona cercana \$5\.500 · Regiones zona extrema \$7\.000/);
    assert.match(t({}).ficha, /También puedes pagarlo al recibir/);
    assert.doesNotMatch(t({}).ficha + t({}).corto + t({}).detalle, /gratis/i);
    assert.equal(t({ gratisDesde: 30000 }).corto, "Despacho gratis desde $30.000");
    assert.equal(t({ centro: 0, alejada: 0, cercana: 0, extrema: 0 }).corto, "Despacho gratis a todo Chile");
    assert.equal(t({ pagarAhora: false }).ficha, "Envío por pagar a todo Chile");
    assert.equal(calcularDespacho({ ...base, centro: 0 }, { region: RM, comuna: "Providencia" }, 5000, "al-recibir").forma, "ahora", "si es gratis no hay nada que pagar al recibir");
  });

  await prueba("correos: despacho cobrado o por pagar, con la zona", () => {
    const base = { orden: "o1", monto: 23500, lineas: [{ productoId: "gatito", nombre: "Gatito", cantidad: 1, precioUnitario: 18000, subtotal: 18000 }], comprador: { ...comprador, notas: "", aceptaPolitica: true as const }, requiereDespacho: true, tieneDigitales: false };
    const c = correoComprador(configDespacho, { ...base, despacho: { forma: "ahora", costo: 5500, zona: "cercana", gratisPorMonto: false } });
    assert.match(c.html, /Despacho<\/td><td[^>]*>\$5\.500 \(Regiones zona cercana\)/);
    assert.match(correoTienda(configDespacho, { ...base, despacho: { forma: "al-recibir", costo: 0, zona: "alejada", gratisPorMonto: false } }).html, /Por pagar al recibir \(Santiago zona alejada\)/);
    assert.match(correoComprador(config, base).html, /Envío por pagar<\/strong>: Se paga al recibir/);
  });

  console.log(`\n${pasaron} pruebas pasaron.`);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
