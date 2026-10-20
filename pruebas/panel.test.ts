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
import { crearCatalogoEditable, MAXIMO_NUEVAS, productoDisponible, registrarVenta } from "../modulos/catalogo/index";
import { validarCarrito } from "../modulos/carrito/servidor";
import { fuenteCarrito } from "../modulos/catalogo/stock";
import { tipoRealDeImagen } from "../modulos/panel/imagenes";
import { ayudaVendidos, textoStock } from "../modulos/panel/texto-stock";
import { diaLocal } from "../modulos/metricas/index";
import { crearCarruselEditable } from "../modulos/carrusel/index";
import { crearContenidoEditable } from "../modulos/contenido/index";
import { hmacSha256Hex } from "../core/cripto";
import { crearDespachoEditable } from "../modulos/despacho/index";
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
const sitio = crearContenidoEditable(
  {
    grupos: [{ id: "g", titulo: "G" }],
    campos: [
      { clave: "colores.acento", grupo: "g", etiqueta: "Acento", tipo: "color", variable: "--c-acento" },
      { clave: "inicio.titulo", grupo: "g", etiqueta: "Título", tipo: "texto", max: 40 },
      { clave: "inicio.foto", grupo: "g", etiqueta: "Foto", tipo: "imagen" },
    ],
  },
  { "colores.acento": "#d81b72", "inicio.titulo": "Hola", "inicio.foto": "/img/a.webp" },
  { contraste: [{ texto: "#ffffff", fondo: "colores.acento", minimo: 4.5, descripcion: "Botones" }] }
);
const despachoFuente = crearDespachoEditable({ detallePorPagar: "Se paga al recibir." });
const configContacto = {
  nombreSitio: "Tienda Prueba",
  modo: "contacto" as const,
  categorias: [
    { id: "consulta", label: "Consulta por un producto" },
    { id: "otro", label: "Otro" },
  ],
};
const panel = crearPanel({ nombreSitio: "Tienda Prueba", catalogo, carrusel: portada, contenido: sitio, boletines: { nombreSitio: "Tienda Prueba", urlPublica: "https://tienda.cl" }, revisionPagos: true, despacho: despachoFuente, mensajes: configContacto });

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

  await prueba("video del producto: se guarda el código de YouTube, se rechaza otro sitio y se quita dejándolo vacío", async () => {
    const { env } = entorno();
    const cookie = await instalarYEntrar(env);
    const base = { id: "gatito", nombre: "Gatito", precio: 21000, disponible: 3, categoria: "peluches", tipo: "fisico" };
    const guardar = (video: unknown) =>
      panel.productos.onRequestPost({ env, request: req("/x", { cookie, cuerpo: { accion: "guardar", producto: { ...base, video } } }) });
    const a = await json(await guardar("https://youtube.com/shorts/dQw4w9WgXcQ?feature=share"));
    assert.equal(a.producto.video, "dQw4w9WgXcQ");
    const malo = await guardar("https://evil.com/watch?v=dQw4w9WgXcQ");
    assert.equal(malo.status, 400);
    assert.ok((await json(malo)).errores.video);
    assert.equal((await catalogo.obtener(env)).buscar("gatito")!.video, "dQw4w9WgXcQ");
    const sin = await json(await guardar(""));
    assert.equal(sin.producto.video, undefined);
    assert.equal((await catalogo.obtener(env)).buscar("gatito")!.video, undefined);
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

  const agregar = (env: EnvPanel, cookie: string, id = "gatito") => {
    const f = formFoto(id, png(800, 800));
    f.set("modo", "agregar");
    return panel.productoFoto.onRequestPost({ env, request: req("/x", { cookie, form: f }) });
  };

  await prueba("galería: agregar suma al final; la primera queda como principal", async () => {
    const { env } = entorno();
    const cookie = await instalarYEntrar(env);
    const a = await json(await agregar(env, cookie));
    const b = await json(await agregar(env, cookie));
    const c = await json(await agregar(env, cookie));
    const p = (await catalogo.obtener(env)).buscar("gatito")!;
    // El gatito ya traía foto del sitio: esa sigue de principal.
    assert.equal(p.imagen, "/img/productos/gatito.webp");
    assert.deepEqual(p.fotos, [a.fotos[1], b.fotos[2], c.fotos[3]]);
    assert.equal(c.fotos.length, 4);
  });

  await prueba("galería: máximo 20 fotos por producto", async () => {
    const { env } = entorno();
    const cookie = await instalarYEntrar(env);
    for (let i = 0; i < 19; i++) assert.equal((await agregar(env, cookie)).status, 200);
    const extra = await agregar(env, cookie);
    assert.equal(extra.status, 400);
    assert.match((await json(extra)).message, /hasta 20 fotos/);
    assert.equal((await catalogo.obtener(env)).buscar("gatito")!.fotos!.length, 19);
  });

  await prueba("galería: reordenar cambia la principal; quitar borra del almacén; no se aceptan fotos ajenas", async () => {
    const { env, datos } = entorno();
    const cookie = await instalarYEntrar(env);
    await agregar(env, cookie);
    const r = await json(await agregar(env, cookie));
    const [principal, f1, f2] = r.fotos as string[];
    const ordenar = (fotos: unknown, id = "gatito") =>
      panel.productos.onRequestPost({ env, request: req("/x", { cookie, cuerpo: { accion: "fotos", id, fotos } }) });
    assert.equal((await ordenar([f2, principal, f1])).status, 200);
    let p = (await catalogo.obtener(env)).buscar("gatito")!;
    assert.equal(p.imagen, f2);
    assert.deepEqual(p.fotos, [principal, f1]);
    // Una foto que no es del producto (de otro, o inventada) no entra.
    assert.equal((await ordenar([f2, "/media/producto-otro-aaaaaaaaaaaa"])).status, 400);
    assert.equal((await ordenar([f2, "https://malo.cl/x.png"])).status, 400);
    assert.equal((await ordenar(new Array(21).fill(f2))).status, 400);
    // Quitar f1: se borra del almacén.
    assert.equal((await ordenar([f2, principal])).status, 200);
    assert.equal(datos.has("foto:" + f1.slice(7)), false);
    p = (await catalogo.obtener(env)).buscar("gatito")!;
    assert.deepEqual([p.imagen, ...(p.fotos ?? [])], [f2, principal]);
    // Quitar todas: queda sin foto (la tienda usa la de reemplazo).
    assert.equal((await ordenar([])).status, 200);
    p = (await catalogo.obtener(env)).buscar("gatito")!;
    assert.equal(p.imagen, undefined);
    assert.equal(p.fotos, undefined);
    assert.equal(datos.has("foto:" + f2.slice(7)), false);
    // Sin sesión, nada.
    assert.equal((await panel.productos.onRequestPost({ env, request: req("/x", { cuerpo: { accion: "fotos", id: "gatito", fotos: [] } }) })).status, 401);
  });

  await prueba("galería: eliminar el producto borra todas sus fotos", async () => {
    const { env, datos } = entorno();
    const cookie = await instalarYEntrar(env);
    await agregar(env, cookie);
    const r = await json(await agregar(env, cookie));
    await panel.productos.onRequestPost({ env, request: req("/x", { cookie, cuerpo: { accion: "eliminar", id: "gatito" } }) });
    for (const f of (r.fotos as string[]).filter((x) => x.startsWith("/media/"))) assert.equal(datos.has("foto:" + f.slice(7)), false);
  });

  await prueba("/media no sirve rutas raras ni archivos que no son fotos", async () => {
    const { env } = entorno();
    assert.equal((await panel.media.onRequestGet({ env, params: { id: "../admin:usuario" } })).status, 404);
    assert.equal((await panel.media.onRequestGet({ env, params: { id: "noexiste-000000" } })).status, 404);
  });

  console.log("Panel — pedidos y suscriptores:");

  await prueba("visitas: solo con sesión; sin las claves de Cloudflare dice 'no conectadas' (sin error)", async () => {
    const { env } = entorno();
    const cookie = await instalarYEntrar(env);
    assert.equal((await panel.visitas.onRequestGet({ env, request: req("/x") })).status, 401);
    const r = await panel.visitas.onRequestGet({ env, request: req("/api/admin/visitas?dias=30", { cookie }) });
    assert.equal(r.status, 200);
    assert.equal((await json(r)).conectadas, false);
  });

  console.log("Panel — diseño y textos:");

  await prueba("diseño y textos: sin sesión nada; guardar con aviso de contraste (no bloquea); errores por campo", async () => {
    const { env } = entorno();
    const cookie = await instalarYEntrar(env);
    assert.equal((await panel.contenido.onRequestGet({ env, request: req("/x") })).status, 401);
    const g = await json(await panel.contenido.onRequestGet({ env, request: req("/x", { cookie }) }));
    assert.equal(g.valores["inicio.titulo"], "Hola");
    assert.ok(g.fuentes.length >= 10);
    const ok = await json(await panel.contenido.onRequestPost({ env, request: req("/x", { cookie, cuerpo: { accion: "guardar", valores: { "colores.acento": "#ffd0e0" } } }) }));
    assert.equal(ok.ok, true);
    assert.equal(ok.avisos.length, 1, "libre con aviso");
    assert.deepEqual(ok.cambiados, ["colores.acento"]);
    const malo = await panel.contenido.onRequestPost({ env, request: req("/x", { cookie, cuerpo: { accion: "guardar", valores: { "inicio.titulo": "" } } }) });
    assert.equal(malo.status, 400);
    assert.ok((await json(malo)).errores["inicio.titulo"]);
    // Una foto no se cambia por aquí (solo subiendo un archivo revisado).
    await panel.contenido.onRequestPost({ env, request: req("/x", { cookie, cuerpo: { accion: "guardar", valores: { "inicio.foto": "/img/otra.webp" } } }) });
    assert.equal((await sitio.obtener(env)).valores["inicio.foto"], "/img/a.webp");
  });

  await prueba("diseño y textos: foto nueva reemplaza (y borra) la anterior; restablecer la borra", async () => {
    const { env, datos } = entorno();
    const cookie = await instalarYEntrar(env);
    const subir = async () => {
      const f = new FormData();
      f.set("clave", "inicio.foto");
      f.set("archivo", new File([png(1200, 800)], "x.png", { type: "image/png" }));
      return (await json(await panel.contenidoFoto.onRequestPost({ env, request: req("/x", { cookie, form: f }) }))).imagen as string;
    };
    const f1 = await subir();
    assert.match(f1, /^\/media\/sitio-inicio-foto-/);
    const f2 = await subir();
    assert.ok(!datos.has("foto:" + f1.slice(7)));
    await panel.contenido.onRequestPost({ env, request: req("/x", { cookie, cuerpo: { accion: "restablecer", claves: ["inicio.foto"] } }) });
    assert.ok(!datos.has("foto:" + f2.slice(7)));
    assert.equal((await sitio.obtener(env)).valores["inicio.foto"], "/img/a.webp");
    const otro = new FormData();
    otro.set("clave", "inicio.titulo");
    otro.set("archivo", new File([png(10, 10)], "x.png", { type: "image/png" }));
    assert.equal((await panel.contenidoFoto.onRequestPost({ env, request: req("/x", { cookie, form: otro }) })).status, 400, "un campo de texto no recibe fotos");
  });

  console.log("Panel — categorías:");

  await prueba("categorías: sin sesión nada; renombrar se ve en el catálogo y en la lista de productos", async () => {
    const { env } = entorno();
    const cookie = await instalarYEntrar(env);
    assert.equal((await panel.categorias.onRequestGet({ env, request: req("/x") })).status, 401);
    const ajeno = await panel.categorias.onRequestPost({ env, request: req("/x", { cookie, origen: "https://malo.cl", cuerpo: { accion: "restablecer" } }) });
    assert.equal(ajeno.status, 403);
    const r = await panel.categorias.onRequestPost({ env, request: req("/x", { cookie, cuerpo: { accion: "guardar", id: "peluches", categoria: { nombre: "Peluches y anime", corto: "" } } }) });
    assert.equal(r.status, 200);
    const lista = await json(await panel.categorias.onRequestGet({ env, request: req("/x", { cookie }) }));
    const p = lista.categorias.find((c: { id: string }) => c.id === "peluches");
    assert.equal(p.nombre, "Peluches y anime");
    assert.equal(p.editada, true);
    assert.equal(p.productos, 1);
    assert.equal(p.original.nombre, "Peluches");
    const prods = await json(await panel.productos.onRequestGet({ env, request: req("/x", { cookie }) }));
    assert.equal(prods.categorias.find((c: { id: string }) => c.id === "peluches").nombre, "Peluches y anime");
  });

  await prueba("categorías: no se puede inventar una ni dejar el nombre vacío", async () => {
    const { env } = entorno();
    const cookie = await instalarYEntrar(env);
    const inventada = await panel.categorias.onRequestPost({ env, request: req("/x", { cookie, cuerpo: { accion: "guardar", id: "nueva", categoria: { nombre: "Nueva" } } }) });
    assert.equal(inventada.status, 404);
    const vacia = await panel.categorias.onRequestPost({ env, request: req("/x", { cookie, cuerpo: { accion: "guardar", id: "peluches", categoria: { nombre: "" } } }) });
    assert.equal(vacia.status, 400);
    assert.ok((await json(vacia)).errores.nombre);
  });

  await prueba("categorías: foto nueva reemplaza (y borra) la anterior; restablecer borra las subidas", async () => {
    const { env, datos } = entorno();
    const cookie = await instalarYEntrar(env);
    const subir = async () => (await json(await panel.categoriaFoto.onRequestPost({ env, request: req("/x", { cookie, form: formFoto("peluches", png(800, 800)) }) }))).imagen as string;
    const f1 = await subir();
    assert.match(f1, /^\/media\/categoria-peluches-/);
    const f2 = await subir();
    assert.ok(!datos.has("foto:" + f1.slice(7)), "la anterior se borra");
    assert.ok(datos.has("foto:" + f2.slice(7)));
    await panel.categorias.onRequestPost({ env, request: req("/x", { cookie, cuerpo: { accion: "restablecer" } }) });
    assert.ok(!datos.has("foto:" + f2.slice(7)));
    assert.ok(!datos.has("catalogo:categorias"));
    const svg = new TextEncoder().encode("<svg><script>alert(1)</script></svg>");
    const malo = await panel.categoriaFoto.onRequestPost({ env, request: req("/x", { cookie, form: formFoto("peluches", svg) }) });
    assert.equal(malo.status, 400);
  });

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

  await prueba("suscriptores: la lista y quitar a alguien solo con sesión y mismo origen", async () => {
    const { env, datos } = entorno();
    const SECRETO = "s".repeat(40);
    env.NEWSLETTER_SECRET = SECRETO;
    const clave = async (e: string) => "news:sub:" + (await hmacSha256Hex(SECRETO, `clave:${e}`)).slice(0, 40);
    await env.REVIEWS_KV!.put(await clave("ana@correo.cl"), JSON.stringify({ email: "ana@correo.cl", estado: "activo", creado: "2026-10-01T00:00:00Z", confirmado: "2026-10-01T00:00:00Z" }));
    await env.REVIEWS_KV!.put(await clave("beto@correo.cl"), JSON.stringify({ email: "beto@correo.cl", estado: "activo", creado: "2026-10-02T00:00:00Z", confirmado: "2026-10-02T00:00:00Z" }));
    const cookie = await instalarYEntrar(env);

    assert.equal((await panel.suscriptores.onRequestGet({ env, request: req("/x") })).status, 401);
    const l = await json(await panel.suscriptores.onRequestGet({ env, request: req("/x", { cookie }) }));
    assert.equal(l.total, 2);
    assert.deepEqual(l.lista.map((x: { email: string }) => x.email), ["beto@correo.cl", "ana@correo.cl"], "los más nuevos primero");

    const quitar = (email: unknown, o: { cookie?: string; origen?: string } = {}) =>
      panel.suscriptores.onRequestPost({ env, request: req("/x", { cuerpo: { accion: "quitar", email }, ...o }) });
    assert.equal((await quitar("ana@correo.cl")).status, 401, "sin sesión no");
    assert.equal((await quitar("ana@correo.cl", { cookie, origen: "https://malo.cl" })).status, 403, "otro origen no");
    assert.equal((await quitar("no-es-correo", { cookie })).status, 400);
    assert.equal((await quitar("nadie@correo.cl", { cookie })).status, 404);
    assert.equal((await quitar("  ANA@correo.cl ", { cookie })).status, 200, "ignora mayúsculas y espacios");
    assert.ok(![...datos.keys()].includes(await clave("ana@correo.cl")));
    const l2 = await json(await panel.suscriptores.onRequestGet({ env, request: req("/x", { cookie }) }));
    assert.equal(l2.total, 1);

    delete env.NEWSLETTER_SECRET;
    assert.equal((await quitar("beto@correo.cl", { cookie })).status, 503);
  });

  await prueba("boletines: guardar, probar, enviar; enviado no se edita ni se borra", async () => {
    const { env } = entorno();
    const SECRETO = "s".repeat(40);
    Object.assign(env, { NEWSLETTER_SECRET: SECRETO, RESEND_API_KEY: "re_x", ADMIN_NOTIFY_EMAIL: "duena@tienda.cl" });
    const clave = async (e: string) => "news:sub:" + (await hmacSha256Hex(SECRETO, `clave:${e}`)).slice(0, 40);
    await env.REVIEWS_KV!.put(await clave("ana@correo.cl"), JSON.stringify({ email: "ana@correo.cl", estado: "activo", creado: "x", confirmado: "2026-10-01T00:00:00Z" }));
    const cookie = await instalarYEntrar(env);
    const enviados: { to: string[]; subject: string; html: string }[] = [];
    const fetchOriginal = globalThis.fetch;
    globalThis.fetch = (async (_u: unknown, init?: RequestInit) => {
      for (const c of JSON.parse(String(init?.body))) enviados.push(c);
      return new Response("{}", { status: 200 });
    }) as typeof fetch;
    try {
      const post = async (cuerpo: unknown) => {
        const r = await panel.boletines.onRequestPost({ env, request: req("/api/admin/boletines", { cuerpo, cookie }) });
        return { status: r.status, d: await json(r) };
      };
      const malo = await post({ accion: "guardar", asunto: "", texto: "" });
      assert.equal(malo.status, 400);
      assert.ok(malo.d.errores.asunto && malo.d.errores.texto);
      const g = await post({ accion: "guardar", asunto: "Hola", texto: "Mensaje", boton: { texto: "Ver", enlace: "/tienda/" } });
      assert.equal(g.status, 200);
      const id = g.d.boletin.id;
      assert.equal((await post({ accion: "guardar", id, asunto: "Hola 2", texto: "Mensaje" })).d.boletin.asunto, "Hola 2");

      const lista = await json(await panel.boletines.onRequestGet({ env, request: req("/api/admin/boletines", { cookie }) }));
      assert.equal(lista.suscriptores, 1);
      assert.equal(lista.correoPrueba, "d****@tienda.cl", "el correo de prueba se muestra a medias");
      assert.equal(lista.boletines[0].entregados, undefined, "las huellas no salen al panel");
      assert.equal(lista.cupo.porDia, 80, "por defecto 80 al día");

      const p = await post({ accion: "probar", id });
      assert.equal(p.status, 200);
      assert.deepEqual(enviados.at(-1)!.to, ["duena@tienda.cl"]);
      assert.match(enviados.at(-1)!.subject, /^\[Prueba\]/);
      assert.ok(enviados.at(-1)!.html.includes("https://tienda.cl/newsletter/baja?e="), "usa la dirección pública");

      assert.equal((await post({ accion: "enviar", id })).status, 400, "sin confirmar no envía");
      // Tope por día: la dueña lo deja en 1 con 2 suscriptores.
      await env.REVIEWS_KV!.put(await clave("beto@correo.cl"), JSON.stringify({ email: "beto@correo.cl", estado: "activo", creado: "x", confirmado: "2026-10-02T00:00:00Z" }));
      assert.equal((await post({ accion: "ajustes", porDia: 0 })).status, 400);
      assert.equal((await post({ accion: "ajustes", porDia: 2.5 })).status, 400);
      const aj = await post({ accion: "ajustes", porDia: 1 });
      assert.equal(aj.d.cupo.porDia, 1);
      assert.equal(aj.d.cupo.limitePlan, 100);
      const antes = enviados.length;
      const e = await post({ accion: "enviar", id, confirmar: true });
      assert.equal(e.status, 200);
      assert.equal(e.d.progreso.pendientes, 1, "hoy solo sale 1");
      assert.equal(enviados.length, antes + 1);
      assert.equal(e.d.cupo.quedan, 0);
      const tope = await post({ accion: "enviar", id, confirmar: true });
      assert.equal(tope.status, 409);
      assert.match(tope.d.message, /Sigue después de las \d\d:\d\d/);
      // Sube el tope (como si fuera otro día con cupo): termina sin repetir.
      await post({ accion: "ajustes", porDia: 10 });
      const fin = await post({ accion: "enviar", id, confirmar: true });
      assert.equal(fin.d.progreso.pendientes, 0);
      assert.equal(new Set(enviados.slice(antes).map((c) => c.to[0])).size, 2);
      assert.equal((await post({ accion: "enviar", id, confirmar: true })).status, 409, "no se envía dos veces");
      assert.equal((await post({ accion: "guardar", id, asunto: "x", texto: "y" })).status, 409);
      assert.equal((await post({ accion: "eliminar", id })).status, 409);
    } finally {
      globalThis.fetch = fetchOriginal;
    }
  });

  await prueba("revisión de pagos: solo con sesión; sin Flow dice que no está conectado", async () => {
    const { env } = entorno();
    assert.equal((await panel.revisionPagos.onRequestGet({ env, request: req("/api/admin/revision-pagos") })).status, 401);
    const cookie = await instalarYEntrar(env);
    const r = await json(await panel.revisionPagos.onRequestGet({ env, request: req("/api/admin/revision-pagos", { cookie }) }));
    assert.equal(r.conectado, false);
    const sin = crearPanel({ nombreSitio: "X" });
    assert.equal((await sin.revisionPagos.onRequestGet({ env, request: req("/api/admin/revision-pagos", { cookie }) })).status, 404);
  });

  await prueba("las cabeceras del panel reemplazan (no suman) y prohíben scripts externos", async () => {
    const r = await panel.cabeceras.onRequest({
      next: async () => new Response("x", { headers: { "Content-Security-Policy": "default-src *", "Cache-Control": "public" } }),
    });
    assert.match(r.headers.get("Content-Security-Policy")!, /script-src 'self'/);
    assert.ok(!r.headers.get("Content-Security-Policy")!.includes("default-src *"));
    assert.equal(r.headers.get("Cache-Control"), "no-store, max-age=0");
  });

  console.log("Panel — usuarios invitados:");

  const D3 = "c".repeat(64);
  async function invitar(env: EnvPanel, cookie: string, horas = 24) {
    const r = await panel.seguridad.onRequestPost({ env, request: req("/x", { cookie, cuerpo: { accion: "invitar", horas, derivado: D1 } }) });
    return { status: r.status, datos: await json(r) };
  }
  const aceptar = (env: EnvPanel, invitacion: unknown, usuario = "clienta", derivado = D3) =>
    panel.instalar.onRequestPost({ env, request: req("/api/admin/instalar", { cuerpo: { invitacion, usuario, derivado } }) });

  await prueba("invitar pide la contraseña del dueño; sin ella o con plazo raro, no", async () => {
    const { env } = entorno();
    const cookie = await instalarYEntrar(env);
    const sinClave = await panel.seguridad.onRequestPost({ env, request: req("/x", { cookie, cuerpo: { accion: "invitar", horas: 24, derivado: D2 } }) });
    assert.equal(sinClave.status, 400);
    const plazo = await panel.seguridad.onRequestPost({ env, request: req("/x", { cookie, cuerpo: { accion: "invitar", horas: 9999, derivado: D1 } }) });
    assert.equal(plazo.status, 400);
    const sinSesion = await panel.seguridad.onRequestPost({ env, request: req("/x", { cuerpo: { accion: "invitar", horas: 24, derivado: D1 } }) });
    assert.equal(sinSesion.status, 401);
  });

  await prueba("el enlace sirve UNA vez, no se guarda en claro y crea un usuario que entra con lo suyo", async () => {
    const { env, datos } = entorno();
    const cookie = await instalarYEntrar(env);
    const { status, datos: inv } = await invitar(env, cookie);
    assert.equal(status, 200);
    assert.match(inv.token, /^[0-9a-f]{64}$/);
    assert.ok(![...datos.entries()].some(([k, v]) => k.includes(inv.token) || String(v.v).includes(inv.token)), "el token no queda en la base");
    const revisar = await panel.instalar.onRequestPost({ env, request: req("/x", { cuerpo: { invitacion: inv.token, accion: "revisar" } }) });
    assert.equal(revisar.status, 200);
    assert.equal((await aceptar(env, inv.token)).status, 200);
    assert.equal((await aceptar(env, inv.token, "otra")).status, 410, "segundo uso del mismo enlace");
    const entra = await panel.entrar.onRequestPost({ env, request: req("/x", { cuerpo: { usuario: "clienta", derivado: D3 } }) });
    assert.equal(entra.status, 200);
    assert.ok(cookieDe(entra, "mc_sesion"));
    const cruzado = await panel.entrar.onRequestPost({ env, request: req("/x", { cuerpo: { usuario: "clienta", derivado: D1 } }) });
    assert.equal(cruzado.status, 401, "la contraseña del dueño no abre la cuenta de la invitada");
    assert.equal((await panel.entrar.onRequestPost({ env, request: req("/x", { cuerpo: { usuario: "sasha", derivado: D1 } }) })).status, 200, "el dueño sigue entrando");
  });

  await prueba("enlace inventado, vencido o anulado no crea nada", async () => {
    const { env, datos } = entorno();
    const cookie = await instalarYEntrar(env);
    assert.equal((await aceptar(env, "f".repeat(64))).status, 410);
    assert.equal((await aceptar(env, "<script>")).status, 410);
    const { datos: inv } = await invitar(env, cookie, 1);
    for (const [k, v] of datos) {
      if (k.startsWith("admin:invitacion:")) v.v = JSON.stringify({ ...JSON.parse(String(v.v)), vence: new Date(Date.now() - 1000).toISOString() });
    }
    assert.equal((await aceptar(env, inv.token)).status, 410, "vencido");
    const { datos: inv2 } = await invitar(env, cookie);
    const seg = await json(await panel.seguridad.onRequestGet({ env, request: req("/x", { cookie }) }));
    const pendiente = seg.invitaciones.find((i: { id: string }) => i.id);
    assert.equal((await panel.seguridad.onRequestPost({ env, request: req("/x", { cookie, cuerpo: { accion: "anular-invitacion", id: pendiente.id } }) })).status, 200);
    assert.equal((await aceptar(env, inv2.token)).status, 410, "anulado");
    assert.equal((await listarUsuariosDe(env, cookie)).length, 1);
  });

  async function listarUsuariosDe(env: EnvPanel, cookie: string) {
    return (await json(await panel.seguridad.onRequestGet({ env, request: req("/x", { cookie }) }))).usuarios as { usuario: string }[];
  }

  await prueba("no se puede usar el nombre del dueño (ni con otras mayúsculas) ni pisarlo", async () => {
    const { env } = entorno();
    const cookie = await instalarYEntrar(env);
    const { datos: inv } = await invitar(env, cookie);
    assert.equal((await aceptar(env, inv.token, "SASHA")).status, 409);
    assert.equal((await aceptar(env, inv.token, "sasha")).status, 409);
    assert.equal((await aceptar(env, inv.token, "a b")).status, 400);
    assert.equal((await aceptar(env, inv.token, "clienta")).status, 200, "el enlace no se quemó con los intentos fallidos");
    assert.equal((await panel.entrar.onRequestPost({ env, request: req("/x", { cuerpo: { usuario: "sasha", derivado: D1 } }) })).status, 200);
  });

  await prueba("la invitada no ve ni maneja usuarios; el dueño le quita el acceso y su sesión muere", async () => {
    const { env } = entorno();
    const cookie = await instalarYEntrar(env);
    const { datos: inv } = await invitar(env, cookie);
    await aceptar(env, inv.token);
    const suya = cookieDe(await panel.entrar.onRequestPost({ env, request: req("/x", { cuerpo: { usuario: "clienta", derivado: D3 } }) }), "mc_sesion");
    const vista = await json(await panel.seguridad.onRequestGet({ env, request: req("/x", { cookie: suya }) }));
    assert.equal(vista.dueno, false);
    assert.equal(vista.usuarios, undefined);
    assert.equal((await panel.seguridad.onRequestPost({ env, request: req("/x", { cookie: suya, cuerpo: { accion: "invitar", horas: 24, derivado: D3 } }) })).status, 403);
    assert.equal((await panel.seguridad.onRequestPost({ env, request: req("/x", { cookie: suya, cuerpo: { accion: "quitar-usuario", usuario: "sasha" } }) })).status, 403);
    assert.equal((await panel.productos.onRequestGet({ env, request: req("/x", { cookie: suya }) })).status, 200, "puede trabajar en la tienda");
    assert.equal((await panel.seguridad.onRequestPost({ env, request: req("/x", { cookie, cuerpo: { accion: "quitar-usuario", usuario: "sasha" } }) })).status, 400, "el dueño no se quita a sí mismo");
    assert.equal((await panel.seguridad.onRequestPost({ env, request: req("/x", { cookie, cuerpo: { accion: "quitar-usuario", usuario: "clienta" } }) })).status, 200);
    assert.equal((await panel.productos.onRequestGet({ env, request: req("/x", { cookie: suya }) })).status, 401, "su sesión abierta deja de servir");
    assert.equal((await panel.entrar.onRequestPost({ env, request: req("/x", { cuerpo: { usuario: "clienta", derivado: D3 } }) })).status, 401);
    assert.equal((await panel.productos.onRequestGet({ env, request: req("/x", { cookie }) })).status, 200, "el dueño sigue adentro");
  });

  await prueba("cada uno con su contraseña, su doble factor y sus sesiones", async () => {
    const { env } = entorno();
    const cookie = await instalarYEntrar(env);
    const { datos: inv } = await invitar(env, cookie);
    await aceptar(env, inv.token);
    const suya = cookieDe(await panel.entrar.onRequestPost({ env, request: req("/x", { cuerpo: { usuario: "clienta", derivado: D3 } }) }), "mc_sesion");
    // Ella activa su doble factor: al dueño no le cambia nada.
    await panel.seguridad.onRequestPost({ env, request: req("/x", { cookie: suya, cuerpo: { accion: "proponer" } }) });
    const reg = await obtenerUsuario(env, "clienta");
    const secreto = (await descifrarSecreto(reg!.propuesta!.secreto, PEPPER))!;
    const act = await panel.seguridad.onRequestPost({ env, request: req("/x", { cookie: suya, cuerpo: { accion: "activar", codigo: await codigoPara(secreto, Math.floor(Date.now() / 1000 / PERIODO)) } }) });
    assert.equal(act.status, 200);
    assert.equal((await obtenerUsuario(env))!.dosFactores, undefined, "el dueño sigue sin doble factor");
    assert.equal((await json(await panel.entrar.onRequestPost({ env, request: req("/x", { cuerpo: { usuario: "clienta", derivado: D3 } }) }))).segundoFactor, true);
    assert.equal((await json(await panel.entrar.onRequestPost({ env, request: req("/x", { cuerpo: { usuario: "sasha", derivado: D1 } }) }))).segundoFactor, undefined);
    // El dueño cambia su contraseña: la sesión de ella sigue abierta.
    const cambio = await json(await panel.seguridad.onRequestPost({ env, request: req("/x", { cookie, cuerpo: { accion: "cambiar-clave", derivadoActual: D1, derivadoNuevo: D2 } }) }));
    assert.equal(cambio.ok, true);
    assert.equal((await panel.productos.onRequestGet({ env, request: req("/x", { cookie: suya }) })).status, 200);
    assert.equal((await panel.entrar.onRequestPost({ env, request: req("/x", { cuerpo: { usuario: "clienta", derivado: D3 } }) })).status, 200);
  });

  await prueba("el enlace de invitación no necesita ADMIN_SETUP_TOKEN (ya borrada)", async () => {
    const { env } = entorno();
    const cookie = await instalarYEntrar(env);
    delete env.ADMIN_SETUP_TOKEN;
    const { datos: inv } = await invitar(env, cookie);
    assert.equal((await aceptar(env, inv.token)).status, 200);
    assert.equal((await panel.instalar.onRequestPost({ env, request: req("/x", { cuerpo: { usuario: "x", derivado: D1, claveInstalacion: TOKEN } }) })).status, 503, "sin la variable, la instalación normal sigue cerrada");
  });

  console.log("Panel — despacho:");

  await prueba("despacho: sin sesión nada; desde otro sitio no guarda; sin módulo no existe", async () => {
    const { env } = entorno();
    assert.equal((await panel.despacho.onRequestGet({ env, request: req("/x") })).status, 401);
    const cookie = await instalarYEntrar(env);
    const t = { ...despachoFuente.inicial, pagarAhora: true, centro: 3500 };
    assert.equal((await panel.despacho.onRequestPost({ env, request: req("/x", { cuerpo: { accion: "guardar", tarifas: t } }) })).status, 401);
    assert.equal((await panel.despacho.onRequestPost({ env, request: req("/x", { cookie, origen: "https://malo.cl", cuerpo: { accion: "guardar", tarifas: t } }) })).status, 403);
    const sin = crearPanel({ nombreSitio: "X" });
    assert.equal((await sin.despacho.onRequestGet({ env, request: req("/x", { cookie }) })).status, 404);
  });

  await prueba("despacho: por defecto por pagar; guardar cambia la tienda; lo inválido no se guarda", async () => {
    const { env } = entorno();
    const cookie = await instalarYEntrar(env);
    const antes = await json(await panel.despacho.onRequestGet({ env, request: req("/x", { cookie }) }));
    assert.equal(antes.tarifas.pagarAhora, false);
    assert.equal(antes.comunasRM.length, 52);
    assert.equal(antes.regiones.length, 15);
    const malo = await panel.despacho.onRequestPost({ env, request: req("/x", { cookie, cuerpo: { accion: "guardar", tarifas: { ...antes.tarifas, centro: -5 } } }) });
    assert.equal(malo.status, 400);
    assert.ok((await json(malo)).errores.centro);
    const nueva = { ...antes.tarifas, pagarAhora: true, centro: 3500, alejada: 5000, cercana: 5500, extrema: 7000, gratisDesde: 30000 };
    const ok = await json(await panel.despacho.onRequestPost({ env, request: req("/x", { cookie, cuerpo: { accion: "guardar", tarifas: nueva } }) }));
    assert.equal(ok.textos.corto, "Despacho gratis desde $30.000");
    assert.equal((await despachoFuente.obtener(env)).extrema, 7000, "la tienda lee lo mismo que guardó el panel");
  });

  await prueba("pedidos: muestra el despacho cobrado", async () => {
    const { env, datos } = entorno();
    const cookie = await instalarYEntrar(env);
    datos.set("pago:pedido:o9", { v: JSON.stringify({ orden: "o9", creado: new Date().toISOString(), estado: "pagada", monto: 25000, proveedor: "flow", email: "a@b.cl", metadata: { lineas: [], comprador: {}, requiereDespacho: true, tieneDigitales: false, despacho: { forma: "ahora", costo: 7000, zona: "extrema", gratisPorMonto: false } } }) });
    const r = await json(await panel.pedidos.onRequestGet({ env, request: req("/x", { cookie }) }));
    assert.equal(r.pedidos[0].despacho.costo, 7000);
  });

  console.log("Panel — crear y borrar categorías:");

  const cat = (env: EnvPanel, cookie: string, cuerpo: unknown, origen?: string) =>
    panel.categorias.onRequestPost({ env, request: req("/x", { cookie, cuerpo, ...(origen ? { origen } : {}) }) });

  await prueba("crear categoría: id desde el nombre, recibe productos; nombre repetido o vacío no", async () => {
    const { env } = entorno();
    const cookie = await instalarYEntrar(env);
    const r = await json(await cat(env, cookie, { accion: "crear", categoria: { nombre: "Accesorios Ñandú", corto: "Accesorios", bajada: "" } }));
    assert.equal(r.id, "accesorios-nandu");
    const lista = await json(await panel.categorias.onRequestGet({ env, request: req("/x", { cookie }) }));
    const nueva = lista.categorias.find((c: any) => c.id === "accesorios-nandu");
    assert.ok(nueva.nueva && nueva.corto === "Accesorios" && nueva.productos === 0);
    assert.equal(lista.nuevas, 1);
    assert.equal((await cat(env, cookie, { accion: "crear", categoria: { nombre: "accesorios ñandú" } })).status, 400, "nombre repetido");
    assert.equal((await cat(env, cookie, { accion: "crear", categoria: { nombre: "x" } })).status, 400);
    // Un producto se puede mover a la categoría nueva desde el panel.
    const g = await panel.productos.onRequestPost({ env, request: req("/x", { cookie, cuerpo: { accion: "guardar", producto: { id: "gatito", nombre: "Gatito", precio: 18000, disponible: 3, categoria: "accesorios-nandu", tipo: "fisico" } } }) });
    assert.equal(g.status, 200);
    assert.equal((await catalogo.obtener(env)).deCategoria("accesorios-nandu").length, 1);
  });

  await prueba("borrar: solo vacías (avisa cuántos productos tiene); del sitio u otra nueva; sin sesión ni desde otro sitio no", async () => {
    const { env } = entorno();
    const cookie = await instalarYEntrar(env);
    const lleno = await cat(env, cookie, { accion: "borrar", id: "peluches" });
    assert.equal(lleno.status, 409);
    assert.match((await json(lleno)).message, /1 producto/);
    const nueva = (await json(await cat(env, cookie, { accion: "crear", categoria: { nombre: "Temporal" } }))).id;
    assert.equal((await panel.categorias.onRequestPost({ env, request: req("/x", { cuerpo: { accion: "borrar", id: nueva } }) })).status, 401);
    assert.equal((await cat(env, cookie, { accion: "borrar", id: nueva }, "https://malo.com")).status, 403);
    assert.equal((await cat(env, cookie, { accion: "borrar", id: nueva })).status, 200);
    // Categoría del sitio, vacía: se oculta (y su id no se puede volver a usar para una nueva).
    await panel.productos.onRequestPost({ env, request: req("/x", { cookie, cuerpo: { accion: "eliminar", id: "curso" } }) });
    assert.equal((await cat(env, cookie, { accion: "borrar", id: "cursos" })).status, 200);
    const vigente = await catalogo.obtener(env);
    assert.deepEqual(vigente.categorias.map((c) => c.id), ["peluches"]);
    const otra = await json(await cat(env, cookie, { accion: "crear", categoria: { nombre: "Cursos" } }));
    assert.equal(otra.id, "cursos-2", "no reutiliza la dirección de una categoría del sitio borrada");
    assert.equal((await cat(env, cookie, { accion: "borrar", id: "no-existe" })).status, 404);
    assert.equal((await cat(env, cookie, { accion: "borrar", id: otra.id })).status, 200);
    assert.equal((await cat(env, cookie, { accion: "borrar", id: "peluches" })).status, 409, "la última nunca se borra (y tiene productos)");
  });

  await prueba("crear: tope de categorías nuevas", async () => {
    const { env } = entorno();
    const cookie = await instalarYEntrar(env);
    for (let i = 0; i < MAXIMO_NUEVAS; i++) assert.equal((await cat(env, cookie, { accion: "crear", categoria: { nombre: `Nueva ${i}` } })).status, 200);
    const pasada = await cat(env, cookie, { accion: "crear", categoria: { nombre: "Una más" } });
    assert.equal(pasada.status, 400);
    assert.match((await json(pasada)).message, /hasta/);
  });

  console.log("Panel — anular pedidos:");

  async function pedidoPagado(env: EnvPanel, orden: string, cantidad = 2) {
    const kv = env.REVIEWS_KV!;
    const lineas = [{ productoId: "gatito", nombre: "Gatito", precioUnitario: 18000, cantidad, subtotal: 18000 * cantidad }];
    await kv.put(`pago:pedido:${orden}`, JSON.stringify({ orden, descripcion: "Compra", moneda: "CLP", email: "ana@correo.cl", proveedor: "flow", monto: 18000 * cantidad, estado: "pagada", creado: new Date().toISOString(), actualizado: "", metadata: { comprador: { nombre: "Ana" }, lineas, requiereDespacho: true, tieneDigitales: false } }));
    // Lo mismo que hace `compra` al confirmar el pago: descuenta stock y marca.
    await registrarVenta(catalogo, env, lineas);
    await kv.put(`compra:procesado:${orden}`, "1");
  }
  const resumenDe = async (env: EnvPanel, cookie: string) => json(await panel.resumen.onRequestGet({ env, request: req("/api/admin/resumen", { cookie }) }));

  await prueba("anular: sale de las ventas (y no vuelve), repone el stock y queda marcado; después se puede borrar", async () => {
    const { env, datos } = entorno();
    const cookie = await instalarYEntrar(env);
    await pedidoPagado(env, "PRUEBA1", 2);
    await pedidoPagado(env, "REAL1", 1);
    assert.equal((await productoDisponible(catalogo, env, "gatito"))!.stock, 0);
    const antes = await resumenDe(env, cookie);
    assert.equal(antes.periodos.d30.ventas, 54000);
    assert.equal(antes.porDespachar, 2);

    const lista = await json(await panel.pedidos.onRequestGet({ env, request: req("/x", { cookie }) }));
    assert.equal(lista.puedeAnular, true, "el dueño puede anular");
    const borrarAntes = await panel.pedidos.onRequestPost({ env, request: req("/x", { cookie, cuerpo: { accion: "borrar", orden: "PRUEBA1" } }) });
    assert.equal(borrarAntes.status, 409, "no se borra un pedido sin anular");

    const r = await json(await panel.pedidos.onRequestPost({ env, request: req("/x", { cookie, cuerpo: { accion: "anular", orden: "PRUEBA1" } }) }));
    assert.equal(r.anulado.stockDevuelto, true);
    assert.equal((await productoDisponible(catalogo, env, "gatito"))!.stock, 2, "las 2 unidades vuelven al stock");
    const dos = await panel.pedidos.onRequestPost({ env, request: req("/x", { cookie, cuerpo: { accion: "anular", orden: "PRUEBA1" } }) });
    assert.equal(dos.status, 409, "anular dos veces no devuelve stock dos veces");
    assert.equal((await productoDisponible(catalogo, env, "gatito"))!.stock, 2);

    for (let i = 0; i < 2; i++) {
      const despues = await resumenDe(env, cookie);
      assert.equal(despues.periodos.d30.ventas, 18000, "el anulado ya no suma (ni al ponerse al día)");
      assert.equal(despues.periodos.d30.pedidos, 1);
      assert.deepEqual(despues.topProductos[0], { nombre: "Gatito", unidades: 1, ventas: 18000 });
      assert.equal(despues.porDespachar, 1);
    }
    const marcado = (await json(await panel.pedidos.onRequestGet({ env, request: req("/x", { cookie }) }))).pedidos.find((p: any) => p.orden === "PRUEBA1");
    assert.equal(marcado.anulado.por, "sasha");

    const borrado = await panel.pedidos.onRequestPost({ env, request: req("/x", { cookie, cuerpo: { accion: "borrar", orden: "PRUEBA1" } }) });
    assert.equal(borrado.status, 200);
    assert.ok(!datos.has("pago:pedido:PRUEBA1") && !datos.has("compra:anulado:PRUEBA1"));
    assert.equal((await resumenDe(env, cookie)).periodos.d30.ventas, 18000, "borrar no cambia las ventas");
    assert.equal((await productoDisponible(catalogo, env, "gatito"))!.stock, 2, "borrar no toca el stock");
  });

  await prueba("anular/borrar: el dueño o un invitado con permiso, con sesión y mismo origen; acción u orden inválida no", async () => {
    const { env } = entorno();
    const cookie = await instalarYEntrar(env);
    await pedidoPagado(env, "ORD9", 1);
    assert.equal((await panel.pedidos.onRequestPost({ env, request: req("/x", { cuerpo: { accion: "anular", orden: "ORD9" } }) })).status, 401);
    const csrf = await panel.pedidos.onRequestPost({ env, request: req("/x", { cookie, origen: "https://malo.com", cuerpo: { accion: "anular", orden: "ORD9" } }) });
    assert.equal(csrf.status, 403);
    for (const cuerpo of [{ accion: "anular", orden: "../x" }, { accion: "destruir", orden: "ORD9" }, { accion: "anular" }]) {
      assert.equal((await panel.pedidos.onRequestPost({ env, request: req("/x", { cookie, cuerpo }) })).status, 400, JSON.stringify(cuerpo));
    }
    assert.equal((await panel.pedidos.onRequestPost({ env, request: req("/x", { cookie, cuerpo: { accion: "anular", orden: "NOEXISTE" } }) })).status, 404);
    // Una invitada: ve los pedidos, pero no puede anular ni borrar.
    const inv = await json(await panel.seguridad.onRequestPost({ env, request: req("/x", { cookie, cuerpo: { accion: "invitar", horas: 24, derivado: D1 } }) }));
    await panel.instalar.onRequestPost({ env, request: req("/api/admin/instalar", { cuerpo: { invitacion: inv.token, usuario: "ayudante", derivado: "d".repeat(64) } }) });
    const entra = await panel.entrar.onRequestPost({ env, request: req("/x", { cuerpo: { usuario: "ayudante", derivado: "d".repeat(64) } }) });
    const cookieInv = cookieDe(entra, "mc_sesion");
    const vista = await json(await panel.pedidos.onRequestGet({ env, request: req("/x", { cookie: cookieInv }) }));
    assert.equal(vista.puedeAnular, false);
    assert.equal(vista.pedidos.length, 1);
    const intento = await panel.pedidos.onRequestPost({ env, request: req("/x", { cookie: cookieInv, cuerpo: { accion: "anular", orden: "ORD9" } }) });
    assert.equal(intento.status, 403);
    assert.equal((await productoDisponible(catalogo, env, "gatito"))!.stock, 2, "nada cambió");
    // La invitada no se puede dar el permiso a sí misma.
    const solita = await panel.seguridad.onRequestPost({ env, request: req("/x", { cookie: cookieInv, cuerpo: { accion: "permiso-pedidos", usuario: "ayudante", valor: true } }) });
    assert.equal(solita.status, 403);
    // El dueño se lo da: ahora sí puede anular y borrar.
    for (const malo of [{ usuario: "ayudante", valor: "si" }, { usuario: "nadie", valor: true }]) {
      assert.equal((await panel.seguridad.onRequestPost({ env, request: req("/x", { cookie, cuerpo: { accion: "permiso-pedidos", ...malo } }) })).status, 400, JSON.stringify(malo));
    }
    assert.equal((await panel.seguridad.onRequestPost({ env, request: req("/x", { cookie, cuerpo: { accion: "permiso-pedidos", usuario: "ayudante", valor: true } }) })).status, 200);
    const usuarios = (await json(await panel.seguridad.onRequestGet({ env, request: req("/x", { cookie }) }))).usuarios as { usuario: string; puedeAnularPedidos: boolean }[];
    assert.deepEqual(usuarios.map((u) => u.puedeAnularPedidos), [true, true]);
    assert.equal((await json(await panel.pedidos.onRequestGet({ env, request: req("/x", { cookie: cookieInv }) }))).puedeAnular, true);
    const anulada = await json(await panel.pedidos.onRequestPost({ env, request: req("/x", { cookie: cookieInv, cuerpo: { accion: "anular", orden: "ORD9" } }) }));
    assert.equal(anulada.anulado.por, "ayudante", "queda registrado quién anuló");
    assert.equal((await panel.pedidos.onRequestPost({ env, request: req("/x", { cookie: cookieInv, cuerpo: { accion: "borrar", orden: "ORD9" } }) })).status, 200);
    // Se lo quita: vuelve a no poder.
    await pedidoPagado(env, "ORD10", 1);
    assert.equal((await panel.seguridad.onRequestPost({ env, request: req("/x", { cookie, cuerpo: { accion: "permiso-pedidos", usuario: "ayudante", valor: false } }) })).status, 200);
    assert.equal((await panel.pedidos.onRequestPost({ env, request: req("/x", { cookie: cookieInv, cuerpo: { accion: "anular", orden: "ORD10" } }) })).status, 403);
  });

  console.log("Panel — restablecer doble factor:");

  await prueba("restablecer doble factor: solo el dueño, solo a invitados; cierra sesiones y deja entrar solo con contraseña", async () => {
    const { env } = entorno();
    const cookie = await instalarYEntrar(env);
    const inv = await json(await panel.seguridad.onRequestPost({ env, request: req("/x", { cookie, cuerpo: { accion: "invitar", horas: 24, derivado: D1 } }) }));
    const DI = "d".repeat(64);
    await panel.instalar.onRequestPost({ env, request: req("/api/admin/instalar", { cuerpo: { invitacion: inv.token, usuario: "ayudante", derivado: DI } }) });
    const entrarInv = () => panel.entrar.onRequestPost({ env, request: req("/x", { cuerpo: { usuario: "ayudante", derivado: DI } }) });
    let cookieInv = cookieDe(await entrarInv(), "mc_sesion");
    // La invitada activa su doble factor.
    const prop = await json(await panel.seguridad.onRequestPost({ env, request: req("/x", { cookie: cookieInv, cuerpo: { accion: "proponer" } }) }));
    assert.ok(String(prop.qr).startsWith("<svg"));
    const secreto = (await descifrarSecreto((await obtenerUsuario(env, "ayudante"))!.propuesta!.secreto, PEPPER))!;
    const codigo = await codigoPara(secreto, Math.floor(Date.now() / 1000 / PERIODO));
    const act = await panel.seguridad.onRequestPost({ env, request: req("/x", { cookie: cookieInv, cuerpo: { accion: "activar", codigo } }) });
    assert.equal(act.status, 200);
    assert.ok((await obtenerUsuario(env, "ayudante"))?.dosFactores, "quedó con doble factor");
    // Sin sesión, CSRF, invitada a sí misma y objetivos inválidos: no.
    assert.equal((await panel.seguridad.onRequestPost({ env, request: req("/x", { cuerpo: { accion: "restablecer-2fa", usuario: "ayudante" } }) })).status, 401);
    assert.equal((await panel.seguridad.onRequestPost({ env, request: req("/x", { cookie, origen: "https://malo.com", cuerpo: { accion: "restablecer-2fa", usuario: "ayudante" } }) })).status, 403);
    assert.equal((await panel.seguridad.onRequestPost({ env, request: req("/x", { cookie: cookieInv, cuerpo: { accion: "restablecer-2fa", usuario: "ayudante" } }) })).status, 403, "un invitado no se lo hace a sí mismo");
    for (const usuario of ["sasha", "nadie", ""]) {
      assert.equal((await panel.seguridad.onRequestPost({ env, request: req("/x", { cookie, cuerpo: { accion: "restablecer-2fa", usuario } }) })).status, 400, usuario);
    }
    assert.ok((await obtenerUsuario(env, "ayudante"))?.dosFactores, "los intentos malos no tocaron nada");
    // El dueño lo restablece.
    assert.equal((await panel.seguridad.onRequestPost({ env, request: req("/x", { cookie, cuerpo: { accion: "restablecer-2fa", usuario: "ayudante" } }) })).status, 200);
    assert.equal((await obtenerUsuario(env, "ayudante"))?.dosFactores, undefined);
    assert.equal((await panel.sesion.onRequestGet({ env, request: req("/x", { cookie: cookieInv }) })).status, 401, "su sesión vieja se cerró");
    const nueva = await entrarInv();
    assert.equal((await json(nueva)).segundoFactor, undefined, "ya no pide código");
    cookieInv = cookieDe(nueva, "mc_sesion");
    assert.ok(cookieInv, "entra solo con contraseña");
    // Repetirlo: ya no tiene doble factor.
    assert.equal((await panel.seguridad.onRequestPost({ env, request: req("/x", { cookie, cuerpo: { accion: "restablecer-2fa", usuario: "ayudante" } }) })).status, 400);
    // Lo ve como "sin doble factor" en la lista.
    const lista = (await json(await panel.seguridad.onRequestGet({ env, request: req("/x", { cookie }) }))).usuarios as { usuario: string; dobleFactor: boolean }[];
    assert.equal(lista.find((u) => u.usuario === "ayudante")!.dobleFactor, false);
  });

  console.log("Panel — sitio en construcción:");

  await prueba("construcción: el panel lo enciende y apaga; el aviso lo respeta y quien tiene sesión ve la tienda", async () => {
    const { crearAvisoConstruccion } = await import("../modulos/construccion/index");
    const { env } = entorno();
    const cookie = await instalarYEntrar(env);
    const aviso = crearAvisoConstruccion({ nombreSitio: "Tienda", rutasLibres: ["/admin", "/api/admin/"] });
    const visitar = (cookieVisita?: string) =>
      aviso.onRequest({ request: req("/tienda/", { cookie: cookieVisita }), env, next: async () => new Response("REAL") });
    // Sin sesión, CSRF y cuerpos malos.
    assert.equal((await panel.construccion.onRequestGet({ env, request: req("/x") })).status, 401);
    assert.equal((await panel.construccion.onRequestPost({ env, request: req("/x", { cuerpo: { accion: "cambiar", activo: true } }) })).status, 401);
    assert.equal((await panel.construccion.onRequestPost({ env, request: req("/x", { cookie, origen: "https://malo.com", cuerpo: { accion: "cambiar", activo: true } }) })).status, 403);
    for (const cuerpo of [{ accion: "cambiar", activo: "si" }, { accion: "borrar", activo: true }, {}]) {
      assert.equal((await panel.construccion.onRequestPost({ env, request: req("/x", { cookie, cuerpo }) })).status, 400, JSON.stringify(cuerpo));
    }
    // Apagado: abierto, sin cookie de vista previa.
    const g0 = await panel.construccion.onRequestGet({ env, request: req("/x", { cookie }) });
    assert.equal((await json(g0)).activo, false);
    assert.equal(cookieDe(g0, "__Host-previa"), "");
    assert.equal(await (await visitar()).text(), "REAL");
    // Encender: el público ve el aviso; quien encendió queda registrado y recibe la cookie.
    const on = await panel.construccion.onRequestPost({ env, request: req("/x", { cookie, cuerpo: { accion: "cambiar", activo: true } }) });
    const d = await json(on);
    assert.equal(d.activo, true);
    assert.equal(d.forzado, false);
    assert.equal(d.por, "sasha");
    const previa = cookieDe(on, "__Host-previa");
    assert.ok(previa.length > 20, "da la cookie de vista previa");
    assert.equal((await visitar()).status, 503);
    assert.equal(await (await visitar(previa)).text(), "REAL", "con la cookie ve la tienda");
    assert.equal((await visitar("__Host-previa=" + "0".repeat(64))).status, 503, "cookie inventada no sirve");
    // La cookie viene de una clave derivada (no hay ACCESO_PREVIA): no es la pimienta ni la contiene.
    assert.ok(!previa.includes(PEPPER));
    // Apagar.
    const off = await json(await panel.construccion.onRequestPost({ env, request: req("/x", { cookie, cuerpo: { accion: "cambiar", activo: false } }) }));
    assert.equal(off.activo, false);
    assert.equal(await (await visitar()).text(), "REAL");
  });

  await prueba("construcción: si lo fuerza la variable de Cloudflare, el panel no lo apaga; un invitado puede encenderlo", async () => {
    const { env } = entorno();
    const cookie = await instalarYEntrar(env);
    const inv = await json(await panel.seguridad.onRequestPost({ env, request: req("/x", { cookie, cuerpo: { accion: "invitar", horas: 24, derivado: D1 } }) }));
    await panel.instalar.onRequestPost({ env, request: req("/api/admin/instalar", { cuerpo: { invitacion: inv.token, usuario: "ayudante", derivado: "d".repeat(64) } }) });
    const cookieInv = cookieDe(await panel.entrar.onRequestPost({ env, request: req("/x", { cuerpo: { usuario: "ayudante", derivado: "d".repeat(64) } }) }), "mc_sesion");
    const r = await json(await panel.construccion.onRequestPost({ env, request: req("/x", { cookie: cookieInv, cuerpo: { accion: "cambiar", activo: true } }) }));
    assert.equal(r.por, "ayudante");
    const forzado = { ...env, CONSTRUCCION: "1" } as EnvPanel;
    const g = await json(await panel.construccion.onRequestGet({ env: forzado, request: req("/x", { cookie }) }));
    assert.equal(g.forzado, true);
    assert.equal((await panel.construccion.onRequestPost({ env: forzado, request: req("/x", { cookie, cuerpo: { accion: "cambiar", activo: false } }) })).status, 409);
  });

  console.log("Panel — mensajes de contacto:");

  await prueba("mensajes: el formulario avisa a la dueña (responder le llega al visitante) y queda en el panel", async () => {
    const { crearEndpointCotizacion } = await import("../modulos/cotizacion/index");
    const { env } = entorno();
    Object.assign(env, { TURNSTILE_SECRET_KEY: "secreto-turnstile", RESEND_API_KEY: "re_prueba", RESEND_FROM: "Tienda <hola@tienda.cl>", ADMIN_NOTIFY_EMAIL: "contacto@tienda.cl" });
    const cookie = await instalarYEntrar(env);
    const enviados: Record<string, any>[] = [];
    const fetchOriginal = globalThis.fetch;
    globalThis.fetch = (async (u: unknown, init?: RequestInit) => {
      const url = String(u);
      if (url.includes("turnstile")) return new Response(JSON.stringify({ success: true }), { status: 200 });
      if (url.includes("resend.com")) {
        enviados.push(JSON.parse(String(init?.body)));
        return new Response(JSON.stringify({ id: "x" }), { status: 200 });
      }
      throw new Error("fetch inesperado: " + url);
    }) as typeof fetch;
    try {
      const form = crearEndpointCotizacion(configContacto);
      const datos = { nombre: "Ana <b>Pérez</b>", email: "ana@correo.cl", telefono: "", categoria: "consulta", descripcion: "Hola, ¿tienen el gatito en color lila?\n<script>alert(1)</script>", aceptaPolitica: true, turnstileToken: "tok", sitio_web: "" };
      const r = await form.onRequestPost({ env, request: req("/api/contacto", { cuerpo: datos }) });
      assert.equal(r.status, 200);
      assert.equal(enviados.length, 1);
      const correo = enviados[0];
      assert.deepEqual([correo.to].flat(), ["contacto@tienda.cl"]);
      assert.equal([correo.reply_to].flat()[0], "ana@correo.cl", "al responder le llega a quien escribió");
      assert.match(correo.subject, /mensaje de Ana/);
      assert.match(correo.html, /Nuevo mensaje desde la página/);
      assert.doesNotMatch(correo.html, /<script>alert/);
      assert.doesNotMatch(correo.html, /presupuesto/);
      const malo = await form.onRequestPost({ env, request: req("/api/contacto", { cuerpo: { ...datos, categoria: "armas" } }) });
      assert.equal(malo.status, 400);
    } finally {
      globalThis.fetch = fetchOriginal;
    }
    const lista = await json(await panel.mensajes.onRequestGet({ env, request: req("/x", { cookie }) }));
    assert.equal(lista.pendientes, 1);
    const m = lista.mensajes[0];
    assert.equal(m.motivo, "Consulta por un producto");
    assert.equal(m.nombre, "Ana <b>Pérez</b>", "se entrega como texto; la pantalla lo pone con textContent");
    assert.equal(m.sinCorreo, false);
    const marcar = await panel.mensajes.onRequestPost({ env, request: req("/x", { cookie, cuerpo: { accion: "marcar", clave: m.clave, atendido: true } }) });
    assert.equal(marcar.status, 200);
    assert.equal((await json(await panel.mensajes.onRequestGet({ env, request: req("/x", { cookie }) }))).pendientes, 0);
    const borrar = await panel.mensajes.onRequestPost({ env, request: req("/x", { cookie, cuerpo: { accion: "eliminar", clave: m.clave } }) });
    assert.equal(borrar.status, 200);
    assert.equal((await json(await panel.mensajes.onRequestGet({ env, request: req("/x", { cookie }) }))).total, 0);
  });

  await prueba("mensajes: sin sesión nada; clave inventada no; desde otro sitio no; sin config no existe", async () => {
    const { env, datos } = entorno();
    const cookie = await instalarYEntrar(env);
    datos.set("cotizacion:2026-10-15T12:00:00.000Z:abcdef12", { v: JSON.stringify({ nombre: "B", email: "b@c.cl", categoria: "otro", descripcion: "un mensaje largo", fecha: "2026-10-15T12:00:00.000Z", correoEnviado: false }) });
    assert.equal((await panel.mensajes.onRequestGet({ env, request: req("/x") })).status, 401);
    const lista = await json(await panel.mensajes.onRequestGet({ env, request: req("/x", { cookie }) }));
    assert.equal(lista.mensajes[0].sinCorreo, true, "avisa que el correo no salió");
    for (const clave of ["suscriptor:x", "admin:usuario", "cotizacion:../../x", 5]) {
      const r = await panel.mensajes.onRequestPost({ env, request: req("/x", { cookie, cuerpo: { accion: "eliminar", clave } }) });
      assert.equal(r.status, 400, String(clave));
    }
    const csrf = await panel.mensajes.onRequestPost({ env, request: req("/x", { cookie, origen: "https://malo.com", cuerpo: { accion: "eliminar", clave: "cotizacion:2026-10-15T12:00:00.000Z:abcdef12" } }) });
    assert.equal(csrf.status, 403);
    assert.ok(datos.has("cotizacion:2026-10-15T12:00:00.000Z:abcdef12"));
    const sin = crearPanel({ nombreSitio: "X" });
    assert.equal((await sin.mensajes.onRequestGet({ env, request: req("/x", { cookie }) })).status, 404);
  });

  console.log(`\n${pasaron} pruebas pasaron.`);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
