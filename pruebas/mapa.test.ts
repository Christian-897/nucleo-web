/**
 * Prueba del módulo mapa: qué ubicaciones se aceptan, que nunca se inserta
 * un enlace escrito por una persona, las direcciones que arma, el campo
 * "mapa" del contenido editable y lo que el borde pone en la página.
 * Se corre con `npm test`.
 */
import assert from "node:assert/strict";
import {
  coordenadas,
  insercionPermitida,
  normalizarUbicacion,
  ORIGEN_MAPA,
  urlComoLlegar,
  urlInsercion,
  urlVerEnMaps,
} from "../modulos/mapa/index";
import {
  crearBordeContenido,
  crearContenidoEditable,
  hrefDe,
  validarValor,
  type Campo,
  type Esquema,
} from "../modulos/contenido/index";
import type { AlmacenKV } from "../core/tipos";

let pasaron = 0;
async function prueba(nombre: string, fn: () => void | Promise<void>) {
  await fn();
  pasaron++;
  console.log("  ok —", nombre);
}
const valor = (entrada: unknown) => {
  const r = normalizarUbicacion(entrada);
  return r.ok ? r.valor : `ERROR: ${r.error}`;
};

console.log("Mapa:");

await prueba("una dirección escrita queda limpia", () => {
  assert.equal(valor("  Av. Providencia   1234,\n Providencia "), "Av. Providencia 1234, Providencia");
  assert.equal(valor("Local: 5, Mall Plaza Vespucio"), "Local: 5, Mall Plaza Vespucio");
  assert.equal(valor("Ñuñoa, Región Metropolitana"), "Ñuñoa, Región Metropolitana");
});

await prueba("coordenadas válidas se normalizan; fuera de rango no son coordenadas", () => {
  assert.equal(coordenadas("-33.4372, -70.6506"), "-33.4372,-70.6506");
  assert.equal(coordenadas("-33.43721234567,-70.65"), "-33.437212,-70.65");
  assert.equal(coordenadas("95,10"), "");
  assert.equal(coordenadas("10,190"), "");
  assert.equal(valor("-33.4372,-70.6506"), "-33.4372,-70.6506");
});

await prueba("enlaces largos de Google Maps: se saca la dirección, no el enlace", () => {
  assert.equal(
    valor("https://www.google.com/maps/place/Av.+Providencia+1234,+Providencia/@-33.43,-70.61,17z/data=!3m1"),
    "Av. Providencia 1234, Providencia"
  );
  assert.equal(valor("https://www.google.cl/maps?q=Plaza+de+Armas,+Santiago"), "Plaza de Armas, Santiago");
  assert.equal(valor("https://maps.google.com/?q=-33.44,-70.65"), "-33.44,-70.65");
  assert.equal(valor("https://www.google.com/maps/@-33.4372,-70.6506,15z"), "-33.4372,-70.6506");
  assert.equal(valor("https://www.google.com/maps/dir/?api=1&destination=Costanera+Center"), "Costanera Center");
  assert.equal(valor("www.google.com/maps?q=Providencia"), "Providencia");
});

await prueba("enlaces cortos, de otros sitios o raros se rechazan con un mensaje claro", () => {
  assert.match(valor("https://maps.app.goo.gl/AbCdEf123"), /enlace corto/);
  assert.match(valor("https://evil.example/maps?q=x"), /Solo se aceptan enlaces de Google Maps/);
  assert.match(valor("https://www.google.com.evil.example/maps?q=x"), /Solo se aceptan/);
  assert.match(valor("https://www.google.com/search?q=hola"), /Solo se aceptan/);
  assert.match(valor("https://user:clave@www.google.com/maps?q=x"), /Solo se aceptan/);
  assert.match(valor("https://www.google.com/maps"), /No encontramos la dirección/);
});

