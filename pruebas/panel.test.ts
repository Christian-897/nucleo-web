/**
 * Prueba del panel: intenta romperlo. KV en memoria (con archivos).
 * Se corre con `npm test`.
 */
import assert from "node:assert/strict";
import type { AlmacenBinario } from "../core/tipos";
import { crearPanel } from "../modulos/panel/index";
import type { EnvPanel } from "../modulos/panel/config";
import { obtenerUsuario } from "../modulos/panel/auth";
import { codigoPara, descifrarSecreto, PERIODO } from "../modulos/panel/totp";
import { crearCatalogoEditable, productoDisponible, registrarVenta } from "../modulos/catalogo/index";
import { validarCarrito } from "../modulos/carrito/servidor";
import { fuenteCarrito } from "../modulos/catalogo/stock";
import { tipoRealDeImagen } from "../modulos/panel/imagenes";
import { ayudaVendidos, textoStock } from "../modulos/panel/texto-stock";
import { diaLocal } from "../modulos/metricas/index";
import { crearCarruselEditable } from "../modulos/carrusel/index";
const r0Dia = () => diaLocal(new Date());

let pasaron = 0;
async function prueba(nombre: string, fn: () => Promise<void> | void) {
  await fn();
  pasaron++;
  console.log("  ok —", nombre);
}

function kvMemoria() {
  const datos = new Map<string, { v: string | ArrayBuffer; meta?: unknown }>();
  const kv: AlmacenBinario = {
    async get(k) {
      const x = datos.get(k)?.v;
      return typeof x === "string" ? x : x ? "[binario]" : null;
    },
    async put(k, v, o) {
      datos.set(k, { v, meta: o?.metadata });
    },
    async delete(k) {
      datos.delete(k);
    },
    async list(o) {
      return { keys: [...datos.keys()].filter((k) => k.startsWith(o?.prefix ?? "")).map((name) => ({ name })) };
    },
    async getWithMetadata(k) {
      const x = datos.get(k);
      return { value: x && typeof x.v !== "string" ? x.v : null, metadata: x?.meta ?? null };
    },
  };
  return { kv, datos };
}

const TOKEN = "instalar-0123456789";
const PEPPER = "pepper-de-prueba-0123456789abcdef";
const D1 = "a".repeat(64); // "derivado" de la contraseña (lo calcula el navegador)
const D2 = "b".repeat(64);

const catalogo = crearCatalogoEditable(
  [
    { id: "gatito", nombre: "Gatito", precio: 18000, stock: 3, categoria: "peluches", tipo: "fisico", imagen: "/img/productos/gatito.webp" },
    { id: "curso", nombre: "Curso", precio: 15000, categoria: "cursos", tipo: "digital" },
  ],
  [
    { id: "peluches", nombre: "Peluches" },
    { id: "cursos", nombre: "Cursos" },
  ]
);
const portada = crearCarruselEditable({
  diapositivas: [
    { id: "uno", imagen: "/img/portada/uno.webp", imagenAlt: "Foto uno", titulo: "Uno" },
    { id: "dos", imagen: "/img/portada/dos.webp", imagenAlt: "Foto dos", titulo: "Dos" },
  ],
});
const panel = crearPanel({ nombreSitio: "Tienda Prueba", catalogo, carrusel: portada });

function entorno(): { env: EnvPanel; datos: ReturnType<typeof kvMemoria>["datos"] } {
  const { kv, datos } = kvMemoria();
  return { env: { REVIEWS_KV: kv, ADMIN_PEPPER: PEPPER, ADMIN_SETUP_TOKEN: TOKEN + "\n" }, datos };
}

