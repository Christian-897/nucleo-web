/**
 * Prueba de la Ayuda del panel: contenido bien formado y que el buscador
 * encuentre lo que una persona escribiría de verdad. Se corre con `npm test`.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buscarAyuda, normalizarAyuda, SECCIONES_AYUDA, TEMAS_AYUDA } from "../modulos/panel/ayuda";
import { GUIAS_AYUDA } from "../modulos/panel/guias";

let pasaron = 0;
function prueba(nombre: string, fn: () => void) {
  fn();
  pasaron++;
  console.log("  ok —", nombre);
}
const primero = (q: string) => buscarAyuda(TEMAS_AYUDA, q)[0]?.id;
const entre = (q: string, n: number) => buscarAyuda(TEMAS_AYUDA, q).slice(0, n).map((t) => t.id);

console.log("Ayuda del panel:");

prueba("contenido: ids únicos, secciones válidas, sin HTML, negritas cerradas", () => {
  const ids = new Set<string>();
  for (const t of TEMAS_AYUDA) {
    assert.ok(!ids.has(t.id), `id repetido: ${t.id}`);
    ids.add(t.id);
    assert.ok(SECCIONES_AYUDA[t.seccion], `sección: ${t.id}`);
    assert.ok(t.titulo.length > 5 && t.contenido.length > 0, t.id);
    const texto = JSON.stringify(t);
    assert.ok(!/[<>]/.test(texto), `sin HTML: ${t.id}`);
    for (const b of t.contenido) {
      const s = typeof b === "string" ? b : "pasos" in b ? b.pasos.join(" ") : b.nota;
      assert.equal((s.match(/\*\*/g) ?? []).length % 2, 0, `negritas sin cerrar: ${t.id}`);
    }
  }
  assert.ok(TEMAS_AYUDA.length >= 35);
});

prueba("español neutro: sin voseo", () => {
  const texto = JSON.stringify(TEMAS_AYUDA).toLowerCase();
  for (const v of [" vos ", "podés", "tenés", "querés", "mirá", "decime", "andá", "hacé", "tocá", "escribí", "elegí"]) {
    assert.ok(!texto.includes(v), v);
  }
});

