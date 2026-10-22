/**
 * Prueba de la vista de las listas (v0.37): "una tarjeta por producto" con
 * muestras de colores o "una tarjeta por color", elegida en el panel.
 * Se corre con `npm test`.
 */
import assert from "node:assert/strict";
import type { AlmacenKV } from "../core/tipos";
import { crearCatalogo } from "../modulos/catalogo/index";
import { htmlMuestras, itemsDeLista } from "../modulos/catalogo/borde";
import {
  CLAVE_VISTA_LISTAS,
  guardarVistaListas,
  limpiarVistaListas,
  obtenerVistaListas,
  VISTA_LISTAS_POR_DEFECTO,
  vistaDeFiltro,
} from "../modulos/catalogo/vista-listas";
import type { ProductoCatalogo } from "../modulos/catalogo/tipos";

let pasaron = 0;
async function prueba(nombre: string, fn: () => Promise<void> | void) {
  await fn();
  pasaron++;
  console.log("  ok —", nombre);
}

function kvMemoria() {
  const d = new Map<string, string>();
  const kv: AlmacenKV = {
    get: async (k) => d.get(k) ?? null,
    put: async (k, v) => void d.set(k, v),
    delete: async (k) => void d.delete(k),
    list: async () => ({ keys: [...d.keys()].map((name) => ({ name })) }),
  };
  return { kv, d };
}

const colores = ["Rosa", "Lila", "Verde agua", "Negro", "Gris", "Rojo", "Azul", "Blanco"].map((nombre, i) => ({
  id: nombre.toLowerCase().replace(/\s+/g, "-"),
  nombre,
  foto: `/img/colores/c${i}.webp`,
}));
const scrunchie: ProductoCatalogo = { id: "scrunchie", nombre: "Scrunchie", precio: 4990, categoria: "pelo", tipo: "fisico", imagen: "/img/s.webp", colores };
const cepillo: ProductoCatalogo = { id: "cepillo", nombre: "Cepillo", precio: 9990, categoria: "pelo", tipo: "fisico", destacado: true };
const catalogo = crearCatalogo([scrunchie, cepillo], [{ id: "pelo", nombre: "Pelo" }]);

async function run() {
  console.log("Vista de las listas:");

  await prueba("de fábrica: una tarjeta por producto en todas partes (como antes)", () => {
    assert.deepEqual(VISTA_LISTAS_POR_DEFECTO, { categorias: "producto", general: "producto" });
    assert.deepEqual(limpiarVistaListas(null), VISTA_LISTAS_POR_DEFECTO);
  });

  await prueba("limpiar: lo del panel encima de lo del sitio; basura se descarta", () => {
    const sitio = { categorias: "color" as const };
    assert.deepEqual(limpiarVistaListas({}, sitio), { categorias: "color", general: "producto" });
    assert.deepEqual(limpiarVistaListas({ general: "color" }, sitio), { categorias: "color", general: "color" });
    assert.deepEqual(limpiarVistaListas({ categorias: "<script>", general: 3 }, sitio), { categorias: "color", general: "producto" });
    assert.deepEqual(limpiarVistaListas([], { categorias: "raro" as never }), VISTA_LISTAS_POR_DEFECTO);
  });

  await prueba("cada lista usa su vista: categorías vs. el resto", () => {
    const v = { categorias: "color" as const, general: "producto" as const };
    assert.equal(vistaDeFiltro(v, "categoria:pelo"), "color");
    assert.equal(vistaDeFiltro(v, "todos"), "producto");
    assert.equal(vistaDeFiltro(v, "destacados"), "producto");
    assert.equal(vistaDeFiltro(v, "relacionados:pelo:cepillo"), "producto");
  });

  await prueba("una tarjeta por color: el producto se abre en sus colores, en orden; sin colores, igual", () => {
    const items = itemsDeLista(catalogo, "categoria:pelo", "color");
    assert.equal(items.length, colores.length + 1);
    assert.deepEqual(items.slice(0, 3).map((i) => i.color?.id), ["rosa", "lila", "verde-agua"]);
    assert.equal(items[colores.length].p.id, "cepillo");
    assert.equal(items[colores.length].color, undefined);
    const porProducto = itemsDeLista(catalogo, "categoria:pelo", "producto");
    assert.deepEqual(porProducto.map((i) => [i.p.id, i.color]), [["scrunchie", undefined], ["cepillo", undefined]]);
  });

  await prueba("muestras: hasta N con «+resto», nombres escapados y solo fotos propias", () => {
    const html = htmlMuestras(scrunchie, "/img/defecto.webp", 6);
    assert.equal((html.match(/data-muestra /g) ?? []).length, 6);
    assert.match(html, /<span class="muestras__mas">\+2<\/span>/);
    assert.match(html, /data-muestra-color="verde-agua" data-muestra-foto="\/img\/colores\/c2.webp"/);
    const raro: ProductoCatalogo = {
      ...scrunchie,
      colores: [{ id: "x", nombre: '<img src=x onerror="alert(1)">', foto: "https://malo.cl/a.jpg" }],
    };
    const h2 = htmlMuestras(raro, "/img/defecto.webp", 6);
    assert.ok(!h2.includes("<img src=x"));
    assert.ok(h2.includes("&lt;img"));
    assert.ok(!h2.includes("malo.cl"));
    assert.ok(h2.includes("/img/defecto.webp"));
    assert.ok(!h2.includes("muestras__mas"), "sin resto no hay «+N»");
  });

  await prueba("guardar y leer: KV manda; sin KV o con basura rige lo del sitio", async () => {
    const { kv, d } = kvMemoria();
    const env = { REVIEWS_KV: kv };
    assert.deepEqual(await obtenerVistaListas(env, { categorias: "color" }), { categorias: "color", general: "producto" });
    const g = await guardarVistaListas(env, { categorias: "producto", general: "color", otra: 1 }, { categorias: "color" });
    assert.deepEqual(g, { categorias: "producto", general: "color" });
    assert.deepEqual(JSON.parse(d.get(CLAVE_VISTA_LISTAS)!), g);
    assert.deepEqual(await obtenerVistaListas(env), g);
    const otro = kvMemoria();
    otro.d.set(CLAVE_VISTA_LISTAS, "{no es json");
    assert.deepEqual(await obtenerVistaListas({ REVIEWS_KV: otro.kv }, { general: "color" }), { categorias: "producto", general: "color" });
    await assert.rejects(guardarVistaListas({}, { categorias: "color" }));
  });

  console.log(`\n${pasaron} pruebas pasaron.`);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
