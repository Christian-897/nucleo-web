/**
 * Prueba del modo "servicios" del panel (v0.49): textos sin «tienda»,
 * ayuda sin temas de tienda y pestañas de tienda escondidas.
 * Se corre con `npm test`.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { TEMAS_AYUDA, temasParaModo, nombreSeccion, SECCIONES_AYUDA, type SeccionAyuda } from "../modulos/panel/ayuda";
import { GUIAS_AYUDA } from "../modulos/panel/guias";
import { leerModo, textoSegunModo, PESTANAS_SOLO_TIENDA } from "../modulos/panel/modo";

let pasaron = 0;
function prueba(nombre: string, fn: () => void) {
  fn();
  pasaron++;
  console.log("  ok —", nombre);
}
const texto = (x: unknown) => JSON.stringify(x);

console.log("Modo del panel:");

prueba("leerModo: solo 'servicios' cambia el modo", () => {
  assert.equal(leerModo("servicios"), "servicios");
  for (const v of [undefined, "", "tienda", "SERVICIOS", 1, null]) assert.equal(leerModo(v), "tienda");
});

prueba("modo tienda: los textos no cambian", () => {
  for (const t of TEMAS_AYUDA) for (const b of t.contenido) {
    const s = typeof b === "string" ? b : "pasos" in b ? b.pasos.join(" ") : b.nota;
    assert.equal(textoSegunModo(s, "tienda"), s);
  }
});

prueba("modo servicios: artículos y género correctos", () => {
  const casos: [string, string][] = [
    ["Tu tienda está abierta ✓", "Tu sitio está abierto ✓"],
    ["Ver tienda", "Ver sitio"],
    ["Estado de la tienda", "Estado del sitio"],
    ["Abrir la tienda al público", "Abrir el sitio al público"],
    ["Listo: tienda abierta.", "Listo: sitio abierto."],
    ["Mientras está cerrada, una banda amarilla", "Mientras está cerrado, una banda amarilla"],
    ["Los clientes no pueden ver productos ni comprar.", "las visitas solo ven el aviso."],
    ["Agregar al carrito", "Cotizar"],
    ["por ejemplo, tutienda.cl/admin", "por ejemplo, tusitio.cl/admin"],
  ];
  for (const [de, a] of casos) assert.equal(textoSegunModo(de, "servicios"), a, de);
});

prueba("ayuda en modo tienda: los mismos temas de siempre, menos los de servicios", () => {
  const tienda = temasParaModo(TEMAS_AYUDA, "tienda");
  assert.equal(tienda.length, TEMAS_AYUDA.filter((t) => t.modo !== "servicios").length);
  assert.ok(tienda.every((t) => TEMAS_AYUDA.includes(t)), "en modo tienda no se copia ni cambia ningún tema");
  assert.ok(!tienda.some((t) => t.id.endsWith("-servicios")));
});

prueba("ayuda en modo servicios: sin temas de tienda ni la palabra «tienda»", () => {
  const serv = temasParaModo(TEMAS_AYUDA, "servicios");
  const soloTienda = new Set<SeccionAyuda>(["productos", "categorias", "pedidos", "despacho", "suscriptores"]);
  assert.ok(serv.length >= 20);
  for (const t of serv) {
    assert.ok(!soloTienda.has(t.seccion), `sección de tienda: ${t.id}`);
    assert.notEqual(t.modo, "tienda", t.id);
    assert.ok(!/tienda/i.test(t.titulo + texto(t.contenido)), `dice «tienda»: ${t.id}`);
    assert.ok(!/carrito/i.test(t.titulo + texto(t.contenido)), `dice «carrito»: ${t.id}`);
  }
  for (const id of ["resumen-servicios", "visitas-servicios", "medicion-servicios", "cerrar-tienda", "abrir-tienda", "mensajes", "textos"])
    assert.ok(serv.some((t) => t.id === id), `falta: ${id}`);
  for (const id of ["resumen", "visitas", "boletas", "producto-nuevo"]) assert.ok(!serv.some((t) => t.id === id), `sobra: ${id}`);
});

prueba("«Muéstrame cómo» en modo servicios: los pasos tampoco dicen «tienda»", () => {
  const serv = temasParaModo(TEMAS_AYUDA, "servicios");
  for (const t of serv) for (const paso of GUIAS_AYUDA[t.id] ?? []) {
    assert.ok(!/tienda/i.test(textoSegunModo(paso.texto, "servicios")), `guía ${t.id}`);
    assert.ok(!paso.pestana || !(PESTANAS_SOLO_TIENDA as readonly string[]).includes(paso.pestana), `la guía ${t.id} lleva a una pestaña de tienda`);
  }
});

prueba("nombres de sección en modo servicios", () => {
  assert.equal(nombreSeccion("resumen", "servicios"), "Resumen y estado del sitio");
  assert.equal(nombreSeccion("resumen", "tienda"), SECCIONES_AYUDA.resumen.nombre);
});

prueba("PanelAdmin: las pestañas y bloques de tienda se esconden en modo servicios", () => {
  const astro = readFileSync(new URL("../modulos/panel/ui-defecto/PanelAdmin.astro", import.meta.url), "utf8");
  assert.match(astro, /modo = "tienda"/, "por defecto sigue siendo una tienda");
  assert.match(astro, /data-modo=\{modo\}/);
  for (const p of PESTANAS_SOLO_TIENDA) assert.match(astro, new RegExp(`data-tab="${p}" hidden=\\{servicios\\}`), p);
  assert.match(astro, /<div class="pa-kpis" hidden=\{servicios\}>/, "ventas del resumen");
  assert.match(astro, /<div data-solo-tienda hidden=\{servicios\}>/, "explorar ventas");
  const app = readFileSync(new URL("../modulos/panel/ui-defecto/panel-app.ts", import.meta.url), "utf8");
  assert.match(app, /if \(MODO === "servicios"\) return void cargarVisitas\(\);/, "el resumen no pide ventas");
  assert.match(app, /PESTANAS_SOLO_TIENDA as readonly string\[\]\)\.includes\(v\)\) v = "resumen"/, "no se abren pestañas de tienda");
});

console.log(`\n${pasaron} pruebas pasaron.`);
