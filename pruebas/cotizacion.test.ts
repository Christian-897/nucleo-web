/**
 * Prueba mínima del motor de cotización, sin levantar un sitio completo:
 * valida el esquema y comprueba que la plantilla de correo escapa el texto
 * del usuario. Se corre con `npm test` (usa tsx).
 */
import assert from "node:assert/strict";
import { crearEsquemaCotizacion } from "../modulos/cotizacion/esquema";
import {
  asuntoSolicitud,
  cuerpoSolicitud,
} from "../modulos/cotizacion/plantilla-correo";

let pasaron = 0;
function prueba(nombre: string, fn: () => void) {
  fn();
  pasaron++;
  console.log("  ok —", nombre);
}

const categorias = [
  { id: "cocinas", label: "Cocinas" },
  { id: "closets", label: "Closets" },
];
const esquema = crearEsquemaCotizacion(categorias);
const nombresCategoria = { cocinas: "Cocinas", closets: "Closets" };

console.log("Esquema:");

prueba("acepta una cotización válida", () => {
  const r = esquema.safeParse({
    nombre: "Juan Pérez",
    email: "juan@example.com",
    telefono: "+56 9 1234 5678",
    categoria: "cocinas",
    descripcion: "Quiero una cocina a medida para un espacio de 3 metros.",
    aceptaPolitica: true,
    turnstileToken: "token-de-prueba",
  });
  assert.equal(r.success, true);
});

prueba("rechaza descripción muy corta y categoría inválida", () => {
  const r = esquema.safeParse({
    nombre: "Ana",
    email: "ana@example.com",
    categoria: "autos", // no está en la lista
    descripcion: "corta",
    aceptaPolitica: true,
    turnstileToken: "token",
  });
  assert.equal(r.success, false);
  if (!r.success) {
    const errores = r.error.flatten().fieldErrors;
    assert.ok(errores.categoria, "debe marcar categoría");
    assert.ok(errores.descripcion, "debe marcar descripción");
  }
});

prueba("exige aceptar la política", () => {
  const r = esquema.safeParse({
    nombre: "Ana",
    email: "ana@example.com",
    categoria: "cocinas",
    descripcion: "Una descripción suficientemente larga para pasar.",
    aceptaPolitica: false,
    turnstileToken: "token",
  });
  assert.equal(r.success, false);
});

prueba("teléfono vacío es válido (campo opcional)", () => {
  const r = esquema.safeParse({
    nombre: "Ana",
    email: "ana@example.com",
    telefono: "",
    categoria: "closets",
    descripcion: "Una descripción suficientemente larga para pasar.",
    aceptaPolitica: true,
    turnstileToken: "token",
  });
  assert.equal(r.success, true);
});

console.log("Plantilla de correo:");

prueba("escapa HTML malicioso en el nombre", () => {
  const html = cuerpoSolicitud(
    {
      nombre: '<script>alert(1)</script>',
      email: "x@example.com",
      categoria: "cocinas",
      descripcion: "Texto de la solicitud con largo suficiente.",
    },
    {
      nombreSitio: "Mi Taller",
      urlPanel: "https://ejemplo.cl/admin/",
      nombresCategoria,
    }
  );
  assert.ok(!html.includes("<script>alert(1)</script>"), "no debe quedar el <script> crudo");
  assert.ok(html.includes("&lt;script&gt;"), "debe quedar escapado");
});

prueba("el asunto incluye sitio, nombre y categoría", () => {
  const asunto = asuntoSolicitud(
    {
      nombre: "Juan Pérez",
      email: "x@example.com",
      categoria: "cocinas",
      descripcion: "x",
    },
    { nombreSitio: "Mi Taller", nombresCategoria }
  );
  assert.ok(asunto.includes("Mi Taller"));
  assert.ok(asunto.includes("Juan"));
  assert.ok(asunto.includes("Cocinas"));
});

console.log(`\n${pasaron} pruebas pasaron.`);
