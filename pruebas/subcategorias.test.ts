/**
 * Prueba de las subcategorías (v0.39): limpieza, filtros de listas, rutas,
 * botones (HTML seguro), cambios guardados y sitemap. Se corre con `npm test`.
 */
import assert from "node:assert/strict";
import type { AlmacenKV } from "../core/tipos";
import { aplicarCambios, crearCatalogo, crearCatalogoEditable, crearSitemap, erroresSubcategorias, limpiarCambios, limpiarSubcategorias, subcategoriaDe, validarCambioCategoria } from "../modulos/catalogo/index";
import { htmlSubcategorias, productosDeLista, subcategoriaDeRuta, categoriaDeRuta } from "../modulos/catalogo/borde";

let pasaron = 0;
async function prueba(nombre: string, fn: () => Promise<void> | void) {
  await fn();
  pasaron++;
  console.log("  ok —", nombre);
}
function kv(): AlmacenKV {
  const d = new Map<string, string>();
  return { get: async (k) => d.get(k) ?? null, put: async (k, v) => void d.set(k, v), delete: async (k) => void d.delete(k), list: async () => ({ keys: [...d.keys()].map((name) => ({ name })) }) };
}

const categorias = [{ id: "toallas", nombre: "Toallas", subcategorias: [{ id: "microfibra", nombre: "Microfibra" }, { id: "algodon", nombre: "Algodón" }] }, { id: "gorros", nombre: "Gorros" }];
const productos = [
  { id: "t1", nombre: "Toalla micro", precio: 1, categoria: "toallas", tipo: "fisico" as const, subcategoria: "microfibra" },
  { id: "t2", nombre: "Toalla algodón", precio: 1, categoria: "toallas", tipo: "fisico" as const, subcategoria: "algodon" },
  { id: "t3", nombre: "Toalla sin sub", precio: 1, categoria: "toallas", tipo: "fisico" as const },
  { id: "g1", nombre: "Gorro", precio: 1, categoria: "gorros", tipo: "fisico" as const, subcategoria: "microfibra" },
];
const catalogo = crearCatalogo(productos, categorias);

