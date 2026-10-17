/**
 * Prueba del módulo secciones: los campos de la rutina y del mosaico se
 * arman con claves alineadas a sus componentes, pasan la validación del
 * contenido editable y rechazan cantidades absurdas.
 * Se corre con `npm test`.
 */
import assert from "node:assert/strict";
import { camposMosaico, camposRutina, clavesMosaico, clavesRutina } from "../modulos/secciones/index";
import { crearContenidoEditable, type Esquema, type Valores } from "../modulos/contenido/index";
import type { AlmacenKV } from "../core/tipos";

let pasaron = 0;
async function prueba(nombre: string, fn: () => void | Promise<void>) {
  await fn();
  pasaron++;
  console.log("  ok —", nombre);
}
function kvMemoria(): AlmacenKV {
  const d = new Map<string, string>();
  return { get: async (k) => d.get(k) ?? null, put: async (k, v) => void d.set(k, v), delete: async (k) => void d.delete(k), list: async () => ({ keys: [...d.keys()].map((name) => ({ name })) }) };
}

console.log("Secciones:");

await prueba("rutina: claves de los campos = claves que usa el componente", () => {
  const campos = camposRutina({ grupo: "rutina" });
  const k = clavesRutina();
  const claves = campos.map((c) => c.clave);
  for (const clave of [k.antetitulo, k.titulo, k.texto, k.boton, k.nota, ...k.pasos.flatMap((p) => [p.titulo, p.imagen, p.imagenAlt])]) {
    assert.ok(claves.includes(clave), clave);
  }
  assert.equal(new Set(claves).size, claves.length, "sin claves repetidas");
  assert.equal(k.pasos.length, 3);
  assert.equal(campos.filter((c) => c.tipo === "imagen").length, 3);
  assert.ok(campos.every((c) => c.grupo === "rutina"));
});

await prueba("mosaico: claves alineadas, N fotos y frase obligatoria", () => {
  const campos = camposMosaico({ grupo: "mosaico", fotos: 5 });
  const k = clavesMosaico("mosaico", 5);
  assert.equal(k.fotos.length, 5);
  assert.equal(campos.filter((c) => c.tipo === "imagen").length, 5);
  assert.equal(campos.find((c) => c.clave === k.frase)?.opcional, undefined, "la frase no puede quedar vacía");
});

await prueba("prefijos propios: dos rutinas en un mismo sitio no chocan", () => {
  const a = camposRutina({ grupo: "g", prefijo: "rutina" }).map((c) => c.clave);
  const b = camposRutina({ grupo: "g", prefijo: "cuidado", pasos: 2 }).map((c) => c.clave);
  assert.equal(a.filter((x) => b.includes(x)).length, 0);
  assert.ok(b.includes("cuidado.paso.2.imagen") && !b.includes("cuidado.paso.3.imagen"));
});

await prueba("cantidades fuera de rango se rechazan al construir", () => {
  assert.throws(() => camposRutina({ grupo: "g", pasos: 0 }));
  assert.throws(() => camposRutina({ grupo: "g", pasos: 7 }));
  assert.throws(() => camposMosaico({ grupo: "g", fotos: 9 }));
});

await prueba("contenido: valida los iniciales, guarda lo editado y rechaza fotos ajenas o frase vacía", async () => {
  const esquema: Esquema = {
    grupos: [{ id: "rutina", titulo: "Rutina" }, { id: "mosaico", titulo: "Mosaico" }],
    campos: [...camposRutina({ grupo: "rutina" }), ...camposMosaico({ grupo: "mosaico" })],
  };
  const iniciales: Valores = {};
  for (const c of esquema.campos) iniciales[c.clave] = c.tipo === "imagen" ? "/img/inicio/foto.webp" : c.opcional ? "" : "Texto";
  const fuente = crearContenidoEditable(esquema, iniciales);
  const env = { REVIEWS_KV: kvMemoria() };
  assert.ok((await fuente.guardar(env, { "rutina.paso.2.titulo": "Usa el kit de ondas sin calor", "mosaico.frase": "Porque tu cabello\ntambién merece sentirse bien" })).ok);
  const estado = await fuente.obtener(env);
  assert.equal(estado.valores["rutina.paso.2.titulo"], "Usa el kit de ondas sin calor");
  assert.equal(estado.valores["mosaico.frase"], "Porque tu cabello\ntambién merece sentirse bien", "la frase respeta el salto de línea");
  const mala = await fuente.guardar(env, { "mosaico.foto.1.imagen": "https://otro.cl/x.jpg", "mosaico.frase": "  " });
  assert.equal(mala.ok, false);
  assert.ok(mala.errores?.["mosaico.foto.1.imagen"] && mala.errores?.["mosaico.frase"]);
  assert.ok((await fuente.guardar(env, { "rutina.titulo": "x".repeat(61) })).errores?.["rutina.titulo"], "título de hasta 60");
});

console.log(`\n${pasaron} pruebas pasaron.`);
