/**
 * Prueba de las categorías editables (nombre, nombre corto y foto).
 * Se corre con `npm test`.
 */
import assert from "node:assert/strict";
import type { AlmacenKV } from "../core/tipos";
import {
  aplicarCambios,
  crearCatalogoEditable,
  limpiarCambios,
  rellenarPlantilla,
  validarCambioCategoria,
} from "../modulos/catalogo/index";

let pasaron = 0;
async function prueba(nombre: string, fn: () => Promise<void> | void) {
  await fn();
  pasaron++;
  console.log("  ok —", nombre);
}
function kvMemoria() {
  const datos = new Map<string, string>();
  const kv: AlmacenKV = {
    get: async (k) => datos.get(k) ?? null,
    put: async (k, v) => void datos.set(k, v),
    delete: async (k) => void datos.delete(k),
    list: async () => ({ keys: [...datos.keys()].map((name) => ({ name })) }),
  };
  return { kv, datos };
}

const BASE = [
  { id: "peluches", nombre: "Peluches clásicos", corto: "Peluches", imagen: "/img/categorias/peluches.webp" },
  { id: "flores", nombre: "Flores tejidas", corto: "Flores" },
];
const PRODUCTOS = [
  { id: "gatito", nombre: "Gatito", precio: 1000, categoria: "peluches", tipo: "fisico" as const },
];

async function run() {
  console.log("Categorías editables:");

  await prueba("valida nombre (2 a 60) y corto (hasta 40), y limpia caracteres de control", () => {
    assert.ok(!validarCambioCategoria({ nombre: "x" }).ok);
    assert.ok(!validarCambioCategoria({ nombre: "x".repeat(61) }).ok);
    assert.ok(!validarCambioCategoria({ nombre: "Bien", corto: "x".repeat(41) }).ok);
    const r = validarCambioCategoria({ nombre: "  Peluches\u0000 y anime ", corto: "" });
    assert.ok(r.ok && r.datos.nombre === "Peluches y anime");
  });

  await prueba("lo guardado se limpia: ids inventados, fotos ajenas y campos raros no pasan", () => {
    const c = limpiarCambios(
      {
        peluches: { nombre: "Peluches y anime", imagen: "https://otro.cl/x.png", extra: "<script>" },
        inventada: { nombre: "No existe" },
        flores: { imagen: "/media/categoria-flores-a1b2c3" },
      },
      BASE
    );
    assert.deepEqual(Object.keys(c).sort(), ["flores", "peluches"]);
    assert.equal(c.peluches.imagen, undefined);
    assert.equal((c.peluches as Record<string, unknown>).extra, undefined);
    assert.equal(c.flores.imagen, "/media/categoria-flores-a1b2c3");
  });

  await prueba("aplicar cambios: mismo orden e ids; corto vacío = nombre; sin cambio queda igual", () => {
    const r = aplicarCambios(BASE, { peluches: { nombre: "Peluches clásicos y anime", corto: "" } });
    assert.deepEqual(r.map((c) => c.id), ["peluches", "flores"]);
    assert.equal(r[0].nombre, "Peluches clásicos y anime");
    assert.equal(r[0].corto, "Peluches clásicos y anime");
    assert.equal(r[0].imagen, "/img/categorias/peluches.webp", "la foto del sitio se mantiene si no se cambió");
    assert.equal(r[1], BASE[1]);
  });

  await prueba("plantillas de título y descripción: {nombre} y {corto}", () => {
    assert.equal(rellenarPlantilla("{nombre} | Tienda", { nombre: "Flores" }), "Flores | Tienda");
    assert.equal(rellenarPlantilla("{corto} y {nombre}", { nombre: "Flores tejidas", corto: "Flores" }), "Flores y Flores tejidas");
  });

  await prueba("el catálogo usa los nombres editados, aunque los productos no se hayan editado", async () => {
    const { kv } = kvMemoria();
    const env = { REVIEWS_KV: kv };
    const fuente = crearCatalogoEditable(PRODUCTOS, BASE);
    assert.equal(await fuente.categoriasEditadas(env), false);
    const r = await fuente.guardarCambiosCategorias(env, { peluches: { nombre: "Peluches y anime" } });
    assert.ok(r.ok);
    assert.equal(await fuente.categoriasEditadas(env), true);
    assert.equal(await fuente.editado(env), false, "los productos siguen sin editar");
    assert.equal((await fuente.obtener(env)).categoria("peluches")?.nombre, "Peluches y anime");
    // Y si después se editan los productos, los nombres editados siguen.
    await fuente.guardar(env, [{ ...PRODUCTOS[0], precio: 2000 }]);
    const c = await fuente.obtener(env);
    assert.equal(c.categoria("peluches")?.nombre, "Peluches y anime");
    assert.equal(c.buscar("gatito")?.precio, 2000);
  });

  await prueba("guardar sin cambios borra la clave (vuelven las del sitio)", async () => {
    const { kv, datos } = kvMemoria();
    const env = { REVIEWS_KV: kv };
    const fuente = crearCatalogoEditable(PRODUCTOS, BASE);
    await fuente.guardarCambiosCategorias(env, { flores: { nombre: "Flores" } });
    assert.ok(datos.has("catalogo:categorias"));
    await fuente.guardarCambiosCategorias(env, {});
    assert.ok(!datos.has("catalogo:categorias"));
    assert.equal((await fuente.obtener(env)).categoria("flores")?.nombre, "Flores tejidas");
  });

  await prueba("datos dañados en KV: se usan las categorías del sitio", async () => {
    const { kv, datos } = kvMemoria();
    datos.set("catalogo:categorias", "{roto");
    const original = console.error;
    console.error = () => {};
    try {
      const fuente = crearCatalogoEditable(PRODUCTOS, BASE);
      assert.equal(await fuente.categoriasEditadas({ REVIEWS_KV: kv }), false);
    } finally {
      console.error = original;
    }
  });

  console.log(`\n${pasaron} pruebas pasaron.`);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
