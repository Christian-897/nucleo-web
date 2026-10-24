/**
 * Prueba de las opciones de producto (v0.40), en el peor caso: precio por
 * opción, colores por opción y unidades por combinación (tamaño × color).
 * Se corre con `npm test`.
 */
import assert from "node:assert/strict";
import type { AlmacenKV } from "../core/tipos";
import { crearCatalogo, devolverUnidades, productoDisponible, registrarVenta, stockDeColores, ErrorCatalogo } from "../modulos/catalogo/index";
import { fuenteCarrito } from "../modulos/catalogo/stock";
import { validarCarrito } from "../modulos/carrito/servidor";
import { crearEndpointStock } from "../modulos/catalogo/endpoint";
import { idCompuesto, partirId } from "../modulos/catalogo/colores";
import { problemaOpciones, rangoDePrecios } from "../modulos/catalogo/opciones";
import { htmlOpciones } from "../modulos/catalogo/borde";
import { validarOpciones } from "../modulos/panel/productos";
import type { ProductoCatalogo } from "../modulos/catalogo/tipos";

let pasaron = 0;
async function prueba(nombre: string, fn: () => Promise<void> | void) {
  await fn();
  pasaron++;
  console.log("  ok —", nombre);
}
function kv(): AlmacenKV {
  const d = new Map<string, string>();
  return { get: async (k) => d.get(k) ?? null, put: async (k, v) => void d.set(k, v), delete: async (k) => void d.delete(k), list: async (o) => ({ keys: [...d.keys()].filter((k) => k.startsWith(o?.prefix ?? "")).map((name) => ({ name })) }) };
}

const scrunchie: ProductoCatalogo = {
  id: "scrunchie", nombre: "Scrunchie", precio: 6990, categoria: "pelo", tipo: "fisico",
  colores: [{ id: "rosa", nombre: "Rosa" }, { id: "verde", nombre: "Verde agua" }, { id: "negro", nombre: "Negro" }],
  tituloOpciones: "Tamaño",
  opciones: [
    { id: "mini", nombre: "Mini", precio: 4990, colores: ["rosa", "verde"], stockColores: { rosa: 1, verde: 0 } },
    { id: "xl", nombre: "XL", precio: 9990, stockColores: { rosa: 10, verde: 3 } }, // negro: sin límite
  ],
};
const gorro: ProductoCatalogo = { id: "gorro", nombre: "Gorro", precio: 12990, categoria: "pelo", tipo: "fisico", opciones: [{ id: "saten", nombre: "100% satín", stock: 2 }, { id: "raso", nombre: "Raso", precio: 8990 }] };
const catalogo = crearCatalogo([scrunchie, gorro], [{ id: "pelo", nombre: "Pelo" }]);