await prueba("textos vacíos, cortos, largos o con caracteres de marcado se rechazan", () => {
  assert.match(valor(""), /Escribe la dirección/);
  assert.match(valor("   "), /Escribe la dirección/);
  assert.match(valor("ab"), /muy corta/);
  assert.match(valor("x".repeat(201)), /Máximo 200/);
  assert.match(valor("---"), /Escribe la dirección/);
  assert.match(valor('Calle <script>alert(1)</script>'), /caracteres/);
  assert.match(valor(42), /inválida/);
});

await prueba("lo que no es un enlace queda como búsqueda, nunca como enlace", () => {
  // "javascript:" sin "//" es solo texto: termina codificado dentro de q=.
  const src = urlInsercion("javascript:alert(1)");
  assert.ok(src.startsWith(`${ORIGEN_MAPA}/maps?q=javascript%3Aalert(1)&`));
  assert.ok(insercionPermitida(src));
});

await prueba("arma el mapa insertado, 'cómo llegar' y 'ver en Maps'", () => {
  assert.equal(
    urlInsercion("Av. Providencia 1234, Providencia"),
    "https://www.google.com/maps?q=Av.%20Providencia%201234%2C%20Providencia&z=16&hl=es&output=embed"
  );
  assert.ok(urlInsercion("Providencia", { zoom: 12 }).includes("&z=12&"));
  assert.ok(urlInsercion("Providencia", { zoom: 99 }).includes("&z=16&"), "zoom fuera de rango vuelve al de siempre");
  assert.equal(urlComoLlegar("Costanera Center"), "https://www.google.com/maps/dir/?api=1&destination=Costanera%20Center");
  assert.equal(urlVerEnMaps("-33.44,-70.65"), "https://www.google.com/maps/search/?api=1&query=-33.44%2C-70.65");
  assert.equal(urlInsercion(""), "");
  assert.equal(urlComoLlegar("https://maps.app.goo.gl/x"), "");
});

await prueba("el navegador solo inserta mapas armados por el núcleo", () => {
  assert.ok(insercionPermitida(urlInsercion("Providencia")));
  assert.equal(insercionPermitida("https://evil.example/maps?q=x&output=embed"), false);
  assert.equal(insercionPermitida("https://www.google.com/maps?q=x"), false, "sin output=embed");
  assert.equal(insercionPermitida("https://www.google.com/maps?output=embed"), false, "sin q");
  assert.equal(insercionPermitida("https://www.google.com.evil.example/maps?q=x&output=embed"), false);
  assert.equal(insercionPermitida("javascript:alert(1)"), false);
  assert.equal(insercionPermitida(undefined), false);
});

await prueba("contenido: el campo 'mapa' valida y arma 'cómo llegar'", () => {
  const campo: Campo = { clave: "contacto.direccion", grupo: "contacto", etiqueta: "Dirección", tipo: "mapa", opcional: true };
  assert.deepEqual(validarValor(campo, " Plaza de Armas,  Santiago "), { ok: true, valor: "Plaza de Armas, Santiago" });
  assert.deepEqual(validarValor(campo, ""), { ok: true, valor: "" }, "opcional: vacío oculta el mapa");
  const malo = validarValor(campo, "https://maps.app.goo.gl/x");
  assert.equal(malo.ok, false);
  const obligatorio = validarValor({ ...campo, opcional: false }, "");
  assert.equal(obligatorio.ok, false, "si no es opcional, no puede quedar vacío");
  assert.equal(hrefDe(campo, { "contacto.direccion": "Plaza de Armas, Santiago" }), "https://www.google.com/maps/dir/?api=1&destination=Plaza%20de%20Armas%2C%20Santiago");
  assert.equal(hrefDe(campo, { "contacto.direccion": "" }), "");
});

