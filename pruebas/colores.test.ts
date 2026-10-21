/**
 * Prueba de los colores de producto (v0.35): validación, stock por color,
 * carrito (no se puede comprar sin color ni un color inventado o agotado),
 * endpoint de stock y HTML seguro de las miniaturas. Se corre con `npm test`.
 */
import assert from "node:assert/strict";
import type { AlmacenKV } from "../core/tipos";
import { crearCatalogo, devolverUnidades, productoDisponible, registrarVenta, stockDeColores } from "../modulos/catalogo/index";
import { fuenteCarrito } from "../modulos/catalogo/stock";
import { validarCarrito } from "../modulos/carrito/servidor";
import { crearEndpointStock } from "../modulos/catalogo/endpoint";
import { htmlColores } from "../modulos/catalogo/borde";
import { idBase, idColorDesdeNombre, partirId } from "../modulos/catalogo/colores";
import { limpiarAjustesFicha } from "../modulos/catalogo/ficha";
import type { ProductoCatalogo } from "../modulos/catalogo/tipos";
import { necesitaDespacho } from "../modulos/compra/cliente";

let pasaron = 0;
async function prueba(nombre: string, fn: () => Promise<void> | void) {
  await fn();
  pasaron++;
  console.log("  ok —", nombre);
}

function kv(): AlmacenKV {
  const d = new Map<string, string>();
  return {
    get: async (k) => d.get(k) ?? null,
    put: async (k, v) => void d.set(k, v),
    delete: async (k) => void d.delete(k),
    list: async (o) => ({ keys: [...d.keys()].filter((k) => k.startsWith(o?.prefix ?? "")).map((name) => ({ name })) }),
  };
}

const lana: ProductoCatalogo = {
  id: "lana",
  nombre: "Lana peluche",
  precio: 3990,
  categoria: "lanas",
  tipo: "fisico",
  imagen: "/img/lana.webp",
  colores: [
    { id: "azul", nombre: "Azul rey", foto: "/media/color-lana-aaaaaaaaaaaa", mini: "/media/color-lana-bbbbbbbbbbbb", stock: 5 },
    { id: "rojo", nombre: "Rojo", foto: "/img/rojo.webp", stock: 0 },
    { id: "blanco", nombre: "Blanco" },
  ],
};
const silla: ProductoCatalogo = { id: "silla", nombre: "Silla", precio: 19990, categoria: "lanas", tipo: "fisico", stock: 3 };
const catalogo = crearCatalogo([lana, silla], [{ id: "lanas", nombre: "Lanas" }]);

