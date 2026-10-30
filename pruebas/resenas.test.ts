/**
 * Prueba de las reseñas (v0.45): solo compradores, nada se publica sin
 * aprobación, todo texto escapado. Se corre con `npm test`.
 */
import assert from "node:assert/strict";
import type { AlmacenBinario } from "../core/tipos";
import { crearCatalogoEditable } from "../modulos/catalogo/index";
import { crearPanel } from "../modulos/panel/index";
import type { EnvPanel } from "../modulos/panel/config";
import {
  crearResenas,
  htmlEstrellas,
  htmlListaResenas,
  jsonLdResenas,
  leerPublicas,
  nombreCorto,
  textoResumen,
} from "../modulos/resenas/index";

let pasaron = 0;
async function prueba(nombre: string, fn: () => Promise<void> | void) {
  await fn();
  pasaron++;
  console.log("  ok —", nombre);
}

function kvMemoria() {
  const datos = new Map<string, string>();
  const kv: AlmacenBinario = {
    get: async (k) => datos.get(k) ?? null,
    put: async (k, v) => void datos.set(k, typeof v === "string" ? v : "[binario]"),
    delete: async (k) => void datos.delete(k),
    list: async (o) => ({ keys: [...datos.keys()].filter((k) => k.startsWith(o?.prefix ?? "")).map((name) => ({ name })) }),
    getWithMetadata: async () => ({ value: null, metadata: null }),
  };
  return { kv, datos };
}

const catalogo = crearCatalogoEditable(
  [
    {
      id: "funda",
      nombre: "Funda de satín",
      precio: 10990,
      categoria: "fundas",
      tipo: "fisico",
      imagen: "/img/funda.webp",
      colores: [
        { id: "rosa", nombre: "Rosa", foto: "/img/funda-rosa.webp" },
        { id: "negro", nombre: "Negro", foto: "/img/funda-negro.webp" },
      ],
    },
    { id: "gorro", nombre: "Gorro", precio: 12990, categoria: "fundas", tipo: "fisico" },
    { id: "antifaz", nombre: "Antifaz", precio: 6990, categoria: "fundas", tipo: "fisico" },
  ],
  [{ id: "fundas", nombre: "Fundas" }]
);

const resenas = crearResenas({ nombreSitio: "Isatin", urlPublica: "https://tienda.cl/", catalogo });
const panel = crearPanel({ nombreSitio: "Isatin", catalogo, resenas });
const PEPPER = "pepper-de-prueba-0123456789abcdef";
const TOKEN_INSTALACION = "instalar-0123456789";

function entorno() {
  const { kv, datos } = kvMemoria();
  const env: EnvPanel = { REVIEWS_KV: kv, ADMIN_PEPPER: PEPPER, ADMIN_SETUP_TOKEN: TOKEN_INSTALACION };
  return { env, datos };
}

let ip = 0;
function req(ruta: string, o: { cuerpo?: unknown; cookie?: string; origen?: string } = {}) {
  const h: Record<string, string> = { Origin: o.origen ?? "https://tienda.cl", "CF-Connecting-IP": `10.1.0.${++ip % 250}` };
  if (o.cookie) h.Cookie = o.cookie;
  if (o.cuerpo !== undefined) h["Content-Type"] = "application/json";
  return new Request("https://tienda.cl" + ruta, { method: o.cuerpo !== undefined ? "POST" : "GET", headers: h, body: o.cuerpo !== undefined ? JSON.stringify(o.cuerpo) : undefined });
}
const json = async (r: Response) => (await r.json()) as Record<string, any>;

async function entrar(env: EnvPanel): Promise<string> {
  await panel.instalar.onRequestPost({ env, request: req("/api/admin/instalar", { cuerpo: { usuario: "sasha", derivado: "a".repeat(64), claveInstalacion: TOKEN_INSTALACION } }) });
  const r = await panel.entrar.onRequestPost({ env, request: req("/api/admin/entrar", { cuerpo: { usuario: "sasha", derivado: "a".repeat(64) } }) });
  const c = (r.headers.get("Set-Cookie") ?? "").match(/mc_sesion=[^;]+/);
  return c ? c[0] : "";
}

