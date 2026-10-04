/**
 * Prueba del módulo contacto: números, WhatsApp, correo y redes. Lo
 * importante: nada que no sea un enlace válido de la red correcta llega
 * al sitio (ni javascript:, ni dominios falsos, ni marcadores vacíos).
 */
import assert from "node:assert/strict";
import {
  normalizarTelefono,
  formatearTelefono,
  enlaceWhatsapp,
  enlaceCorreo,
  urlRed,
  enlacesContacto,
} from "../modulos/contacto/index";

let pasaron = 0;
function prueba(nombre: string, fn: () => void) {
  fn();
  pasaron++;
  console.log("  ok —", nombre);
}

console.log("Contacto:");

prueba("normaliza números chilenos en distintos formatos", () => {
  for (const n of ["+56 9 1234 5678", "+56912345678", "912345678", "9 1234 5678", "0056912345678", "(+56) 9-1234-5678"]) {
    assert.equal(normalizarTelefono(n), "56912345678", n);
  }
  assert.equal(normalizarTelefono("221234567"), "56221234567");
});

prueba("descarta números inválidos", () => {
  for (const n of ["", "123", "abc", "1234567890123456", undefined]) {
    assert.equal(normalizarTelefono(n as string), "", String(n));
  }
});

prueba("formatea para mostrar", () => {
  assert.equal(formatearTelefono("56912345678"), "+56 9 1234 5678");
  assert.equal(formatearTelefono("56221234567"), "+56 2 2123 4567");
  assert.equal(formatearTelefono("5491112345678"), "+5491112345678");
});

prueba("enlace de WhatsApp con mensaje codificado", () => {
  assert.equal(enlaceWhatsapp("+56 9 1234 5678", "Hola & chao"), "https://wa.me/56912345678?text=Hola%20%26%20chao");
  assert.equal(enlaceWhatsapp("+56 9 1234 5678"), "https://wa.me/56912345678");
  assert.equal(enlaceWhatsapp("xx"), "");
});

prueba("correo válido o nada", () => {
  assert.equal(enlaceCorreo("hola@tienda.cl"), "mailto:hola@tienda.cl");
  assert.equal(enlaceCorreo("hola@tienda"), "");
  assert.equal(enlaceCorreo("a@b.cl?bcc=otro@x.cl"), "");
  assert.equal(enlaceCorreo("<script>@x.cl"), "");
});

prueba("redes: acepta enlace o @usuario", () => {
  assert.equal(urlRed("instagram", "@mitienda"), "https://www.instagram.com/mitienda");
  assert.equal(urlRed("instagram", "https://instagram.com/mitienda/"), "https://instagram.com/mitienda/");
  assert.equal(urlRed("tiktok", "mitienda"), "https://www.tiktok.com/@mitienda");
});

prueba("redes: rechaza marcadores, otros dominios y protocolos peligrosos", () => {
  assert.equal(urlRed("instagram", "https://www.instagram.com/"), "");
  assert.equal(urlRed("instagram", "https://instagram.com.malo.cl/x"), "");
  assert.equal(urlRed("instagram", "https://facebook.com/x"), "");
  assert.equal(urlRed("instagram", "http://instagram.com/x"), "");
  assert.equal(urlRed("instagram", "javascript:alert(1)"), "");
  assert.equal(urlRed("instagram", "https://user:pass@instagram.com/x"), "");
});

prueba("enlacesContacto arma solo lo válido, en orden", () => {
  const r = enlacesContacto({
    whatsapp: "+56 9 1234 5678",
    mensajeWhatsapp: "Hola",
    email: "hola@tienda.cl",
    redes: { facebook: "https://www.facebook.com/", instagram: "@tienda", tiktok: "" },
  });
  assert.equal(r.whatsapp?.texto, "+56 9 1234 5678");
  assert.equal(r.whatsapp?.url, "https://wa.me/56912345678?text=Hola");
  assert.equal(r.telefono, null);
  assert.equal(r.correo?.url, "mailto:hola@tienda.cl");
  assert.deepEqual(r.redes.map((e) => e.id), ["instagram"]);
  assert.equal(r.redes[0].texto, "@tienda");
  assert.deepEqual(r.todos.map((e) => e.id), ["whatsapp", "correo", "instagram"]);
});

console.log(`\n${pasaron} pruebas pasaron.`);