async function run() {
  console.log("Colores de producto:");

  await prueba("ids: separar, base y crear desde el nombre", () => {
    assert.deepEqual(partirId("lana~azul"), { base: "lana", color: "azul" });
    assert.deepEqual(partirId("lana"), { base: "lana" });
    assert.equal(idBase("lana~azul"), "lana");
    assert.equal(idColorDesdeNombre("Azul Rey (claro)", new Set()), "azul-rey-claro");
    assert.equal(idColorDesdeNombre("Azul rey", new Set(["azul-rey"])), "azul-rey-2");
    assert.equal(idColorDesdeNombre("¡¡!!", new Set()), "color");
  });

  await prueba("validación: rechaza ids raros, repetidos, fotos ajenas, stock negativo y más de 100", () => {
    const con = (colores: unknown, extra: Record<string, unknown> = {}) => () =>
      crearCatalogo([{ ...silla, id: "x", colores, ...extra } as ProductoCatalogo]);
    assert.throws(con([{ id: "Azul", nombre: "Azul" }]), /id de color/);
    assert.throws(con([{ id: "a", nombre: "A" }, { id: "a", nombre: "B" }]), /repetido/);
    assert.throws(con([{ id: "a", nombre: "A", foto: "https://malo.com/x.jpg" }]), /foto/);
    assert.throws(con([{ id: "a", nombre: "A", foto: "/media/../secreto" }]), /foto/);
    assert.throws(con([{ id: "a", nombre: "A", stock: -1 }]), /stock/);
    assert.throws(con([{ id: "a", nombre: "" }]), /nombre/);
    assert.throws(con(Array.from({ length: 101 }, (_, i) => ({ id: `c${i}`, nombre: `C${i}` }))), /100/);
    assert.throws(con([], { tituloColores: "Talla" }), /título/);
    assert.throws(con([], { enfoqueColores: { x: 150, y: 2 } }), /enfoque/);
    assert.doesNotThrow(con(Array.from({ length: 100 }, (_, i) => ({ id: `c${i}`, nombre: `C${i}` }))));
  });

  await prueba("cada color es un producto propio: nombre, foto, stock; color inventado = no existe", async () => {
    const env = { REVIEWS_KV: kv() };
    const a = await productoDisponible(catalogo, env, "lana~azul");
    assert.equal(a?.nombre, "Lana peluche · Azul rey");
    assert.equal(a?.precio, 3990);
    assert.equal(a?.stock, 5);
    assert.equal(a?.imagen, "/media/color-lana-bbbbbbbbbbbb");
    assert.equal((await productoDisponible(catalogo, env, "lana~rojo"))?.imagen, "/img/rojo.webp");
    assert.equal((await productoDisponible(catalogo, env, "lana~blanco"))?.stock, undefined);
    assert.equal(await productoDisponible(catalogo, env, "lana~verde"), null);
    assert.equal(await productoDisponible(catalogo, env, "silla~azul"), null);
    // Sin color: sirve para "agotado" en listas (sin límite si algún color no tiene límite).
    const base = await productoDisponible(catalogo, env, "lana");
    assert.equal(base?.requiereColor, true);
    assert.equal(base?.stock, undefined);
  });

  await prueba("carrito: sin color no se puede; color inventado o agotado no; el precio es el del servidor", async () => {
    const env = { REVIEWS_KV: kv() };
    const fuente = fuenteCarrito(catalogo)(env);
    const sinColor = await validarCarrito([{ productoId: "lana", cantidad: 1 }], fuente);
    assert.equal(sinColor.listoParaPagar, false);
    assert.equal(sinColor.problemas[0].tipo, "no-existe");
    const inventado = await validarCarrito([{ productoId: "lana~dorado", cantidad: 1 }], fuente);
    assert.equal(inventado.problemas[0].tipo, "no-existe");
    const agotado = await validarCarrito([{ productoId: "lana~rojo", cantidad: 1 }], fuente);
    assert.equal(agotado.problemas[0].tipo, "sin-stock");
    const mucho = await validarCarrito([{ productoId: "lana~azul", cantidad: 9 }], fuente);
    assert.equal(mucho.lineas[0].cantidad, 5);
    assert.equal(mucho.problemas[0].tipo, "stock-ajustado");
    const bien = await validarCarrito([{ productoId: "lana~azul", cantidad: 2, precio: 1 } as never, { productoId: "lana~blanco", cantidad: 3 }], fuente);
    assert.equal(bien.listoParaPagar, true);
    assert.equal(bien.total, 3990 * 5);
    assert.equal(bien.lineas[0].nombre, "Lana peluche · Azul rey");
  });

  await prueba("venta y anulación descuentan y devuelven SOLO al color vendido", async () => {
    const env = { REVIEWS_KV: kv() };
    await registrarVenta(catalogo, env, [{ productoId: "lana~azul", cantidad: 2 }, { productoId: "silla", cantidad: 1 }, { productoId: "lana~blanco", cantidad: 4 }]);
    assert.equal((await productoDisponible(catalogo, env, "lana~azul"))?.stock, 3);
    assert.equal((await productoDisponible(catalogo, env, "silla"))?.stock, 2);
    assert.deepEqual(await stockDeColores(catalogo, env, "lana"), { "lana~azul": 3, "lana~rojo": 0, "lana~blanco": null });
    // Ventas de un color o del producto base no tocan a los otros.
    await registrarVenta(catalogo, env, [{ productoId: "lana", cantidad: 1 }, { productoId: "lana~verde", cantidad: 1 }]);
    assert.equal((await productoDisponible(catalogo, env, "lana~azul"))?.stock, 3);
    await devolverUnidades(catalogo, env, [{ productoId: "lana~azul", cantidad: 2 }]);
    assert.equal((await productoDisponible(catalogo, env, "lana~azul"))?.stock, 5);
  });

  await prueba("suma de stock del producto con colores (todos limitados)", async () => {
    const env = { REVIEWS_KV: kv() };
    const c2 = crearCatalogo([{ ...lana, colores: lana.colores!.filter((c) => c.stock !== undefined) }]);
    assert.equal((await productoDisponible(c2, env, "lana"))?.stock, 5);
    await registrarVenta(c2, env, [{ productoId: "lana~azul", cantidad: 5 }]);
    assert.equal((await productoDisponible(c2, env, "lana"))?.stock, 0, "todos agotados = producto agotado");
  });

  await prueba("endpoint de stock: ids con color, ?producto= y basura filtrada", async () => {
    const env = { REVIEWS_KV: kv() };
    const ep = crearEndpointStock(catalogo);
    const pedir = async (q: string) => (await ep.onRequestGet({ request: new Request("https://t.cl/api/stock?" + q), env })).json();
    assert.deepEqual(await pedir("ids=lana~azul,silla,lana~ROJO,lana~,../x,lana~a~b"), { "lana~azul": 5, silla: 3 });
    assert.deepEqual(await pedir("producto=lana"), { "lana~azul": 5, "lana~rojo": 0, "lana~blanco": null });
    assert.deepEqual(await pedir("producto=../x"), {});
  });

  await prueba("miniaturas: nombres escapados, fotos solo propias, el primero elegido", () => {
    const html = htmlColores(
      {
        ...lana,
        colores: [
          { id: "malo", nombre: '"><script>alert(1)</script>', foto: "/media/color-lana-cccccccccccc" },
          { id: "otro", nombre: "Otro", foto: "javascript:alert(1)" as never },
        ],
      },
      "/img/defecto.webp"
    );
    assert.ok(!html.includes("<script>"));
    assert.ok(html.includes("&lt;script&gt;"));
    assert.ok(!html.includes("javascript:"));
    assert.ok(html.includes('data-color="lana~malo"'));
    assert.ok(html.includes('aria-pressed="true"'));
    assert.equal((html.match(/aria-pressed="true"/g) ?? []).length, 1);
  });

  await prueba("ajustes de la ficha: completa lo que falta y descarta basura", () => {
    const a = limpiarAjustesFicha({ miniatura: "acercamiento", lupa: false, confianza: "no", extra: 1 });
    assert.equal(a.miniatura, "acercamiento");
    assert.equal(a.lupa, false);
    assert.equal(a.confianza, true);
    assert.equal((a as unknown as Record<string, unknown>).extra, undefined);
    assert.equal(limpiarAjustesFicha({ miniatura: "<b>" }).miniatura, "completa");
  });

  await prueba("despacho: un color usa el tipo de su producto (físico o digital)", () => {
    const tipos = { lana: "fisico" as const, curso: "digital" as const };
    assert.equal(necesitaDespacho([{ productoId: "curso" }], tipos), false);
    assert.equal(necesitaDespacho([{ productoId: "lana~azul" }], tipos), true);
    assert.equal(necesitaDespacho([{ productoId: "curso~basico" }], tipos), false);
  });

  console.log(`\n${pasaron} pruebas pasaron.`);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
