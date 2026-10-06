/**
 * Prueba del carrusel: validación, marcado (escape), almacén y borde.
 * Se corre con `npm test`.
 */
import assert from "node:assert/strict";
import type { AlmacenKV } from "../core/tipos";
import {
  crearBordeCarrusel,
  crearCarruselEditable,
  enlaceValido,
  ErrorCarrusel,
  htmlCarrusel,
  imagenValida,
  validarCarrusel,
  type EstadoCarrusel,
} from "../modulos/carrusel/index";

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

const BASE: EstadoCarrusel = {
  segundos: 6,
  automatico: true,
  diapositivas: [
    {
      id: "bienvenida",
      imagen: "/img/portada/portada.webp",
      imagenAlt: "Gatito tejido",
      antetitulo: "Bienvenida a",
      titulo: "Sasha Anette",
      subtitulo: "Tejidos",
      texto: "Hecho a mano.",
      boton: { texto: "Ver productos", enlace: "/tienda/" },
    },
    { id: "flores", imagen: "/img/portada/cursos.webp", imagenAlt: "Flores tejidas", titulo: "Flores" },
  ],
};
const copia = (): EstadoCarrusel => JSON.parse(JSON.stringify(BASE));

/** HTMLRewriter mínimo para Node: reemplaza el interior del <section data-carrusel="…">. */
function instalarReescritorFalso() {
  (globalThis as Record<string, unknown>).HTMLRewriter = class {
    private reglas: { selector: string; h: { element(el: unknown): void } }[] = [];
    on(selector: string, h: { element(el: unknown): void }) {
      this.reglas.push({ selector, h });
      return this;
    }
    transform(r: Response) {
      const reglas = this.reglas;
      const cuerpo = r.text().then((html) => {
        for (const { selector, h } of reglas) {
          const nombre = /data-carrusel="([^"]+)"/.exec(selector)![1];
          const re = new RegExp(`(<section[^>]*data-carrusel="${nombre}"[^>]*)>([\\s\\S]*?)</section>`);
          html = html.replace(re, (_t, apertura: string) => {
            let abrir = apertura;
            let interior = "";
            h.element({
              setAttribute: (k: string, v: string) => {
                abrir = abrir.replace(new RegExp(`\\s${k}="[^"]*"`), "") + ` ${k}="${v}"`;
              },
              setInnerContent: (c: string) => (interior = c),
            });
            return `${abrir}>${interior}</section>`;
          });
        }
        return html;
      });
      return new Response(new ReadableStream({ async start(c) { c.enqueue(new TextEncoder().encode(await cuerpo)); c.close(); } }), {
        headers: r.headers,
      });
    }
  };
}

