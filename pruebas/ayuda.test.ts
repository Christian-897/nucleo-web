/**
 * Prueba de la Ayuda del panel: contenido bien formado y que el buscador
 * encuentre lo que una persona escribiría de verdad. Se corre con `npm test`.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buscarAyuda, normalizarAyuda, SECCIONES_AYUDA, TEMAS_AYUDA } from "../modulos/panel/ayuda";

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

console.log(`\n${pasaron} pruebas pasaron.`);
