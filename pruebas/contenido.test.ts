/**
 * Prueba del contenido editable: validación por tipo, guardado de solo lo
 * cambiado, tema (colores y tipografías) y lo que pone el borde.
 * Se corre con `npm test`.
 */
import assert from "node:assert/strict";
import type { AlmacenKV } from "../core/tipos";
import {
  contraste,
  crearContenidoEditable,
  enlacesTema,
  hrefDe,
  jsonLdFaq,
  oscurecer,
  validarValor,
  type Campo,
  type Esquema,
} from "../modulos/contenido/index";

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

const ESQUEMA: Esquema = {
  grupos: [
    { id: "colores", titulo: "Colores" },
    { id: "tipografias", titulo: "Tipografías" },
    { id: "textos", titulo: "Textos" },
  ],
  campos: [
    { clave: "colores.acento", grupo: "colores", etiqueta: "Botones", tipo: "color", variable: "--c-acento" },
    { clave: "colores.fondo", grupo: "colores", etiqueta: "Fondo", tipo: "color", variable: "--c-fondo" },
    { clave: "fuentes.titulo", grupo: "tipografias", etiqueta: "Títulos", tipo: "fuente", rol: "titulo", variable: "--fuente-titulo" },
    { clave: "fuentes.texto", grupo: "tipografias", etiqueta: "Texto", tipo: "fuente", rol: "texto", variable: "--fuente-texto" },
    { clave: "inicio.titulo", grupo: "textos", etiqueta: "Título", tipo: "texto", max: 20 },
    { clave: "inicio.parrafo", grupo: "textos", etiqueta: "Párrafo", tipo: "parrafo", opcional: true },
    { clave: "inicio.foto", grupo: "textos", etiqueta: "Foto", tipo: "imagen" },
    { clave: "contacto.whatsapp", grupo: "textos", etiqueta: "WhatsApp", tipo: "telefono", enlace: "whatsapp", mensajeDe: "contacto.mensaje", opcional: true },
    { clave: "contacto.mensaje", grupo: "textos", etiqueta: "Mensaje", tipo: "texto", opcional: true },
    { clave: "redes.instagram", grupo: "textos", etiqueta: "Instagram", tipo: "url", red: "instagram", opcional: true },
    { clave: "faq.1.pregunta", grupo: "textos", etiqueta: "P1", tipo: "texto", opcional: true },
    { clave: "faq.1.respuesta", grupo: "textos", etiqueta: "R1", tipo: "parrafo", opcional: true },
    { clave: "faq.2.pregunta", grupo: "textos", etiqueta: "P2", tipo: "texto", opcional: true },
    { clave: "faq.2.respuesta", grupo: "textos", etiqueta: "R2", tipo: "parrafo", opcional: true },
  ],
};
const INICIALES = {
  "colores.acento": "#d81b72",
  "colores.fondo": "#fffafc",
  "fuentes.titulo": "caveat-brush",
  "fuentes.texto": "nunito",
  "inicio.titulo": "Hola",
  "inicio.parrafo": "",
  "inicio.foto": "/img/portada/cursos.webp",
  "contacto.whatsapp": "+56 9 8850 9255",
  "contacto.mensaje": "Hola, vengo del sitio",
  "redes.instagram": "",
  "faq.1.pregunta": "¿Envían?",
  "faq.1.respuesta": "Sí.",
  "faq.2.pregunta": "",
  "faq.2.respuesta": "",
};
const campo = (clave: string) => ESQUEMA.campos.find((c) => c.clave === clave) as Campo;
const opciones = {
  derivar: (v: Record<string, string>) => ({ "--c-acento-oscuro": oscurecer(v["colores.acento"], 0.2) }),
  contraste: [{ texto: "#ffffff", fondo: "colores.acento", minimo: 4.5, descripcion: "Texto de los botones" }],
};