async function run() {
  console.log("Carrusel — validación:");

  await prueba("acepta un carrusel correcto y completa los valores por defecto", () => {
    const r = validarCarrusel({ diapositivas: [{ imagen: "/media/portada-abc123", imagenAlt: "Una foto" }] });
    assert.ok(r.ok);
    if (!r.ok) return;
    assert.equal(r.datos.segundos, 6);
    assert.equal(r.datos.automatico, true);
    assert.equal(r.datos.diapositivas[0].enfoque, "centro");
    assert.match(r.datos.diapositivas[0].id, /^d-[0-9a-f]{8}$/, "id nuevo si no trae");
  });

  await prueba("fotos: solo /img/ y /media/, sin '..' ni sitios externos", () => {
    assert.ok(imagenValida("/img/portada/portada.webp"));
    assert.ok(imagenValida("/media/portada-a1b2c3"));
    for (const malo of ["/img/../admin", "https://otro.cl/x.png", "//otro.cl/x.png", "javascript:alert(1)", "/img/x y.png", "data:image/png;base64,AA"]) {
      assert.ok(!imagenValida(malo), malo);
    }
  });

  await prueba("enlace del botón: página del sitio o https; nunca javascript:, data:, http: ni //otro", () => {
    for (const bueno of ["/", "/tienda/", "/tienda/flores/?orden=precio#top", "https://wa.me/56988509255", "https://www.instagram.com/sasha"]) {
      assert.ok(enlaceValido(bueno), bueno);
    }
    for (const malo of ["javascript:alert(1)", "JaVaScRiPt:alert(1)", "data:text/html,x", "http://otro.cl", "//otro.cl", "/\\otro.cl", "https://usuario:clave@otro.cl", "tienda", " /tienda"]) {
      assert.ok(!enlaceValido(malo), malo);
    }
  });

  await prueba("errores por campo con la posición de la diapositiva", () => {
    const e = copia();
    e.diapositivas[1].imagenAlt = "";
    e.diapositivas[1].boton = { texto: "Ir", enlace: "javascript:alert(1)" };
    e.diapositivas[0].titulo = "x".repeat(61);
    const r = validarCarrusel(e);
    assert.ok(!r.ok);
    if (r.ok) return;
    assert.ok(r.errores["1.imagenAlt"]);
    assert.ok(r.errores["1.enlace"]);
    assert.ok(r.errores["0.titulo"]);
    assert.match(r.mensaje, /diapositiva/);
  });

  await prueba("botón a medias: texto sin enlace o enlace sin texto", () => {
    const a = copia();
    a.diapositivas[0].boton = { texto: "Ver", enlace: "" };
    const ra = validarCarrusel(a);
    assert.ok(!ra.ok && ra.errores["0.enlace"]);
    const b = copia();
    b.diapositivas[0].boton = { texto: "", enlace: "/tienda/" };
    const rb = validarCarrusel(b);
    assert.ok(!rb.ok && rb.errores["0.botonTexto"]);
  });

  await prueba("límites: al menos 1, máximo 8 diapositivas; entre 4 y 15 segundos", () => {
    assert.ok(!validarCarrusel({ diapositivas: [] }).ok);
    const muchas = Array.from({ length: 9 }, () => ({ imagen: "/img/a.webp", imagenAlt: "Foto" }));
    const r = validarCarrusel({ diapositivas: muchas });
    assert.ok(!r.ok && /Máximo 8/.test(r.mensaje));
    assert.ok(!validarCarrusel({ ...copia(), segundos: 3 }).ok);
    assert.ok(!validarCarrusel({ ...copia(), segundos: 16 }).ok);
    assert.ok(!validarCarrusel({ ...copia(), segundos: 5.5 }).ok);
    assert.ok(validarCarrusel({ ...copia(), segundos: "10" }).ok, "el número puede venir como texto");
  });

  await prueba("ids repetidos o raros se reemplazan (el panel los usa para ordenar)", () => {
    const e = copia();
    e.diapositivas[1].id = "bienvenida";
    const r = validarCarrusel(e);
    assert.ok(r.ok);
    if (!r.ok) return;
    assert.notEqual(r.datos.diapositivas[0].id, r.datos.diapositivas[1].id);
    const raro = validarCarrusel({ diapositivas: [{ id: '"><x', imagen: "/img/a.webp", imagenAlt: "Foto" }] });
    assert.ok(raro.ok && raro.datos.diapositivas[0].id !== '"><x');
  });

  await prueba("limpia caracteres de control y espacios sobrantes", () => {
    const r = validarCarrusel({ diapositivas: [{ imagen: "/img/a.webp", imagenAlt: "  Foto\u0000 linda  ", titulo: "Hola\u0007" }] });
    assert.ok(r.ok);
    if (!r.ok) return;
    assert.equal(r.datos.diapositivas[0].imagenAlt, "Foto linda");
    assert.equal(r.datos.diapositivas[0].titulo, "Hola");
  });

  console.log("Carrusel — marcado:");

  await prueba("todo texto va escapado (no se puede inyectar HTML desde el panel)", () => {
    const html = htmlCarrusel({
      ...copia(),
      diapositivas: [{ id: "a", imagen: "/img/a.webp", imagenAlt: 'foto" onerror="alert(1)', titulo: "<script>alert(1)</script>", texto: "<img src=x onerror=alert(1)>" }],
    });
    assert.ok(!html.includes("<script>"));
    assert.ok(!html.includes("<img src=x"));
    assert.ok(!html.includes('" onerror="'));
    assert.ok(html.includes("&lt;script&gt;"));
  });

  await prueba("aunque los datos no pasen por validar, una foto o enlace malos no se dibujan", () => {
    const html = htmlCarrusel({
      ...copia(),
      diapositivas: [{ id: "a", imagen: "javascript:alert(1)", imagenAlt: "x", titulo: "T", boton: { texto: "Ir", enlace: "javascript:alert(1)" } }],
    });
    assert.ok(!html.includes("javascript:"));
    assert.ok(!html.includes("<img"), "sin foto válida ni de respaldo, no hay <img>");
    const conRespaldo = htmlCarrusel({ ...copia(), diapositivas: [{ id: "a", imagen: "mala", imagenAlt: "x" }] }, { imagenPorDefecto: "/img/respaldo.webp" });
    assert.ok(conRespaldo.includes('src="/img/respaldo.webp"'));
  });

  await prueba("la primera foto carga con prioridad y lleva el h1; las demás, después y con h2", () => {
    const html = htmlCarrusel(copia());
    const [primera, segunda] = html.split('data-carrusel-diapo').slice(1);
    assert.match(primera, /fetchpriority="high"/);
    assert.match(primera, /<h1 class="carrusel__titulo">/);
    assert.match(primera, /data-activa/);
    assert.match(segunda, /loading="lazy"/);
    assert.match(segunda, /<h2 class="carrusel__titulo">/);
    assert.ok(!segunda.includes("data-activa"));
    assert.ok(!htmlCarrusel(copia(), { tituloPrincipal: false }).includes("<h1"));
  });

  await prueba("controles accesibles: pausa, flechas y un punto por diapositiva", () => {
    const html = htmlCarrusel(copia());
    assert.match(html, /data-carrusel-pausa aria-label="Pausar el carrusel"/);
    assert.match(html, /aria-label="Diapositiva anterior"/);
    assert.match(html, /aria-label="Diapositiva siguiente"/);
    assert.equal((html.match(/data-carrusel-punto=/g) ?? []).length, 2);
    assert.match(html, /aria-roledescription="diapositiva" aria-label="1 de 2"/);
  });

  await prueba("con una sola diapositiva no hay controles (portada fija)", () => {
    const html = htmlCarrusel({ ...copia(), diapositivas: [BASE.diapositivas[0]] });
    assert.ok(!html.includes("data-carrusel-controles"));
  });

  await prueba("botón externo se abre aparte con noopener; el del sitio, en la misma pestaña", () => {
    const e = copia();
    e.diapositivas[1].boton = { texto: "Instagram", enlace: "https://www.instagram.com/x" };
    const html = htmlCarrusel(e, { claseBoton: "boton", iconoBoton: "<svg></svg>" });
    assert.match(html, /href="https:\/\/www\.instagram\.com\/x" target="_blank" rel="noopener"/);
    assert.match(html, /<a class="boton carrusel__boton" href="\/tienda\/">Ver productos <svg><\/svg><\/a>/);
  });

  console.log("Carrusel — almacén y borde:");

  await prueba("sin editar rige el del sitio; al guardar manda KV; restablecer vuelve al del sitio", async () => {
    const { kv, datos } = kvMemoria();
    const env = { REVIEWS_KV: kv };
    const fuente = crearCarruselEditable(copia());
    assert.equal(await fuente.editado(env), false);
    assert.equal((await fuente.obtener(env)).diapositivas.length, 2);
    const nuevo = copia();
    nuevo.diapositivas.pop();
    nuevo.segundos = 10;
    const r = await fuente.guardar(env, nuevo);
    assert.ok(r.ok);
    assert.ok(datos.has("carrusel:portada"));
    assert.equal(await fuente.editado(env), true, "el cambio se ve al tiro en esta copia (sin esperar la caché)");
    assert.equal((await fuente.obtener(env)).segundos, 10);
    await fuente.restablecer(env);
    assert.equal(await fuente.editado(env), false);
    assert.ok(!datos.has("carrusel:portada"));
  });

  await prueba("guardar algo inválido no toca lo guardado", async () => {
    const { kv, datos } = kvMemoria();
    const env = { REVIEWS_KV: kv };
    const fuente = crearCarruselEditable(copia());
    const r = await fuente.guardar(env, { diapositivas: [{ imagen: "https://otro.cl/x.png", imagenAlt: "x" }] });
    assert.ok(!r.ok);
    assert.equal(datos.size, 0);
  });

  await prueba("datos dañados en KV: se sirve el del sitio, sin romper la portada", async () => {
    const { kv, datos } = kvMemoria();
    datos.set("carrusel:portada", "{no es json");
    const env = { REVIEWS_KV: kv };
    const errorOriginal = console.error;
    console.error = () => {};
    try {
      const fuente = crearCarruselEditable(copia());
      assert.equal(await fuente.editado(env), false);
      assert.equal((await fuente.obtener(env)).diapositivas[0].id, "bienvenida");
      datos.set("carrusel:portada", JSON.stringify({ diapositivas: [{ imagen: "javascript:x", imagenAlt: "x" }] }));
      const otra = crearCarruselEditable(copia());
      assert.equal(await otra.editado(env), false, "lo inválido en KV tampoco se usa");
    } finally {
      console.error = errorOriginal;
    }
  });

  await prueba("un carrusel inicial inválido avisa al construir el sitio", () => {
    assert.throws(() => crearCarruselEditable({ diapositivas: [{ id: "a", imagen: "x", imagenAlt: "" }] }), ErrorCarrusel);
  });

  await prueba("borde: sin editar o en otra página, la respuesta pasa tal cual", async () => {
    const { kv } = kvMemoria();
    const fuente = crearCarruselEditable(copia());
    const borde = crearBordeCarrusel(fuente);
    const original = new Response('<section data-carrusel="portada">estático</section>', { headers: { "content-type": "text/html" } });
    const r = await borde.onRequest({ request: new Request("https://t.cl/"), env: { REVIEWS_KV: kv }, next: async () => original });
    assert.equal(r, original);
    await fuente.guardar({ REVIEWS_KV: kv }, copia());
    let llamado = false;
    const otra = await borde.onRequest({
      request: new Request("https://t.cl/tienda/"),
      env: { REVIEWS_KV: kv },
      next: async () => ((llamado = true), original),
    });
    assert.ok(llamado);
    assert.equal(otra, original);
  });

  await prueba("borde: con la portada editada, pone las diapositivas nuevas y sus ajustes", async () => {
    instalarReescritorFalso();
    const { kv } = kvMemoria();
    const env = { REVIEWS_KV: kv };
    const fuente = crearCarruselEditable(copia());
    const nuevo = copia();
    nuevo.diapositivas[0].titulo = "Nuevo <título>";
    nuevo.automatico = false;
    await fuente.guardar(env, nuevo);
    const borde = crearBordeCarrusel(fuente, { claseBoton: "boton" });
    const pagina = '<main><section class="carrusel" data-carrusel="portada" data-segundos="6" data-automatico="si">estático</section></main>';
    const r = await borde.onRequest({
      request: new Request("https://t.cl/"),
      env,
      next: async () => new Response(pagina, { headers: { "content-type": "text/html; charset=utf-8" } }),
    });
    const html = await r.text();
    assert.ok(!html.includes("estático"));
    assert.ok(html.includes("Nuevo &lt;título&gt;"));
    assert.match(html, /data-automatico="no"/);
  });

  console.log(`\n${pasaron} pruebas pasaron.`);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