/**
 * HTMLRewriter mínimo para Node: aplica cada regla "[atributo]" a las
 * etiquetas de apertura que lo tienen (y el texto que les sigue).
 */
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
          const m = /^\[([a-z-]+)\]$/.exec(selector);
          if (!m) continue;
          const re = new RegExp(`<([a-z]+)([^>]*\\s${m[1]}="[^"]*"[^>]*)>([^<]*)`, "g");
          html = html.replace(re, (_t, etiqueta: string, attrs: string, texto: string) => {
            let a = attrs;
            let t = texto;
            let quitar = false;
            const leer = (k: string) => new RegExp(`\\s${k}="([^"]*)"`).exec(a)?.[1] ?? null;
            h.element({
              getAttribute: leer,
              setAttribute: (k: string, v: string) => {
                a = a.replace(new RegExp(`\\s${k}="[^"]*"`), "") + ` ${k}="${v.replace(/&/g, "&amp;")}"`;
              },
              removeAttribute: (k: string) => (a = a.replace(new RegExp(`\\s${k}(="[^"]*")?`), "")),
              setInnerContent: (c: string) => (t = c),
              append: () => {},
              remove: () => (quitar = true),
            });
            return quitar ? "" : `<${etiqueta}${a}>${t}`;
          });
        }
        return html;
      });
      return new Response(
        new ReadableStream({
          async start(c) {
            c.enqueue(new TextEncoder().encode(await cuerpo));
            c.close();
          },
        }),
        { headers: r.headers }
      );
    }
  };
}

function kvMemoria(): AlmacenKV {
  const datos = new Map<string, string>();
  return {
    get: async (k) => datos.get(k) ?? null,
    put: async (k, v) => void datos.set(k, v),
    delete: async (k) => void datos.delete(k),
    list: async () => ({ keys: [...datos.keys()].map((name) => ({ name })) }),
  };
}

await prueba("borde: lo editado en el panel llega al mapa, la dirección y 'cómo llegar'", async () => {
  instalarReescritorFalso();
  const esquema: Esquema = {
    grupos: [{ id: "contacto", titulo: "Contacto" }],
    campos: [{ clave: "contacto.direccion", grupo: "contacto", etiqueta: "Dirección", tipo: "mapa", opcional: true }],
  };
  const fuente = crearContenidoEditable(esquema, { "contacto.direccion": "Plaza de Armas, Santiago" });
  const env = { REVIEWS_KV: kvMemoria() };
  assert.ok((await fuente.guardar(env, { "contacto.direccion": "Av. Italia 1500, Ñuñoa" })).ok);
  const viejo = urlInsercion("Plaza de Armas, Santiago", { zoom: 15 });
  const pagina =
    `<html><head></head><body><div class="mapa" data-mapa data-mapa-src="${viejo.replace(/&/g, "&amp;")}" data-mapa-zoom="15" data-c-mapa="contacto.direccion">` +
    `<span data-c="contacto.direccion">Plaza de Armas, Santiago</span>` +
    `<a href="#" data-c-href="contacto.direccion">Cómo llegar</a></div></body></html>`;
  const borde = crearBordeContenido(fuente);
  const res = await borde.onRequest({
    request: new Request("https://tienda.cl/contacto/"),
    env,
    next: async () => new Response(pagina, { headers: { "Content-Type": "text/html; charset=utf-8" } }),
  });
  const html = await res.text();
  assert.ok(html.includes('<span data-c="contacto.direccion">Av. Italia 1500, Ñuñoa</span>'), "la dirección visible");
  assert.ok(html.includes(`data-mapa-src="${urlInsercion("Av. Italia 1500, Ñuñoa", { zoom: 15 }).replace(/&/g, "&amp;")}"`), "el mapa, con su zoom");
  assert.ok(html.includes(`href="${urlComoLlegar("Av. Italia 1500, Ñuñoa").replace(/&/g, "&amp;")}"`), "cómo llegar");
  assert.ok(!html.includes("Plaza%20de%20Armas"), "no queda la ubicación anterior");
});

console.log(`\n${pasaron} pruebas pasaron.`);