let ipN = 0;
function req(ruta: string, opciones: { metodo?: string; cuerpo?: unknown; cookie?: string; origen?: string; form?: FormData } = {}) {
  const h: Record<string, string> = { Origin: opciones.origen ?? "https://tienda.cl", "CF-Connecting-IP": `10.0.0.${++ipN % 250}` };
  if (opciones.cookie) h.Cookie = opciones.cookie;
  let body: BodyInit | undefined;
  if (opciones.form) body = opciones.form;
  else if (opciones.cuerpo !== undefined) {
    h["Content-Type"] = "application/json";
    body = JSON.stringify(opciones.cuerpo);
  }
  return new Request("https://tienda.cl" + ruta, { method: opciones.metodo ?? (body ? "POST" : "GET"), headers: h, body });
}
const json = async (r: Response) => (await r.json()) as Record<string, any>;
const cookieDe = (r: Response, nombre: string) => {
  const todas = r.headers.getSetCookie ? r.headers.getSetCookie() : [r.headers.get("Set-Cookie") ?? ""];
  const c = todas.find((x) => x.startsWith(nombre + "="));
  return c ? c.split(";")[0] : "";
};

async function instalarYEntrar(env: EnvPanel) {
  await panel.instalar.onRequestPost({ env, request: req("/api/admin/instalar", { cuerpo: { usuario: "sasha", derivado: D1, claveInstalacion: TOKEN } }) });
  const r = await panel.entrar.onRequestPost({ env, request: req("/api/admin/entrar", { cuerpo: { usuario: "sasha", derivado: D1 } }) });
  return cookieDe(r, "mc_sesion");
}

/** PNG mínimo válido de w×h (solo cabecera; basta para la validación). */
function png(w: number, h: number): Uint8Array {
  const b = new Uint8Array(64);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  new DataView(b.buffer).setUint32(16, w);
  new DataView(b.buffer).setUint32(20, h);
  return b;
}
function formFoto(id: string, bytes: Uint8Array, nombre = "foto.png", tipo = "image/png") {
  const f = new FormData();
  f.set("id", id);
  f.set("archivo", new File([bytes], nombre, { type: tipo }));
  return f;
}