async function pedido(env: EnvPanel, orden: string, estado = "pagada") {
  await env.REVIEWS_KV!.put(
    `pago:pedido:${orden}`,
    JSON.stringify({
      orden,
      descripcion: "Compra",
      monto: 22000,
      moneda: "CLP",
      email: "ana@correo.cl",
      proveedor: "flow",
      estado,
      creado: new Date().toISOString(),
      actualizado: "",
      metadata: {
        comprador: { nombre: "Ana María Pérez Soto" },
        lineas: [
          { productoId: "funda~rosa", nombre: "Funda de satín · Rosa", precioUnitario: 10990, cantidad: 1, subtotal: 10990 },
          { productoId: "funda~negro", nombre: "Funda de satín · Negro", precioUnitario: 10990, cantidad: 1, subtotal: 10990 },
          { productoId: "gorro", nombre: "Gorro", precioUnitario: 12990, cantidad: 1, subtotal: 12990 },
        ],
      },
    })
  );
}

async function tokenDe(env: EnvPanel, orden: string) {
  return (await env.REVIEWS_KV!.get(`resena:token:${orden}`)) ?? "";
}

async function run() {
  console.log("Reseñas:");

  await prueba("nombre público corto: nombre e inicial del apellido", () => {
    assert.equal(nombreCorto("Ana María Pérez Soto"), "Ana P.");
    assert.equal(nombreCorto("Ana Pérez Soto"), "Ana P.");
    assert.equal(nombreCorto("ana pérez"), "ana P.");
    assert.equal(nombreCorto("  ana  "), "ana");
    assert.equal(nombreCorto(""), "");
    assert.equal(nombreCorto(undefined), "");
  });

  await prueba("invitar: solo pedidos pagados; una vez (salvo que se vuelva a pedir); el código queda guardado", async () => {
    const { env } = entorno();
    assert.equal((await resenas.invitar(env, "NOEXISTE")).ok, false);
    await pedido(env, "ORD1", "pendiente");
    assert.equal((await resenas.invitar(env, "ORD1")).ok, false, "no pagado: no");
    await pedido(env, "ORD1");
    const r = await resenas.invitar(env, "ORD1");
    assert.ok(r.ok && r.simulado, "sin clave de Resend, el correo queda simulado");
    const token = await tokenDe(env, "ORD1");
    assert.match(token, /^[a-f0-9]{32}$/);
    assert.equal((await resenas.invitar(env, "ORD1")).motivo, "ya-invitado");
    assert.ok((await resenas.invitar(env, "ORD1", true)).ok, "volver a pedir");
    assert.equal(await tokenDe(env, "ORD1"), token, "el mismo enlace sigue sirviendo");
  });

  await prueba("formulario: el enlace se valida; agrupa los colores de un mismo producto", async () => {
    const { env } = entorno();
    await pedido(env, "ORD2");
    await resenas.invitar(env, "ORD2");
    const t = await tokenDe(env, "ORD2");
    assert.equal((await resenas.formulario.onRequestGet({ env, request: req(`/api/resenas?o=ORD2&t=${"0".repeat(32)}`) })).status, 403, "código falso");
    assert.equal((await resenas.formulario.onRequestGet({ env, request: req(`/api/resenas?o=ORD2&t=malo`) })).status, 400);
    assert.equal((await resenas.formulario.onRequestGet({ env, request: req(`/api/resenas?o=OTRO&t=${t}`) })).status, 403, "el código es de su pedido");
    const d = await json(await resenas.formulario.onRequestGet({ env, request: req(`/api/resenas?o=ORD2&t=${t}`) }));
    assert.equal(d.nombreSugerido, "Ana P.");
    assert.deepEqual(
      d.productos.map((p: any) => [p.id, p.variante ?? "", p.hecha]),
      [
        ["funda", "Rosa, Negro", false],
        ["gorro", "", false],
      ]
    );
  });

  await prueba("enviar: valida estrellas y texto, ignora productos que no compró, no repite y avisa a la tienda", async () => {
    const { env } = entorno();
    await pedido(env, "ORD3");
    await resenas.invitar(env, "ORD3");
    const t = await tokenDe(env, "ORD3");
    const post = (cuerpo: unknown, origen?: string) => resenas.formulario.onRequestPost({ env, request: req("/api/resenas", { cuerpo, origen }) });
    assert.equal((await post({ o: "ORD3", t, nombre: "Ana S.", resenas: [{ producto: "funda", estrellas: 5, texto: "Muy buena" }] }, "https://malo.com")).status, 403);
    assert.equal((await post({ o: "ORD3", t: "f".repeat(32), nombre: "Ana S.", resenas: [] })).status, 403);
    const malas = await json(await post({ o: "ORD3", t, nombre: "Ana S.", resenas: [{ producto: "funda", estrellas: 0, texto: "Muy buena" }, { producto: "gorro", estrellas: 4, texto: "x" }] }));
    assert.ok(malas.errores.funda && malas.errores.gorro);
    assert.equal((await post({ o: "ORD3", t, nombre: "A", resenas: [{ producto: "funda", estrellas: 5, texto: "Muy buena" }] })).status, 400, "nombre muy corto");
    assert.equal((await post({ o: "ORD3", t, nombre: "Ana S.", resenas: [{ producto: "antifaz", estrellas: 5, texto: "No lo compré" }] })).status, 400, "lo que no compró no cuenta");
    const ok = await json(await post({ o: "ORD3", t, nombre: "  Ana   S. ", resenas: [{ producto: "funda", estrellas: 5, texto: "Me encantó.\n\n\n\nSuavecita <b>de verdad</b>" }] }));
    assert.equal(ok.guardadas, 1);
    const guardada = JSON.parse((await env.REVIEWS_KV!.get("resena:r:funda:ORD3"))!);
    assert.equal(guardada.estado, "pendiente");
    assert.equal(guardada.nombre, "Ana S.");
    assert.equal(guardada.variante, "Rosa, Negro");
    assert.equal(guardada.texto, "Me encantó.\n\nSuavecita <b>de verdad</b>", "se guarda como texto (se escapa al mostrar)");
    assert.equal(await leerPublicas(env.REVIEWS_KV, "funda"), null, "pendiente: no se publica");
    const otra = await json(await post({ o: "ORD3", t, nombre: "Ana S.", resenas: [{ producto: "funda", estrellas: 1, texto: "Cambio de opinión" }] }));
    assert.match(otra.errores.funda, /Ya opinaste/);
    const d = await json(await resenas.formulario.onRequestGet({ env, request: req(`/api/resenas?o=ORD3&t=${t}`) }));
    assert.deepEqual(d.productos.map((p: any) => p.hecha), [true, false]);
  });

  await prueba("panel: lista con pendientes primero; aprobar publica, rechazar despublica, responder y eliminar", async () => {
    const { env } = entorno();
    const cookie = await entrar(env);
    await pedido(env, "ORD4");
    await resenas.invitar(env, "ORD4");
    const t = await tokenDe(env, "ORD4");
    await resenas.formulario.onRequestPost({ env, request: req("/api/resenas", { cuerpo: { o: "ORD4", t, nombre: "Ana S.", resenas: [{ producto: "funda", estrellas: 5, texto: "Excelente" }, { producto: "gorro", estrellas: 2, texto: "Me quedó chico" }] } }) });
    assert.equal((await panel.resenas.onRequestGet({ env, request: req("/api/admin/resenas") })).status, 401, "sin sesión no");
    const lista = await json(await panel.resenas.onRequestGet({ env, request: req("/api/admin/resenas", { cookie }) }));
    assert.equal(lista.pendientes, 2);
    assert.equal(lista.resenas[0].productoNombre.length > 0, true);
    const accion = (cuerpo: unknown) => panel.resenas.onRequestPost({ env, request: req("/api/admin/resenas", { cookie, cuerpo }) });
    assert.equal((await accion({ accion: "aprobar", clave: "funda:../x" })).status, 400);
    assert.equal((await accion({ accion: "aprobar", clave: "funda:NOEXISTE" })).status, 404);
    assert.equal((await json(await accion({ accion: "aprobar", clave: "funda:ORD4" }))).publicadas, 1);
    let pub = await leerPublicas(env.REVIEWS_KV, "funda");
    assert.equal(pub?.total, 1);
    assert.equal(pub?.promedio, 5);
    assert.equal((pub?.resenas[0] as any).orden, undefined, "el número de pedido no se publica");
    await accion({ accion: "responder", clave: "funda:ORD4", texto: "¡Gracias, Ana!" });
    pub = await leerPublicas(env.REVIEWS_KV, "funda");
    assert.equal(pub?.resenas[0].respuesta?.texto, "¡Gracias, Ana!");
    await accion({ accion: "responder", clave: "funda:ORD4", texto: "" });
    assert.equal((await leerPublicas(env.REVIEWS_KV, "funda"))?.resenas[0].respuesta, undefined, "vacía quita la respuesta");
    await accion({ accion: "rechazar", clave: "funda:ORD4" });
    assert.equal(await leerPublicas(env.REVIEWS_KV, "funda"), null, "despublicada");
    await accion({ accion: "aprobar", clave: "gorro:ORD4" });
    assert.equal((await leerPublicas(env.REVIEWS_KV, "gorro"))?.promedio, 2);
    await accion({ accion: "eliminar", clave: "gorro:ORD4" });
    assert.equal(await leerPublicas(env.REVIEWS_KV, "gorro"), null);
    assert.equal(await env.REVIEWS_KV!.get("resena:r:gorro:ORD4"), null);
    const fin = await json(await panel.resenas.onRequestGet({ env, request: req("/api/admin/resenas", { cookie }) }));
    assert.equal(fin.total, 1);
    assert.equal(fin.pendientes, 0);
  });

  await prueba("pedidos: marcar enviado pide la reseña una vez; «Pedir reseña» la vuelve a pedir", async () => {
    const { env } = entorno();
    const cookie = await entrar(env);
    await pedido(env, "ORD5");
    const marcar = await json(await panel.pedidos.onRequestPost({ env, request: req("/api/admin/pedidos", { cookie, cuerpo: { accion: "marcar-enviado", orden: "ORD5" } }) }));
    assert.ok(marcar.resenaPedida, "se pidió al marcar");
    const primera = await env.REVIEWS_KV!.get("resena:invitado:ORD5");
    await panel.pedidos.onRequestPost({ env, request: req("/api/admin/pedidos", { cookie, cuerpo: { accion: "marcar-enviado", orden: "ORD5", enviado: false } }) });
    await panel.pedidos.onRequestPost({ env, request: req("/api/admin/pedidos", { cookie, cuerpo: { accion: "marcar-enviado", orden: "ORD5" } }) });
    assert.equal(await env.REVIEWS_KV!.get("resena:invitado:ORD5"), primera, "no se repite al desmarcar y marcar");
    const lista = await json(await panel.pedidos.onRequestGet({ env, request: req("/api/admin/pedidos", { cookie }) }));
    assert.equal(lista.pedidos[0].resenaPedida, primera);
    const otra = await panel.pedidos.onRequestPost({ env, request: req("/api/admin/pedidos", { cookie, cuerpo: { accion: "pedir-resena", orden: "ORD5" } }) });
    assert.equal(otra.status, 200);
    const sinResenas = crearPanel({ nombreSitio: "X", catalogo });
    const r = await sinResenas.pedidos.onRequestPost({ env, request: req("/api/admin/pedidos", { cookie, cuerpo: { accion: "pedir-resena", orden: "ORD5" } }) });
    assert.equal(r.status, 404, "sin reseñas activas, no");
  });

  await prueba("lo que se muestra: escapado, estrellas con medias y datos para Google", () => {
    const resumen = {
      total: 2,
      promedio: 4.5,
      resenas: [
        { nombre: "Ana <S.>", estrellas: 5, texto: "<script>alert(1)</script>", fecha: "2026-10-20T12:00:00.000Z", variante: "Rosa", respuesta: { texto: "Gracias & saludos", fecha: "2026-10-21T00:00:00.000Z" } },
        { nombre: "Luis", estrellas: 4, texto: "Bien", fecha: "2026-10-19T12:00:00.000Z" },
      ],
    };
    const html = htmlListaResenas(resumen, "Isatin");
    assert.ok(!html.includes("<script>") && html.includes("&lt;script&gt;"));
    assert.ok(html.includes("Ana &lt;S.&gt;") && html.includes("Gracias &amp; saludos") && html.includes("Compró: Rosa"));
    assert.ok(html.includes("Compra verificada"));
    assert.match(htmlEstrellas(4.5), /--valor:90%/);
    assert.match(htmlEstrellas(4.5), /4,5 de 5 estrellas/);
    assert.equal(textoResumen({ total: 1, promedio: 5 }), "5 de 5 · 1 opinión");
    assert.equal(textoResumen(resumen), "4,5 de 5 · 2 opiniones");
    const ld = jsonLdResenas(resumen) as any;
    assert.equal(ld.aggregateRating.ratingValue, 4.5);
    assert.equal(ld.aggregateRating.reviewCount, 2);
    assert.equal(ld.review[0].author.name, "Ana <S.>", "el JSON-LD lo escapa el borde al insertarlo");
    assert.equal(ld.review[1].reviewRating.ratingValue, 4);
  });

  console.log(`\n${pasaron} pruebas pasaron.`);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