async function run() {
  console.log("Subcategorías:");

  await prueba("limpiar: nombres 2-40, sin repetir (ni por mayúsculas), ids desde el nombre y los existentes se conservan", () => {
    const r = limpiarSubcategorias([{ nombre: "Microfibra" }, { nombre: " Algodón " }, { nombre: "microfibra" }, { nombre: "x" }, { id: "raso-fino", nombre: "Raso" }, "basura", { nombre: "A".repeat(60) }]);
    assert.deepEqual(r.map((x) => x.id), ["microfibra", "algodon", "raso-fino", "a".repeat(40)]);
    assert.equal(r[1].nombre, "Algodón");
    assert.equal(r[3].nombre.length, 40);
    // Un id que ya existe no se lo roba uno nuevo con el mismo nombre.
    const r2 = limpiarSubcategorias([{ nombre: "Mini" }, { id: "mini", nombre: "Pequeño" }]);
    assert.deepEqual(r2, [{ id: "mini-2", nombre: "Mini" }, { id: "mini", nombre: "Pequeño" }]);
    assert.equal(limpiarSubcategorias(Array.from({ length: 20 }, (_, i) => ({ nombre: `Sub ${i}` }))).length, 12);
    assert.deepEqual(limpiarSubcategorias("no"), []);
  });

  await prueba("errores para el panel: vacías, largas, repetidas y más de 12", () => {
    assert.equal(erroresSubcategorias(undefined), null);
    assert.equal(erroresSubcategorias([{ nombre: "Mini" }, { nombre: "XL" }]), null);
    assert.match(erroresSubcategorias([{ nombre: "" }])!, /al menos 2/);
    assert.match(erroresSubcategorias([{ nombre: "Mini" }, { nombre: "mini" }])!, /repetida/);
    assert.match(erroresSubcategorias(Array.from({ length: 13 }, (_, i) => ({ nombre: `S${i}x` })))!, /Máximo 12/);
    const v = validarCambioCategoria({ nombre: "Toallas", subcategorias: [{ nombre: "Mini" }, { nombre: "mini" }] });
    assert.ok(!v.ok && v.errores.subcategorias);
    const ok = validarCambioCategoria({ nombre: "Toallas", subcategorias: [{ nombre: "Microfibra" }] });
    assert.ok(ok.ok && ok.datos.subcategorias?.[0].id === "microfibra");
    const sin = validarCambioCategoria({ nombre: "Toallas" });
    assert.ok(sin.ok && sin.datos.subcategorias === undefined, "sin el campo, no se tocan");
  });

  await prueba("cambios guardados: reemplazan las del sitio; [] = sin subcategorías; basura se limpia", () => {
    const limpios = limpiarCambios({ toallas: { subcategorias: [{ nombre: "Rizo" }, { nombre: "<b>x</b>" }] }, gorros: { subcategorias: [] } }, categorias);
    const vigentes = aplicarCambios(categorias, limpios);
    assert.deepEqual(vigentes[0].subcategorias, [{ id: "rizo", nombre: "Rizo" }, { id: "b-x-b", nombre: "<b>x</b>" }]);
    assert.deepEqual(vigentes[1].subcategorias, []);
    assert.deepEqual(aplicarCambios(categorias, {})[0].subcategorias, categorias[0].subcategorias);
  });

  await prueba("listas: categoría completa o solo una subcategoría (otra categoría con el mismo id no se mezcla)", () => {
    assert.deepEqual(productosDeLista(catalogo, "categoria:toallas").map((p) => p.id), ["t1", "t2", "t3"]);
    assert.deepEqual(productosDeLista(catalogo, "categoria:toallas:microfibra").map((p) => p.id), ["t1"]);
    assert.deepEqual(productosDeLista(catalogo, "categoria:toallas:nada").map((p) => p.id), []);
    assert.equal(subcategoriaDe(catalogo.categoria("toallas"), "algodon")?.nombre, "Algodón");
    assert.equal(subcategoriaDe(catalogo.categoria("gorros"), "microfibra"), undefined, "la sub de un producto debe existir en SU categoría");
  });

  await prueba("rutas: /tienda/<cat>/<sub>/ solo con ids válidos; no se confunde con /tienda/<cat>/", () => {
    assert.deepEqual(subcategoriaDeRuta("/tienda/toallas/microfibra/"), { categoria: "toallas", sub: "microfibra" });
    assert.deepEqual(subcategoriaDeRuta("/tienda/toallas/microfibra"), { categoria: "toallas", sub: "microfibra" });
    assert.equal(subcategoriaDeRuta("/tienda/toallas/"), null);
    assert.equal(subcategoriaDeRuta("/tienda/toallas/Micro Fibra/"), null);
    assert.equal(subcategoriaDeRuta("/tienda/a/b/c/"), null);
    assert.equal(categoriaDeRuta("/tienda/toallas/microfibra/"), null);
  });

  await prueba("botones: «Todos» + una por subcategoría, la elegida marcada, nombres escapados; sin subcategorías, vacío", () => {
    const h = htmlSubcategorias(catalogo.categoria("toallas")!, "algodon", "chip");
    assert.equal((h.match(/<li>/g) ?? []).length, 3);
    assert.match(h, /<a class="chip" href="\/tienda\/toallas\/">Todos<\/a>/);
    assert.match(h, /href="\/tienda\/toallas\/algodon\/" aria-current="page">Algodón</);
    assert.match(htmlSubcategorias(catalogo.categoria("toallas")!), /href="\/tienda\/toallas\/" aria-current="page">Todos/);
    assert.equal(htmlSubcategorias(catalogo.categoria("gorros")!), "");
    const malo = htmlSubcategorias({ id: "x", subcategorias: [{ id: "ok", nombre: '<img src=x onerror="a()">' }, { id: "../mal", nombre: "Mal" }] }, undefined, 'chip" onclick="a()');
    assert.ok(!malo.includes("<img"));
    assert.ok(!malo.includes("../mal"));
    assert.ok(!malo.includes('" onclick'));
  });

  await prueba("sitemap: incluye la página de cada subcategoría", async () => {
    const fuente = crearCatalogoEditable(productos, categorias);
    const r = await crearSitemap(fuente, { dominio: "https://tienda.cl", rutasFijas: [] }).onRequestGet({ env: { REVIEWS_KV: kv() } });
    const xml = await r.text();
    assert.ok(xml.includes("https://tienda.cl/tienda/toallas/microfibra/"));
    assert.ok(xml.includes("https://tienda.cl/tienda/toallas/algodon/"));
    assert.ok(!xml.includes("/tienda/gorros/microfibra/"));
  });

  console.log(`\n${pasaron} pruebas pasaron.`);
}
run().catch((e) => {
  console.error(e);
  process.exit(1);
});