async function run() {
  console.log("Opciones de producto:");

  await prueba("ids: prod~color~opcion y prod~~opcion; los de siempre no cambian", () => {
    assert.deepEqual(partirId("scrunchie~verde~xl"), { base: "scrunchie", color: "verde", opcion: "xl" });
    assert.deepEqual(partirId("gorro~~raso"), { base: "gorro", opcion: "raso" });
    assert.deepEqual(partirId("lana~azul"), { base: "lana", color: "azul" });
    assert.deepEqual(partirId("lana"), { base: "lana" });
    assert.equal(idCompuesto("gorro", undefined, "raso"), "gorro~~raso");
    assert.equal(idCompuesto("s", "verde", "xl"), "s~verde~xl");
    assert.equal(idCompuesto("s", "verde"), "s~verde");
  });

  await prueba("validación del catálogo: precio, unidades, colores que no existen, repetidas y máximo", () => {
    assert.equal(problemaOpciones(scrunchie), null);
    assert.match(problemaOpciones({ ...scrunchie, opciones: [{ id: "a", nombre: "A", colores: ["dorado"] }] })!, /color que el producto no tiene/);
    assert.match(problemaOpciones({ ...scrunchie, opciones: [{ id: "a", nombre: "A", stockColores: { dorado: 1 } }] })!, /unidades inválidas/);
    assert.match(problemaOpciones({ ...scrunchie, opciones: [{ id: "a", nombre: "A", precio: 0 }] })!, /precio/);
    assert.match(problemaOpciones({ ...scrunchie, opciones: [{ id: "a", nombre: "A" }, { id: "a", nombre: "B" }] })!, /repetida/);
    assert.match(problemaOpciones({ ...scrunchie, opciones: [{ id: "a", nombre: "A", colores: [] }] })!, /ningún color/);
    assert.throws(() => crearCatalogo([{ ...gorro, opciones: [{ id: "X X", nombre: "x" }] }]), ErrorCatalogo);
    assert.deepEqual(rangoDePrecios(scrunchie), { min: 4990, max: 9990 });
    assert.deepEqual(rangoDePrecios(gorro), { min: 8990, max: 12990 });
  });

  await prueba("cada combinación es un producto propio: nombre, precio de la opción y sus unidades", async () => {
    const env = { REVIEWS_KV: kv() };
    const xlVerde = await productoDisponible(catalogo, env, "scrunchie~verde~xl");
    assert.equal(xlVerde?.nombre, "Scrunchie · XL · Verde agua");
    assert.equal(xlVerde?.precio, 9990);
    assert.equal(xlVerde?.stock, 3);
    assert.equal((await productoDisponible(catalogo, env, "scrunchie~negro~xl"))?.stock, undefined, "sin número = sin límite");
    assert.equal((await productoDisponible(catalogo, env, "scrunchie~negro~mini")), null, "el Mini no viene en negro");
    assert.equal((await productoDisponible(catalogo, env, "scrunchie~verde~xxl")), null);
    assert.equal((await productoDisponible(catalogo, env, "gorro~~raso"))?.precio, 8990);
    assert.equal((await productoDisponible(catalogo, env, "gorro~~saten"))?.precio, 12990, "sin precio propio = el del producto");
    assert.equal((await productoDisponible(catalogo, env, "gorro~rojo~raso")), null, "el gorro no tiene colores");
    const soloColor = await productoDisponible(catalogo, env, "scrunchie~verde");
    assert.equal(soloColor?.requiereOpcion, true, "con color pero sin tamaño: no se vende");
    assert.equal(soloColor?.stock, 3, "suma del verde en todos los tamaños (0 Mini + 3 XL)");
  });

  await prueba("carrito: sin elegir opción o color no se puede; agotado no; el precio es el de la opción", async () => {
    const env = { REVIEWS_KV: kv() };
    const fuente = fuenteCarrito(catalogo)(env);
    for (const id of ["scrunchie", "scrunchie~verde", "scrunchie~~xl", "gorro", "scrunchie~negro~mini"]) {
      const r = await validarCarrito([{ productoId: id, cantidad: 1 }], fuente);
      assert.equal(r.listoParaPagar, false, id);
      assert.equal(r.problemas[0].tipo, "no-existe", id);
    }
    const agotado = await validarCarrito([{ productoId: "scrunchie~verde~mini", cantidad: 1 }], fuente);
    assert.equal(agotado.problemas[0].tipo, "sin-stock");
    const bien = await validarCarrito([{ productoId: "scrunchie~verde~xl", cantidad: 2, precio: 1 } as never, { productoId: "gorro~~raso", cantidad: 1 }], fuente);
    assert.equal(bien.listoParaPagar, true);
    assert.equal(bien.total, 9990 * 2 + 8990);
    const mucho = await validarCarrito([{ productoId: "scrunchie~rosa~mini", cantidad: 5 }], fuente);
    assert.equal(mucho.lineas[0].cantidad, 1, "queda 1 Mini rosa");
  });

  await prueba("peor caso: se agota un tamaño en un color y los demás siguen; anular devuelve a esa combinación", async () => {
    const env = { REVIEWS_KV: kv() };
    await registrarVenta(catalogo, env, [{ productoId: "scrunchie~rosa~mini", cantidad: 1 }, { productoId: "scrunchie~verde~xl", cantidad: 2 }, { productoId: "gorro~~saten", cantidad: 2 }]);
    assert.equal((await productoDisponible(catalogo, env, "scrunchie~rosa~mini"))?.stock, 0, "el Mini rosa se agotó");
    assert.equal((await productoDisponible(catalogo, env, "scrunchie~rosa~xl"))?.stock, 10, "el XL rosa sigue igual");
    assert.equal((await productoDisponible(catalogo, env, "scrunchie~verde~xl"))?.stock, 1);
    assert.equal((await productoDisponible(catalogo, env, "gorro~~saten"))?.stock, 0);
    assert.deepEqual(await stockDeColores(catalogo, env, "scrunchie"), {
      "scrunchie~rosa~mini": 0, "scrunchie~verde~mini": 0,
      "scrunchie~rosa~xl": 10, "scrunchie~verde~xl": 1, "scrunchie~negro~xl": null,
    });
    // Ventas sin combinación completa no tocan nada.
    await registrarVenta(catalogo, env, [{ productoId: "scrunchie~rosa", cantidad: 1 }, { productoId: "scrunchie~~xl", cantidad: 1 }]);
    assert.equal((await productoDisponible(catalogo, env, "scrunchie~rosa~xl"))?.stock, 10);
    await devolverUnidades(catalogo, env, [{ productoId: "scrunchie~rosa~mini", cantidad: 1 }]);
    assert.equal((await productoDisponible(catalogo, env, "scrunchie~rosa~mini"))?.stock, 1);
    // Producto base: suma (sin límite si alguna combinación no tiene límite) y no se vende.
    assert.equal((await productoDisponible(catalogo, env, "scrunchie"))?.stock, undefined);
    assert.equal((await productoDisponible(catalogo, env, "gorro"))?.stock, undefined);
    const soloMini = crearCatalogo([{ ...scrunchie, opciones: [scrunchie.opciones![0]] }]);
    assert.equal((await productoDisponible(soloMini, env, "scrunchie"))?.stock, 1);
  });

  await prueba("endpoint de stock: ids con opción y ?producto= con todas las combinaciones", async () => {
    const env = { REVIEWS_KV: kv() };
    const ep = crearEndpointStock(catalogo);
    const r = await (await ep.onRequestGet({ env, request: new Request("https://t.cl/api/stock?ids=scrunchie~verde~xl,gorro~~raso,scrunchie~verde~X%20L") })).json();
    assert.deepEqual(r, { "scrunchie~verde~xl": 3, "gorro~~raso": null });
    const g = await (await ep.onRequestGet({ env, request: new Request("https://t.cl/api/stock?producto=gorro") })).json();
    assert.deepEqual(g, { "gorro~~saten": 2, "gorro~~raso": null });
  });

  await prueba("botones de la ficha: precio y colores de cada opción, nombres escapados", () => {
    const h = htmlOpciones(scrunchie);
    assert.match(h, /data-opcion="mini" data-opcion-nombre="Mini" data-opcion-precio="4990" data-opcion-colores="rosa,verde" aria-pressed="true"/);
    assert.match(h, /data-opcion="xl"[^>]*data-opcion-colores=""/);
    assert.ok(h.includes("$9.990") || h.includes("9.990"));
    const raro = htmlOpciones({ ...gorro, opciones: [{ id: "a", nombre: '<img src=x onerror="a()">' }] });
    assert.ok(!raro.includes("<img"));
  });

  await prueba("panel: valida nombres, precios y unidades por color; «no» = no viene", () => {
    const ok = validarOpciones({ titulo: "Tamaño", opciones: [{ nombre: "Mini", precio: "4.990", colores: { rosa: "3", verde: "no", negro: "" } }] }, scrunchie);
    assert.ok(ok.ok);
    if (ok.ok) assert.deepEqual(ok.opciones[0], { id: undefined, nombre: "Mini", precio: 4990, disponible: null, colores: { rosa: 3, verde: "no", negro: null } });
    const mal = (opciones: unknown[]) => validarOpciones({ opciones }, scrunchie);
    assert.ok(!mal([{ nombre: "" }]).ok);
    assert.ok(!mal([{ nombre: "Mini" }, { nombre: "mini" }]).ok);
    assert.ok(!mal([{ nombre: "Mini", precio: "4,5" }]).ok);
    assert.ok(!mal([{ nombre: "Mini", colores: { rosa: "-1" } }]).ok);
    assert.ok(!mal([{ nombre: "Mini", colores: { rosa: "no", verde: "no", negro: "no" } }]).ok, "tiene que venir en algún color");
    assert.ok(!mal(Array.from({ length: 13 }, (_, i) => ({ nombre: `T${i}` }))).ok);
    const id = validarOpciones({ opciones: [{ id: "xl", nombre: "Extra grande" }, { id: "inventado", nombre: "Otro" }] }, scrunchie);
    assert.ok(id.ok && id.opciones[0].id === "xl" && id.opciones[1].id === undefined, "solo se conservan ids que ya existían");
  });

  console.log(`\n${pasaron} pruebas pasaron.`);
}
run().catch((e) => {
  console.error(e);
  process.exit(1);
});