async function run() {
  console.log("Panel — acceso:");

  await prueba("TOTP calza con el vector oficial del RFC 6238", async () => {
    const secreto = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ"; // "12345678901234567890"
    assert.equal(await codigoPara(secreto, Math.floor(59 / PERIODO)), "287082");
  });

  await prueba("instalación: clave equivocada 401, buena crea el usuario (tolera el salto de línea pegado)", async () => {
    const { env } = entorno();
    const malo = await panel.instalar.onRequestPost({ env, request: req("/x", { cuerpo: { usuario: "sasha", derivado: D1, claveInstalacion: "otra" } }) });
    assert.equal(malo.status, 401);
    const bueno = await panel.instalar.onRequestPost({ env, request: req("/x", { cuerpo: { usuario: "sasha", derivado: D1, claveInstalacion: TOKEN } }) });
    assert.equal(bueno.status, 200);
    const otraVez = await panel.instalar.onRequestPost({ env, request: req("/x", { cuerpo: { usuario: "otro", derivado: D2, claveInstalacion: TOKEN } }) });
    assert.equal(otraVez.status, 409, "no se puede crear un segundo usuario ni pisar el primero");
  });

  await prueba("la contraseña nunca se guarda: solo un HMAC con el pepper", async () => {
    const { env, datos } = entorno();
    await instalarYEntrar(env);
    const guardado = String(datos.get("admin:usuario")?.v);
    assert.ok(!guardado.includes(D1));
  });

  await prueba("entrar: mismo mensaje para usuario o contraseña incorrectos; cookie HttpOnly+Secure+Strict", async () => {
    const { env } = entorno();
    await instalarYEntrar(env);
    const a = await json(await panel.entrar.onRequestPost({ env, request: req("/x", { cuerpo: { usuario: "nadie", derivado: D1 } }) }));
    const b = await json(await panel.entrar.onRequestPost({ env, request: req("/x", { cuerpo: { usuario: "sasha", derivado: D2 } }) }));
    assert.deepEqual(a, b);
    const ok = await panel.entrar.onRequestPost({ env, request: req("/x", { cuerpo: { usuario: "sasha", derivado: D1 } }) });
    const c = ok.headers.get("Set-Cookie")!;
    assert.match(c, /HttpOnly/);
    assert.match(c, /Secure/);
    assert.match(c, /SameSite=Strict/);
  });

  await prueba("tope de intentos: el 9° intento seguido desde la misma IP se frena", async () => {
    const { env } = entorno();
    await instalarYEntrar(env);
    let ultimo = 0;
    for (let i = 0; i < 9; i++) {
      const r = new Request("https://tienda.cl/x", { method: "POST", headers: { Origin: "https://tienda.cl", "CF-Connecting-IP": "9.9.9.9", "Content-Type": "application/json" }, body: JSON.stringify({ usuario: "sasha", derivado: D2 }) });
      ultimo = (await panel.entrar.onRequestPost({ env, request: r })).status;
    }
    assert.equal(ultimo, 429);
  });

  await prueba("una cookie inventada o vieja no da acceso", async () => {
    const { env } = entorno();
    const cookie = await instalarYEntrar(env);
    assert.equal((await panel.sesion.onRequestGet({ env, request: req("/x", { cookie: "mc_sesion=" + "f".repeat(64) }) })).status, 401);
    await panel.salir.onRequestPost({ env, request: req("/x", { metodo: "POST", cookie }) });
    assert.equal((await panel.sesion.onRequestGet({ env, request: req("/x", { cookie }) })).status, 401, "tras salir, la sesión muere en el servidor");
  });

  console.log("Panel — doble factor:");

  await prueba("con doble factor, la contraseña sola no entrega el panel", async () => {
    const { env } = entorno();
    const cookie = await instalarYEntrar(env);
    const prop = await json(await panel.seguridad.onRequestPost({ env, request: req("/x", { cookie, cuerpo: { accion: "proponer" } }) }));
    assert.ok(String(prop.qr).startsWith("<svg"));
    const reg = await obtenerUsuario(env);
    const secreto = (await descifrarSecreto(reg!.propuesta!.secreto, PEPPER))!;
    const periodo = Math.floor(Date.now() / 1000 / PERIODO);
    const act = await json(await panel.seguridad.onRequestPost({ env, request: req("/x", { cookie, cuerpo: { accion: "activar", codigo: await codigoPara(secreto, periodo) } }) }));
    assert.equal(act.respaldos.length, 8);

    const paso1 = await panel.entrar.onRequestPost({ env, request: req("/x", { cuerpo: { usuario: "sasha", derivado: D1 } }) });
    assert.equal((await json(paso1)).segundoFactor, true);
    assert.equal(cookieDe(paso1, "mc_sesion"), "", "sin sesión todavía");
    const paso2 = cookieDe(paso1, "mc_paso2");
    // La cookie del paso intermedio no sirve como sesión.
    assert.equal((await panel.productos.onRequestGet({ env, request: req("/x", { cookie: "mc_sesion=" + paso2.split("=")[1] }) })).status, 401);

    const malo = await panel.segundoFactor.onRequestPost({ env, request: req("/x", { cookie: paso2, cuerpo: { codigo: "000000" } }) });
    assert.equal(malo.status, 401);
    const bueno = await panel.segundoFactor.onRequestPost({ env, request: req("/x", { cookie: paso2, cuerpo: { codigo: await codigoPara(secreto, periodo + 1) } }) });
    assert.equal(bueno.status, 200);
    assert.ok(cookieDe(bueno, "mc_sesion"));

    // El mismo código no sirve dos veces.
    const p1b = await panel.entrar.onRequestPost({ env, request: req("/x", { cuerpo: { usuario: "sasha", derivado: D1 } }) });
    const repetido = await panel.segundoFactor.onRequestPost({ env, request: req("/x", { cookie: cookieDe(p1b, "mc_paso2"), cuerpo: { codigo: await codigoPara(secreto, periodo + 1) } }) });
    assert.equal(repetido.status, 401);

    // Un código de respaldo sirve UNA vez.
    const respaldo = act.respaldos[0];
    const p1c = await panel.entrar.onRequestPost({ env, request: req("/x", { cuerpo: { usuario: "sasha", derivado: D1 } }) });
    assert.equal((await panel.segundoFactor.onRequestPost({ env, request: req("/x", { cookie: cookieDe(p1c, "mc_paso2"), cuerpo: { codigo: respaldo } }) })).status, 200);
    const p1d = await panel.entrar.onRequestPost({ env, request: req("/x", { cuerpo: { usuario: "sasha", derivado: D1 } }) });
    assert.equal((await panel.segundoFactor.onRequestPost({ env, request: req("/x", { cookie: cookieDe(p1d, "mc_paso2"), cuerpo: { codigo: respaldo } }) })).status, 401);
  });

  await prueba("cambiar la contraseña exige la actual y cierra las otras sesiones", async () => {
    const { env } = entorno();
    const c1 = await instalarYEntrar(env);
    const r2 = await panel.entrar.onRequestPost({ env, request: req("/x", { cuerpo: { usuario: "sasha", derivado: D1 } }) });
    const c2 = cookieDe(r2, "mc_sesion");
    const mal = await panel.seguridad.onRequestPost({ env, request: req("/x", { cookie: c1, cuerpo: { accion: "cambiar-clave", derivadoActual: D2, derivadoNuevo: D2 } }) });
    assert.equal(mal.status, 400);
    const bien = await panel.seguridad.onRequestPost({ env, request: req("/x", { cookie: c1, cuerpo: { accion: "cambiar-clave", derivadoActual: D1, derivadoNuevo: D2 } }) });
    assert.equal(bien.status, 200);
    assert.equal((await panel.sesion.onRequestGet({ env, request: req("/x", { cookie: c2 }) })).status, 401);
    assert.equal((await panel.sesion.onRequestGet({ env, request: req("/x", { cookie: c1 }) })).status, 200);
  });

  console.log("Panel — productos:");

  await prueba("sin sesión no se ve ni se cambia nada; desde otro sitio tampoco, aunque haya cookie", async () => {
    const { env } = entorno();
    const cookie = await instalarYEntrar(env);
    assert.equal((await panel.productos.onRequestGet({ env, request: req("/x") })).status, 401);
    const csrf = await panel.productos.onRequestPost({ env, request: req("/x", { cookie, origen: "https://malo.com", cuerpo: { accion: "eliminar", id: "gatito" } }) });
    assert.equal(csrf.status, 403);
  });

  await prueba("crear producto: id desde el nombre, sin tildes ni repetidos", async () => {
    const { env } = entorno();
    const cookie = await instalarYEntrar(env);
    const base = { precio: 9990, disponible: 4, categoria: "peluches", tipo: "fisico", descripcion: "", destacado: false };
    const a = await json(await panel.productos.onRequestPost({ env, request: req("/x", { cookie, cuerpo: { accion: "guardar", producto: { ...base, nombre: "Pingüino Ñandú" } } }) }));
    assert.equal(a.producto.id, "pinguino-nandu");
    const b = await json(await panel.productos.onRequestPost({ env, request: req("/x", { cookie, cuerpo: { accion: "guardar", producto: { ...base, nombre: "Pingüino ñandú" } } }) }));
    assert.equal(b.producto.id, "pinguino-nandu-2");
  });

  await prueba("rechaza precio con decimales, categoría inventada y nombre vacío, con errores por campo", async () => {
    const { env } = entorno();
    const cookie = await instalarYEntrar(env);
    const r = await panel.productos.onRequestPost({ env, request: req("/x", { cookie, cuerpo: { accion: "guardar", producto: { nombre: "", precio: 10.5, categoria: "armas", tipo: "x" } } }) });
    assert.equal(r.status, 400);
    const e = (await json(r)).errores;
    assert.ok(e.nombre && e.precio && e.categoria && e.tipo);
  });

  await prueba("el precio editado en el panel es el que se cobra", async () => {
    const { env } = entorno();
    const cookie = await instalarYEntrar(env);
    await panel.productos.onRequestPost({ env, request: req("/x", { cookie, cuerpo: { accion: "guardar", producto: { id: "gatito", nombre: "Gatito", precio: 21000, disponible: 3, categoria: "peluches", tipo: "fisico" } } }) });
    const carrito = await validarCarrito([{ productoId: "gatito", cantidad: 1 }], fuenteCarrito(catalogo)(env));
    assert.equal(carrito.total, 21000);
  });

  await prueba("stock: editarlo repone; no tocarlo mantiene el descuento de las ventas", async () => {
    const { env } = entorno();
    const cookie = await instalarYEntrar(env);
    await registrarVenta(catalogo, env, [{ productoId: "gatito", cantidad: 2 }]);
    assert.equal((await productoDisponible(catalogo, env, "gatito"))!.stock, 1);
    const guardar = (disponible: number) =>
      panel.productos.onRequestPost({ env, request: req("/x", { cookie, cuerpo: { accion: "guardar", producto: { id: "gatito", nombre: "Gatito nuevo", precio: 18000, disponible, categoria: "peluches", tipo: "fisico" } } }) });
    await guardar(1); // mismo disponible: solo cambia el nombre
    assert.equal((await productoDisponible(catalogo, env, "gatito"))!.stock, 1);
    await guardar(10); // repone
    assert.equal((await productoDisponible(catalogo, env, "gatito"))!.stock, 10);
  });

  await prueba("la lista del panel trae disponibles y vendidos después de una venta", async () => {
    const { env } = entorno();
    const cookie = await instalarYEntrar(env);
    const antes = (await productoDisponible(catalogo, env, "gatito"))!.stock!;
    await registrarVenta(catalogo, env, [{ productoId: "gatito", cantidad: 1 }]);
    const r = await panel.productos.onRequestGet({ env, request: req("/x", { cookie }) });
    const { productos } = (await r.json()) as { productos: { id: string; disponible: number | null; vendidos: number | null }[] };
    const g = productos.find((p) => p.id === "gatito")!;
    assert.equal(g.disponible, antes - 1);
    assert.equal(g.vendidos, 1);
    assert.equal(textoStock(g.disponible, g.vendidos).vendidos, "1 vendido");
  });

  await prueba("eliminar saca el producto de la venta", async () => {
    const { env } = entorno();
    const cookie = await instalarYEntrar(env);
    await panel.productos.onRequestPost({ env, request: req("/x", { cookie, cuerpo: { accion: "eliminar", id: "curso" } }) });
    const carrito = await validarCarrito([{ productoId: "curso", cantidad: 1 }], fuenteCarrito(catalogo)(env));
    assert.equal(carrito.listoParaPagar, false);
  });

  console.log("Panel — textos de stock:");

  await prueba("textos de stock: singular, plural, agotado y sin límite", () => {
    assert.deepEqual(textoStock(2, 1), { disponible: "2 disponibles", agotado: false, vendidos: "1 vendido" });
    assert.deepEqual(textoStock(1, 3), { disponible: "1 disponible", agotado: false, vendidos: "3 vendidos" });
    assert.deepEqual(textoStock(0, 5), { disponible: "Agotado", agotado: true, vendidos: "5 vendidos" });
    assert.deepEqual(textoStock(4, 0), { disponible: "4 disponibles", agotado: false, vendidos: "" });
    assert.deepEqual(textoStock(null, null), { disponible: "Sin límite", agotado: false, vendidos: "" });
    assert.deepEqual(textoStock(-1 as number, NaN), { disponible: "Sin límite", agotado: false, vendidos: "" });
    assert.equal(ayudaVendidos(null, null), "");
    assert.match(ayudaVendidos(2, 1), /último ajuste: 1\./);
  });

  console.log("Panel — fotos:");

  await prueba("un SVG (o HTML) disfrazado de .png no entra", async () => {
    const { env } = entorno();
    const cookie = await instalarYEntrar(env);
    const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
    const r = await panel.productoFoto.onRequestPost({ env, request: req("/x", { cookie, form: formFoto("gatito", svg) }) });
    assert.equal(r.status, 400);
    assert.equal(tipoRealDeImagen(svg), null);
  });

  await prueba("una foto con medidas absurdas (bomba de descompresión) no entra", async () => {
    const { env } = entorno();
    const cookie = await instalarYEntrar(env);
    const r = await panel.productoFoto.onRequestPost({ env, request: req("/x", { cookie, form: formFoto("gatito", png(50000, 50000)) }) });
    assert.equal(r.status, 400);
  });

  await prueba("foto válida: queda en /media con caché inmutable y nosniff; reemplazarla borra la anterior", async () => {
    const { env, datos } = entorno();
    const cookie = await instalarYEntrar(env);
    const r1 = await json(await panel.productoFoto.onRequestPost({ env, request: req("/x", { cookie, form: formFoto("gatito", png(800, 800)) }) }));
    assert.match(r1.imagen, /^\/media\/producto-gatito-[0-9a-f]{12}$/);
    const id1 = r1.imagen.split("/").pop();
    const media = await panel.media.onRequestGet({ env, params: { id: id1 } });
    assert.equal(media.status, 200);
    assert.equal(media.headers.get("Content-Type"), "image/png");
    assert.match(media.headers.get("Cache-Control")!, /immutable/);
    assert.equal(media.headers.get("X-Content-Type-Options"), "nosniff");
    const r2 = await json(await panel.productoFoto.onRequestPost({ env, request: req("/x", { cookie, form: formFoto("gatito", png(600, 600)) }) }));
    assert.notEqual(r2.imagen, r1.imagen);
    assert.equal(datos.has("foto:" + id1), false, "la foto anterior se borró");
    assert.equal((await catalogo.obtener(env)).buscar("gatito")!.imagen, r2.imagen);
  });

  await prueba("/media no sirve rutas raras ni archivos que no son fotos", async () => {
    const { env } = entorno();
    assert.equal((await panel.media.onRequestGet({ env, params: { id: "../admin:usuario" } })).status, 404);
    assert.equal((await panel.media.onRequestGet({ env, params: { id: "noexiste-000000" } })).status, 404);
  });

  console.log("Panel — pedidos y suscriptores:");

  console.log("Panel — portada (carrusel):");

  await prueba("portada: sin sesión no se ve ni se cambia; desde otro sitio tampoco", async () => {
    const { env } = entorno();
    const cookie = await instalarYEntrar(env);
    assert.equal((await panel.carrusel.onRequestGet({ env, request: req("/x") })).status, 401);
    assert.equal((await panel.carrusel.onRequestPost({ env, request: req("/x", { cuerpo: { accion: "restablecer" } }) })).status, 401);
    const ajeno = await panel.carrusel.onRequestPost({ env, request: req("/x", { cookie, origen: "https://malo.cl", cuerpo: { accion: "restablecer" } }) });
    assert.equal(ajeno.status, 403);
    const foto = await panel.carruselFoto.onRequestPost({ env, request: req("/x", { form: formFoto("", png(1600, 900)) }) });
    assert.equal(foto.status, 401);
  });

  await prueba("portada: subir foto, guardar, cambiarla borra la vieja y restablecer limpia todo", async () => {
    const { env, datos } = entorno();
    const cookie = await instalarYEntrar(env);
    const g = await json(await panel.carrusel.onRequestGet({ env, request: req("/x", { cookie }) }));
    assert.equal(g.editado, false);
    assert.equal(g.carrusel.diapositivas.length, 2);

    const subir = async () => (await json(await panel.carruselFoto.onRequestPost({ env, request: req("/x", { cookie, form: formFoto("", png(1600, 900)) }) }))).imagen as string;
    const f1 = await subir();
    assert.match(f1, /^\/media\/portada-[0-9a-f]{12}$/);
    const carrusel = { ...g.carrusel, diapositivas: [{ ...g.carrusel.diapositivas[0], imagen: f1 }, g.carrusel.diapositivas[1]] };
    const r1 = await panel.carrusel.onRequestPost({ env, request: req("/x", { cookie, cuerpo: { accion: "guardar", carrusel } }) });
    assert.equal(r1.status, 200);
    assert.equal(await portada.editado(env), true);

    const f2 = await subir();
    carrusel.diapositivas[0].imagen = f2;
    await panel.carrusel.onRequestPost({ env, request: req("/x", { cookie, cuerpo: { accion: "guardar", carrusel } }) });
    assert.ok(!datos.has("foto:" + f1.slice(7)), "la foto reemplazada se borra");
    assert.ok(datos.has("foto:" + f2.slice(7)));

    const r3 = await panel.carrusel.onRequestPost({ env, request: req("/x", { cookie, cuerpo: { accion: "restablecer" } }) });
    assert.equal(r3.status, 200);
    assert.equal(await portada.editado(env), false);
    assert.ok(!datos.has("foto:" + f2.slice(7)), "al restablecer, las fotos subidas se borran");
  });

  await prueba("portada: errores por campo; un enlace javascript: o una foto ajena no se guardan", async () => {
    const { env, datos } = entorno();
    const cookie = await instalarYEntrar(env);
    const malo = {
      diapositivas: [
        { imagen: "https://otro.cl/x.png", imagenAlt: "x", boton: { texto: "Ir", enlace: "javascript:alert(1)" } },
      ],
    };
    const r = await panel.carrusel.onRequestPost({ env, request: req("/x", { cookie, cuerpo: { accion: "guardar", carrusel: malo } }) });
    assert.equal(r.status, 400);
    const d = await json(r);
    assert.ok(d.errores["0.imagen"] && d.errores["0.enlace"] && d.errores["0.imagenAlt"]);
    assert.ok(!datos.has("carrusel:portada"));
  });

  await prueba("portada: un SVG disfrazado de foto no entra", async () => {
    const { env } = entorno();
    const cookie = await instalarYEntrar(env);
    const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
    const r = await panel.carruselFoto.onRequestPost({ env, request: req("/x", { cookie, form: formFoto("", svg, "foto.png") }) });
    assert.equal(r.status, 400);
  });

  await prueba("pedidos: solo con sesión; muestra los pagados; marcar enviado", async () => {
    const { env } = entorno();
    const cookie = await instalarYEntrar(env);
    const kv = env.REVIEWS_KV!;
    const base = { descripcion: "Compra", moneda: "CLP", email: "ana@correo.cl", proveedor: "mercadopago", actualizado: "", metadata: { comprador: { nombre: "Ana" }, lineas: [{ nombre: "Gatito", cantidad: 1, subtotal: 18000 }], requiereDespacho: true } };
    await kv.put("pago:pedido:ORDa", JSON.stringify({ ...base, orden: "ORDa", monto: 18000, estado: "pagada", creado: "2026-10-01T10:00:00Z" }));
    await kv.put("pago:pedido:ORDb", JSON.stringify({ ...base, orden: "ORDb", monto: 5000, estado: "pendiente", creado: "2026-10-02T10:00:00Z" }));
    assert.equal((await panel.pedidos.onRequestGet({ env, request: req("/api/admin/pedidos") })).status, 401);
    const lista = (await json(await panel.pedidos.onRequestGet({ env, request: req("/api/admin/pedidos", { cookie }) }))).pedidos;
    assert.deepEqual(lista.map((p: any) => p.orden), ["ORDa"]);
    assert.equal(lista[0].comprador.nombre, "Ana");
    const todos = (await json(await panel.pedidos.onRequestGet({ env, request: req("/api/admin/pedidos?todos=1", { cookie }) }))).pedidos;
    assert.equal(todos.length, 2);
    const m = await json(await panel.pedidos.onRequestPost({ env, request: req("/x", { cookie, cuerpo: { accion: "marcar-enviado", orden: "ORDa" } }) }));
    assert.ok(m.enviado);
    const inventada = await panel.pedidos.onRequestPost({ env, request: req("/x", { cookie, cuerpo: { accion: "marcar-enviado", orden: "ORDzzz" } }) });
    assert.equal(inventada.status, 404);
  });

  await prueba("resumen: solo con sesión; se pone al día con pedidos antiguos sin contar doble", async () => {
    const { env } = entorno();
    const cookie = await instalarYEntrar(env);
    const kv = env.REVIEWS_KV!;
    const hoy = new Date().toISOString();
    const base = { descripcion: "Compra", moneda: "CLP", email: "ana@correo.cl", actualizado: "", metadata: { comprador: { nombre: "Ana" }, lineas: [{ nombre: "Gatito", cantidad: 1, subtotal: 18000 }], requiereDespacho: true } };
    await kv.put("pago:pedido:ORDm1", JSON.stringify({ ...base, orden: "ORDm1", proveedor: "mercadopago", monto: 18000, estado: "pagada", creado: hoy }));
    await kv.put("pago:pedido:ORDm2", JSON.stringify({ ...base, orden: "ORDm2", proveedor: "flow", monto: 18000, estado: "pagada", creado: hoy }));
    await kv.put("pago:pedido:ORDm3", JSON.stringify({ ...base, orden: "ORDm3", proveedor: "flow", monto: 9000, estado: "pendiente", creado: hoy }));
    assert.equal((await panel.resumen.onRequestGet({ env, request: req("/api/admin/resumen") })).status, 401);
    for (let i = 0; i < 2; i++) {
      const r = await json(await panel.resumen.onRequestGet({ env, request: req("/api/admin/resumen", { cookie }) }));
      assert.equal(r.periodos.d30.pedidos, 2, "los pendientes no cuentan y no se cuenta doble");
      assert.equal(r.periodos.d30.ventas, 36000);
      assert.equal(r.periodos.d30.ticket, 18000);
      assert.deepEqual(r.topProductos[0], { nombre: "Gatito", unidades: 2, ventas: 36000 });
      assert.equal(r.porDespachar, 2);
      assert.equal(r.serie.length, 30);
    }
    // Rango de fechas: solo con sesión y con errores claros.
    const hoyDia = r0Dia();
    assert.equal((await panel.resumen.onRequestGet({ env, request: req(`/api/admin/resumen?desde=${hoyDia}&hasta=${hoyDia}`) })).status, 401);
    const rango = await json(await panel.resumen.onRequestGet({ env, request: req(`/api/admin/resumen?desde=${hoyDia}&hasta=${hoyDia}`, { cookie }) }));
    assert.equal(rango.periodo.pedidos, 2);
    const malo = await panel.resumen.onRequestGet({ env, request: req("/api/admin/resumen?desde=2026-02-30&hasta=2026-03-01", { cookie }) });
    assert.equal(malo.status, 400);
    assert.match((await json(malo)).message, /fechas válidas/);
  });

  await prueba("suscriptores: el CSV solo sale con sesión", async () => {
    const { env } = entorno();
    const cookie = await instalarYEntrar(env);
    assert.equal((await panel.suscriptores.onRequestGet({ env, request: req("/x?formato=csv") })).status, 401);
    const r = await panel.suscriptores.onRequestGet({ env, request: req("/x?formato=csv", { cookie }) });
    assert.match(r.headers.get("Content-Type")!, /text\/csv/);
  });

  await prueba("las cabeceras del panel reemplazan (no suman) y prohíben scripts externos", async () => {
    const r = await panel.cabeceras.onRequest({
      next: async () => new Response("x", { headers: { "Content-Security-Policy": "default-src *", "Cache-Control": "public" } }),
    });
    assert.match(r.headers.get("Content-Security-Policy")!, /script-src 'self'/);
    assert.ok(!r.headers.get("Content-Security-Policy")!.includes("default-src *"));
    assert.equal(r.headers.get("Cache-Control"), "no-store, max-age=0");
  });

  console.log(`\n${pasaron} pruebas pasaron.`);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