prueba("los requiere apuntan a partes que existen en el panel", () => {
  const html = readFileSync(new URL("../modulos/panel/ui-defecto/PanelAdmin.astro", import.meta.url), "utf8");
  for (const t of TEMAS_AYUDA.filter((x) => x.requiere)) {
    const atributo = t.requiere!.match(/\[(data-[a-z-]+)/)![1];
    assert.ok(html.includes(atributo), `${t.id}: ${atributo}`);
  }
});

prueba("normaliza tildes, mayúsculas y signos", () => {
  assert.equal(normalizarAyuda("¿Cómo cambio el PRECIO?"), "como cambio el precio");
});

prueba("encuentra lo que la gente escribe", () => {
  const casos: [string, string][] = [
    ["cambiar precio", "cambiar-precio"],
    ["¿cómo cambio el precio de un producto?", "cambiar-precio"],
    ["agotado", "stock"],
    ["stok", "stock"],
    ["subir producto", "producto-nuevo"],
    ["anular pedido", "anular-pedido"],
    ["devolver plata", "reembolso"],
    ["vacaciones", "cerrar-tienda"],
    ["whatsapp", "contacto-redes"],
    ["contrasena", "cambiar-contrasena"],
    ["olvidé mi contraseña", "olvide-contrasena"],
    ["perdí el celular", "perdi-celular"],
    ["envío gratis", "despacho-gratis"],
    ["retiro", "retiro"],
    ["boletin", "boletin"],
    ["doble factor", "doble-factor"],
    ["me sacó", "sesion-cerrada"],
    ["como saco un producto", "eliminar-producto"],
    ["cambiar foto", "fotos-producto"],
    ["boleta", "boletas"],
    ["voucher", "boletas"],
    ["transferencia boleta", "boletas"],
    ["cupón", "cambiar-precio"],
    ["una tarjeta por color", "colores-vista-tienda"],
    ["usar las fotos preparadas", "fotos-preparadas"],
    ["crear subcategoría", "subcategorias"],
    ["precio por tamaño", "opciones-producto"],
    ["unidades por talla", "opciones-producto"],
    ["toallas de microfibra y algodón", "subcategorias"],
    ["la foto no cambia al elegir color", "fotos-preparadas"],
    ["la categoría se ve vacía", "colores-vista-tienda"],
    ["circulitos de colores", "colores-vista-tienda"],
    ["foto de portada para celular", "portada-celular"],
    ["agregar colores", "colores-producto"],
    ["se acabó un color", "colores-stock"],
    ["acercamiento", "ficha-ajustes"],
    ["ver los colores", "colores-tienda"],
    ["muchos colores", "colores-tienda"],
    ["foto con letras del proveedor", "colores-consejos"],
    ["productos repetidos por color", "colores-consejos"],
    ["quedan pocos", "colores-stock"],
  ];
  for (const [q, id] of casos) assert.ok(entre(q, 2).includes(id), `«${q}» → ${entre(q, 3).join(", ")} (esperaba ${id})`);
  assert.equal(primero("cambiar precio"), "cambiar-precio");
});

prueba("consulta vacía = todos; solo palabras vacías o sin sentido = nada", () => {
  assert.equal(buscarAyuda(TEMAS_AYUDA, "").length, TEMAS_AYUDA.length);
  assert.equal(buscarAyuda(TEMAS_AYUDA, "como de la").length, 0);
  assert.equal(buscarAyuda(TEMAS_AYUDA, "xqzwv").length, 0);
  assert.ok(!entre("factura", 3).includes("doble-factor"), "factura no es doble factor");
  assert.ok(buscarAyuda(TEMAS_AYUDA, "como cambio el precio").length <= 6, "pocas respuestas, no ruido");
});

prueba("guías «Muéstrame cómo»: temas que existen, pestañas válidas, textos limpios y selectores que el panel tiene", () => {
  const ids = new Set(TEMAS_AYUDA.map((t) => t.id));
  const astro = readFileSync(new URL("../modulos/panel/ui-defecto/PanelAdmin.astro", import.meta.url), "utf8");
  const app = readFileSync(new URL("../modulos/panel/ui-defecto/panel-app.ts", import.meta.url), "utf8");
  const pestanas = new Set(Object.values(SECCIONES_AYUDA).map((x) => x.pestana).filter(Boolean));
  const existe = (sel: string) => {
    for (const [, attr, valor] of sel.matchAll(/\[data-([a-z0-9-]+)(?:="([^"]+)")?\]/g)) {
      if (attr === "guia") assert.ok(app.includes(`dataset.guia = "${valor}"`), `data-guia="${valor}" no está en panel-app`);
      else if (attr === "form") assert.ok(astro.includes(`data-form="${valor}"`), `data-form="${valor}"`);
      else assert.ok(astro.includes(`data-${attr}`) || app.includes(`data-${attr}`), `data-${attr} no está en el panel`);
    }
    for (const [, n] of sel.matchAll(/\[name="([a-z]+)"/g)) assert.ok(astro.includes(`name="${n}"`), `name="${n}"`);
  };
  assert.ok(Object.keys(GUIAS_AYUDA).length >= 25, "hay guías para los temas más usados");
  for (const [id, pasos] of Object.entries(GUIAS_AYUDA)) {
    assert.ok(ids.has(id), `guía de un tema que no existe: ${id}`);
    assert.ok(pasos.length > 0, id);
    assert.ok(pasos[0].pestana, `el primer paso abre una pestaña: ${id}`);
    for (const p of pasos) {
      if (p.pestana) assert.ok(pestanas.has(p.pestana), `pestaña ${p.pestana} (${id})`);
      assert.ok(!/[<>]/.test(p.texto) && p.texto.split("**").length % 2 === 1, `texto limpio: ${id}`);
      existe(p.selector);
      if (p.clic) existe(p.clic);
    }
  }
});

console.log(`\n${pasaron} pruebas pasaron.`);
