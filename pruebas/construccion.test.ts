/**
 * Prueba del aviso de construcción: intenta saltárselo. Se corre con `npm test`.
 */
import assert from "node:assert/strict";
import { crearAvisoConstruccion, firmaAcceso } from "../modulos/construccion/index";
import { paginaConstruccion } from "../modulos/construccion/plantilla";
import type { EnvConstruccion } from "../modulos/construccion/config";

let pasaron = 0;
async function prueba(nombre: string, fn: () => Promise<void> | void) {
  await fn();
  pasaron++;
  console.log("  ok —", nombre);
}

const CLAVE = "clave-previa-de-prueba-123";
const aviso = crearAvisoConstruccion({
  nombreSitio: "Tienda <b>Prueba</b>",
  logo: "/img/logo.png",
  contactos: [
    { etiqueta: "Instagram", url: "https://instagram.com/tienda" },
    { etiqueta: "Malo", url: "javascript:alert(1)" },
  ],
});

let llamadasNext = 0;
const siguiente = async () => {
  llamadasNext++;
  return new Response("SITIO REAL", { status: 200, headers: { "Cache-Control": "public, max-age=60" } });
};
const pedir = (ruta: string, env: EnvConstruccion, cookie?: string) =>
  aviso.onRequest({
    request: new Request("https://tienda.cl" + ruta, { headers: cookie ? { Cookie: cookie } : {} }),
    env,
    next: siguiente,
  });
const encendido: EnvConstruccion = { CONSTRUCCION: "1", ACCESO_PREVIA: CLAVE };

async function run() {
  console.log("Construcción:");

  await prueba("apagado: el sitio funciona normal", async () => {
    const r = await pedir("/", { ACCESO_PREVIA: CLAVE });
    assert.equal(await r.text(), "SITIO REAL");
  });

  await prueba("encendido: el público ve el aviso con 503 y noindex", async () => {
    const r = await pedir("/tienda/", encendido);
    assert.equal(r.status, 503);
    assert.equal(r.headers.get("X-Robots-Tag"), "noindex");
    assert.ok(r.headers.get("Retry-After"));
    assert.match(await r.text(), /Sitio en construcción/);
  });

  await prueba("los enlaces del correo del newsletter pasan; suscribirse no", async () => {
    for (const ruta of ["/newsletter/confirmar?e=x&v=1&t=y", "/newsletter/baja/", "/api/newsletter/confirmar", "/api/newsletter/baja"]) {
      assert.equal(await (await pedir(ruta, encendido)).text(), "SITIO REAL", ruta);
    }
    assert.equal((await pedir("/api/newsletter/suscribir", encendido)).status, 503);
  });

  await prueba("también bloquea la API (no se puede comprar a escondidas)", async () => {
    const r = await pedir("/api/pago/iniciar", encendido);
    assert.equal(r.status, 503);
  });

  await prueba("los webhooks de pago, el retorno de Flow, robots.txt y el logo pasan siempre", async () => {
    for (const ruta of ["/api/pago/webhook-mercadopago", "/api/pago/retorno-flow", "/robots.txt", "/img/logo.png"]) {
      const r = await pedir(ruta, encendido);
      assert.equal(await r.text(), "SITIO REAL", ruta);
    }
  });

  await prueba("enlace con la clave correcta: redirige sin la clave y deja una cookie con la FIRMA", async () => {
    const r = await pedir(`/tienda/?previa=${CLAVE}&x=1`, encendido);
    assert.equal(r.status, 303);
    assert.equal(r.headers.get("Location"), "/tienda/?x=1");
    const cookie = r.headers.get("Set-Cookie")!;
    assert.ok(!cookie.includes(CLAVE), "la clave no puede ir en la cookie");
    assert.match(cookie, /HttpOnly/);
    assert.match(cookie, /Secure/);
    assert.match(cookie, /^__Host-previa=/);
  });

  await prueba("con la cookie válida se ve el sitio real, sin caché ni indexación", async () => {
    const firma = await firmaAcceso(CLAVE);
    const r = await pedir("/", encendido, `__Host-previa=${firma}`);
    assert.equal(await r.text(), "SITIO REAL");
    assert.equal(r.headers.get("X-Robots-Tag"), "noindex");
    assert.equal(r.headers.get("Cache-Control"), "private, no-store");
  });

  await prueba("clave equivocada o cookie falsa: aviso, sin pistas", async () => {
    assert.equal((await pedir("/?previa=adivinando", encendido)).status, 503);
    assert.equal((await pedir("/", encendido, "__Host-previa=" + "0".repeat(64))).status, 503);
    assert.equal((await pedir("/", encendido, `__Host-previa=${CLAVE}`)).status, 503);
  });

  await prueba("cambiar la clave invalida los accesos ya entregados", async () => {
    const firmaVieja = await firmaAcceso(CLAVE);
    const r = await pedir("/", { CONSTRUCCION: "1", ACCESO_PREVIA: "otra-clave-nueva-456789" }, `__Host-previa=${firmaVieja}`);
    assert.equal(r.status, 503);
  });

  await prueba("sin ACCESO_PREVIA (o muy corta) nadie entra, ni con la clave corta", async () => {
    assert.equal((await pedir("/?previa=corta", { CONSTRUCCION: "1", ACCESO_PREVIA: "corta" })).status, 503);
    assert.equal((await pedir("/", { CONSTRUCCION: "1" })).status, 503);
  });

  await prueba("?previa=salir borra la cookie", async () => {
    const r = await pedir("/?previa=salir", encendido);
    assert.equal(r.status, 303);
    assert.match(r.headers.get("Set-Cookie")!, /Max-Age=0/);
  });

  await prueba("la página escapa el nombre y descarta enlaces peligrosos", () => {
    const html = paginaConstruccion({ nombreSitio: 'X"><script>alert(1)</script>', contactos: [{ etiqueta: "a", url: "javascript:alert(1)" }], colores: { acento: "red;}</style><script>" } });
    assert.ok(!html.includes("<script>"));
    assert.ok(!html.includes("javascript:"));
  });

  await prueba("la variable acepta '1' con espacios pegados del panel", async () => {
    const r = await pedir("/", { CONSTRUCCION: " 1\n", ACCESO_PREVIA: CLAVE });
    assert.equal(r.status, 503);
  });

  console.log(`\n${pasaron} pruebas pasaron.`);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