async function run() {
  console.log("Contenido — validación:");

  await prueba("texto: largo máximo, sin caracteres de control; obligatorio no queda vacío", () => {
    assert.ok(!validarValor(campo("inicio.titulo"), "x".repeat(21)).ok);
    assert.ok(!validarValor(campo("inicio.titulo"), "   ").ok);
    const r = validarValor(campo("inicio.titulo"), " Hola\u0000‮ mundo ");
    assert.ok(r.ok && r.valor === "Hola mundo");
    assert.ok(validarValor(campo("inicio.parrafo"), "").ok, "opcional puede quedar vacío");
  });

  await prueba("color: solo #rrggbb (nada de url(), expresiones ni nombres)", () => {
    assert.ok(validarValor(campo("colores.acento"), "#ABCDEF").ok);
    for (const malo of ["red", "#fff", "#12345g", "url(x)", "#123456;background:red", "expression(alert(1))"]) {
      assert.ok(!validarValor(campo("colores.acento"), malo).ok, malo);
    }
  });

  await prueba("tipografía: solo de la lista y del rol correcto", () => {
    assert.ok(validarValor(campo("fuentes.titulo"), "pacifico").ok);
    assert.ok(!validarValor(campo("fuentes.titulo"), "Comic Sans").ok);
    assert.ok(!validarValor(campo("fuentes.texto"), "pacifico").ok, "Pacifico no sirve para texto largo");
  });

  await prueba("foto: solo /img/ o /media/; enlaces y teléfonos se normalizan", () => {
    assert.ok(!validarValor(campo("inicio.foto"), "https://otro.cl/x.png").ok);
    assert.ok(!validarValor(campo("inicio.foto"), "/img/../x").ok);
    assert.ok(validarValor(campo("inicio.foto"), "/media/sitio-inicio-foto-a1b2c3d4e5f6").ok);
    const red = validarValor(campo("redes.instagram"), "@sasha.tejidos");
    assert.ok(red.ok && red.valor.startsWith("https://www.instagram.com/"));
    assert.ok(!validarValor(campo("redes.instagram"), "https://facebook.com/x").ok, "un Facebook no pasa como Instagram");
    const tel = validarValor(campo("contacto.whatsapp"), "9 8850 9255");
    assert.ok(tel.ok && tel.valor === "+56 9 8850 9255");
  });

  console.log("Contenido — guardado y tema:");

  await prueba("solo se guarda lo cambiado; volver al valor original lo quita", async () => {
    const { kv, datos } = kvMemoria();
    const env = { REVIEWS_KV: kv };
    const f = crearContenidoEditable(ESQUEMA, INICIALES, opciones);
    assert.equal((await f.obtener(env)).editado, false);
    assert.ok((await f.guardar(env, { "inicio.titulo": "Bienvenida", "colores.fondo": "#fffafc" })).ok);
    assert.deepEqual(JSON.parse(datos.get("contenido:valores")!), { "inicio.titulo": "Bienvenida" });
    const e = await f.obtener(env);
    assert.equal(e.editado, true);
    assert.equal(e.temaEditado, false, "un texto no carga el tema");
    await f.guardar(env, { "inicio.titulo": "Hola" });
    assert.ok(!datos.has("contenido:valores"), "volvió a lo original: no queda nada guardado");
  });

  await prueba("un error en un campo no guarda nada de ese envío", async () => {
    const { kv, datos } = kvMemoria();
    const f = crearContenidoEditable(ESQUEMA, INICIALES, opciones);
    const r = await f.guardar({ REVIEWS_KV: kv }, { "inicio.titulo": "Nuevo", "colores.acento": "rojo" });
    assert.ok(!r.ok && r.errores?.["colores.acento"]);
    assert.equal(datos.size, 0);
  });

  await prueba("tema: CSS solo con valores válidos, derivados incluidos; la versión cambia con el tema", async () => {
    const { kv } = kvMemoria();
    const env = { REVIEWS_KV: kv };
    const f = crearContenidoEditable(ESQUEMA, INICIALES, opciones);
    await f.guardar(env, { "colores.acento": "#2255aa", "fuentes.titulo": "pacifico" });
    const e = await f.obtener(env);
    assert.equal(e.temaEditado, true);
    const css = f.css(e);
    assert.match(css, /--c-acento: #2255aa;/);
    assert.match(css, /--c-acento-oscuro: #[0-9a-f]{6};/);
    assert.match(css, /--fuente-titulo: "Pacifico", cursive;/);
    assert.deepEqual(e.fuentesExtra, ["/fuentes/pacifico/fuente.css"], "solo la tipografía nueva (las del sitio ya vienen)");
    const v1 = e.version;
    await f.guardar(env, { "colores.acento": "#2255ab" });
    assert.notEqual((await f.obtener(env)).version, v1);
    const head = enlacesTema(await f.obtener(env));
    assert.match(head, /^<link rel="stylesheet" href="\/fuentes\/pacifico\/fuente\.css"><link rel="stylesheet" href="\/tema\.css\?v=[a-z0-9]+">$/);
  });

  await prueba("restablecer por claves deja el resto; datos dañados en KV no rompen", async () => {
    const { kv, datos } = kvMemoria();
    const env = { REVIEWS_KV: kv };
    const f = crearContenidoEditable(ESQUEMA, INICIALES, opciones);
    await f.guardar(env, { "inicio.titulo": "Otro", "colores.acento": "#112233" });
    const r = await f.restablecer(env, ["colores.acento"]);
    assert.deepEqual(r.anteriores, { "colores.acento": "#112233" });
    assert.deepEqual(JSON.parse(datos.get("contenido:valores")!), { "inicio.titulo": "Otro" });
    datos.set("contenido:valores", JSON.stringify({ "colores.acento": "url(javascript:x)", "inicio.titulo": "Bien" }));
    const otra = crearContenidoEditable(ESQUEMA, INICIALES, opciones);
    const e = await otra.obtener(env);
    assert.equal(e.valores["colores.acento"], "#d81b72", "el color malo guardado se ignora");
  });

  await prueba("avisos de contraste (incluye derivados); no impiden guardar", async () => {
    const { kv } = kvMemoria();
    const f = crearContenidoEditable(ESQUEMA, INICIALES, opciones);
    assert.equal(f.avisos({}).length, 0, "el fucsia del sitio tiene buen contraste con blanco");
    assert.ok(contraste("#ffffff", "#ffd0e0") < 4.5);
    const r = await f.guardar({ REVIEWS_KV: kv }, { "colores.acento": "#ffd0e0" });
    assert.ok(r.ok);
    const avisos = f.avisos({ "colores.acento": "#ffd0e0" });
    assert.equal(avisos.length, 1);
    assert.match(avisos[0].mensaje, /Texto de los botones/);
  });

  await prueba("un esquema inicial inválido avisa al construir el sitio", () => {
    assert.throws(() => crearContenidoEditable(ESQUEMA, { ...INICIALES, "colores.acento": "rojo" }));
  });

  console.log("Contenido — borde:");

  await prueba("enlaces: WhatsApp con su mensaje, Instagram tal cual; vacío = sin enlace", () => {
    const v = { ...INICIALES };
    assert.equal(hrefDe(campo("contacto.whatsapp"), v), "https://wa.me/56988509255?text=Hola%2C%20vengo%20del%20sitio");
    assert.equal(hrefDe(campo("redes.instagram"), v), "");
    assert.equal(hrefDe(campo("redes.instagram"), { ...v, "redes.instagram": "https://www.instagram.com/x" }), "https://www.instagram.com/x");
  });

  await prueba("preguntas frecuentes: JSON-LD solo con pares completos y sin poder cerrar el <script>", () => {
    const ld = jsonLdFaq("faq", { ...INICIALES, "faq.2.pregunta": "</script><script>alert(1)", "faq.2.respuesta": "x" });
    assert.ok(!ld.includes("</script>"));
    const datos = JSON.parse(ld);
    assert.equal(datos.mainEntity.length, 2);
    assert.equal(JSON.parse(jsonLdFaq("faq", INICIALES)).mainEntity.length, 1, "la pregunta vacía no se publica");
  });

  console.log(`\n${pasaron} pruebas pasaron.`);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
