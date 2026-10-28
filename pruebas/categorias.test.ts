/**
 * Prueba de las categorías editables (nombre, nombre corto, bajada, texto y foto).
 * Se corre con `npm test`.
 */
import assert from "node:assert/strict";
import type { AlmacenKV } from "../core/tipos";
import {
  aplicarCambios,
  categoriasVigentes,
  crearCatalogoEditable,
  limpiarEstructura,
  MAXIMO_NUEVAS,
  limpiarCambios,
  rellenarPlantilla,
  resumenParaGoogle,
  textoPlano,
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

  await prueba("bajada: hasta 40, se limpia, puede quedar vacía a propósito y la del sitio se respeta", () => {
    assert.ok(!validarCambioCategoria({ nombre: "Bien", bajada: "x".repeat(41) }).ok);
    const v = validarCambioCategoria({ nombre: "Scrunchies", bajada: "  Colección\u0000 satín " });
    assert.ok(v.ok && v.datos.bajada === "Colección satín");
    const base = [{ id: "a", nombre: "Scrunchies", bajada: "Colección satín" }, { id: "b", nombre: "Gorros" }];
    assert.equal(aplicarCambios(base, { a: { nombre: "Scrunchies" } })[0].bajada, "Colección satín", "sin tocarla, queda la del sitio");
    assert.equal(aplicarCambios(base, { a: { nombre: "Scrunchies", bajada: "" } })[0].bajada, "", "vaciarla la quita");
    assert.equal(aplicarCambios(base, { b: { nombre: "Gorros", bajada: "de satín" } })[1].bajada, "de satín");
    const limpios = limpiarCambios({ a: { bajada: "x".repeat(80) } }, base);
    assert.equal(limpios.a.bajada?.length, 40);
  });

  await prueba("texto de la categoría (v0.44): párrafos, límite, vacío a propósito y el del sitio se respeta", () => {
    assert.ok(!validarCambioCategoria({ nombre: "Bien", descripcion: "x".repeat(2001) }).ok, "más de 2000 no");
    const v = validarCambioCategoria({ nombre: "Fundas", descripcion: "  Primer párrafo.\r\n\r\n\r\n\r\nSegundo\u0000 párrafo 💗  \n" });
    assert.ok(v.ok);
    assert.equal(v.ok && v.datos.descripcion, "Primer párrafo.\n\nSegundo párrafo 💗", "mantiene párrafos y emojis; quita líneas de más y caracteres raros");
    const sinCampo = validarCambioCategoria({ nombre: "Fundas" });
    assert.ok(sinCampo.ok && !("descripcion" in sinCampo.datos), "si no viene, no se toca");
    const base = [{ id: "a", nombre: "Fundas", descripcion: "Del sitio" }, { id: "b", nombre: "Gorros" }];
    assert.equal(aplicarCambios(base, { a: { nombre: "Fundas" } })[0].descripcion, "Del sitio", "sin tocarlo, queda el del sitio");
    assert.equal(aplicarCambios(base, { a: { nombre: "Fundas", descripcion: "" } })[0].descripcion, "", "vaciarlo lo quita");
    assert.equal(aplicarCambios(base, { b: { nombre: "Gorros", descripcion: "Nuevo" } })[1].descripcion, "Nuevo");
    const limpios = limpiarCambios({ a: { descripcion: "x".repeat(3000) }, b: { descripcion: 5 } }, base);
    assert.equal(limpios.a.descripcion?.length, 2000);
    assert.equal(limpios.b, undefined, "un valor que no es texto se descarta");
  });

  await prueba("resumen para Google: sin emojis ni saltos, corta en una palabra completa", () => {
    assert.equal(resumenParaGoogle(""), "");
    assert.equal(resumenParaGoogle(undefined), "");
    assert.equal(resumenParaGoogle("💗 Funda de satín.\n\nMenos frizz ✨ ."), "Funda de satín. Menos frizz.");
    assert.equal(resumenParaGoogle("Ñandú con tilde: canción"), "Ñandú con tilde: canción", "letras con tilde y ñ intactas");
    const largo = "Nuestras fundas están diseñadas para brindar a tu cabello un cuidado delicado, entregando a tu rutina nocturna suavidad, comodidad y elegancia. Su textura ayuda a reducir la fricción.";
    const r = resumenParaGoogle(largo);
    assert.ok(r.length <= 155, `máximo 155 (${r.length})`);
    assert.ok(r.endsWith("…"));
    assert.ok(largo.startsWith(r.slice(0, -1)), "corta en una palabra completa, sin partirla");
    assert.ok(!/[ ,]…$/.test(r), "sin espacio ni coma antes de los puntos suspensivos");
    assert.equal(textoPlano("a\n\n b 👍🏽  c"), "a b c");
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

  console.log("Categorías nuevas y borradas:");

  await prueba("estructura: ids válidos, sin chocar con el sitio, sin repetir, con tope; ocultas solo del sitio", () => {
    const e = limpiarEstructura(
      {
        nuevas: [
          { id: "accesorios", nombre: "Accesorios", creada: "x" },
          { id: "peluches", nombre: "Choca con el sitio" },
          { id: "accesorios", nombre: "Repetida" },
          { id: "Mal Id", nombre: "Mal" },
          { id: "corto", nombre: "x" },
          ...Array.from({ length: 20 }, (_, i) => ({ id: `extra-${i}`, nombre: `Extra ${i}` })),
        ],
        ocultas: ["flores", "inventada", "flores", 5],
      },
      BASE
    );
    assert.equal(e.nuevas[0].id, "accesorios");
    assert.ok(!e.nuevas.some((n) => n.id === "peluches" || n.id === "corto" || n.id === "Mal Id"));
    assert.equal(e.nuevas.length, MAXIMO_NUEVAS);
    assert.deepEqual(e.ocultas, ["flores"]);
    assert.deepEqual(limpiarEstructura("basura", BASE), { nuevas: [], ocultas: [] });
  });

  await prueba("vigentes: las del sitio sin las borradas, después las nuevas (marcadas), con los cambios encima", () => {
    const v = categoriasVigentes(BASE, { nuevas: [{ id: "accesorios", nombre: "Accesorios", creada: "" }], ocultas: ["flores"] }, { accesorios: { corto: "Acces." } });
    assert.deepEqual(v.map((c) => c.id), ["peluches", "accesorios"]);
    assert.equal(v[1].nueva, true);
    assert.equal(v[1].corto, "Acces.");
  });

  await prueba("un producto puede ir a una categoría nueva; a una borrada no", async () => {
    const { kv } = kvMemoria();
    const env = { REVIEWS_KV: kv };
    const fuente = crearCatalogoEditable(PRODUCTOS, BASE);
    assert.ok(!(await fuente.guardar(env, [...PRODUCTOS, { id: "aros", nombre: "Aros", precio: 1, categoria: "accesorios", tipo: "fisico" }])).ok);
    assert.ok((await fuente.guardarEstructuraCategorias(env, { nuevas: [{ id: "accesorios", nombre: "Accesorios", creada: "" }], ocultas: ["flores"] })).ok);
    assert.equal(await fuente.categoriasEditadas(env), true);
    assert.ok((await fuente.guardar(env, [...PRODUCTOS, { id: "aros", nombre: "Aros", precio: 1, categoria: "accesorios", tipo: "fisico" }])).ok);
    assert.ok(!(await fuente.guardar(env, [...PRODUCTOS, { id: "rosa", nombre: "Rosa", precio: 1, categoria: "flores", tipo: "fisico" }])).ok);
    const c = await fuente.obtener(env);
    assert.deepEqual(c.categorias.map((x) => x.id), ["peluches", "accesorios"]);
    assert.equal(c.deCategoria("accesorios").length, 1);
    // Cambios (nombre corto, foto) también sirven para las nuevas.
    assert.ok((await fuente.guardarCambiosCategorias(env, { accesorios: { nombre: "Accesorios tejidos", imagen: "/media/categoria-accesorios-a1" } })).ok);
    assert.equal((await fuente.obtener(env)).categoria("accesorios")!.nombre, "Accesorios tejidos");
  });

  console.log(`\n${pasaron} pruebas pasaron.`);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
