/**
 * CONTENIDO EN EL BORDE: aplica lo editado en el panel a las páginas
 * estáticas mientras viajan al visitante (HTMLRewriter de Cloudflare).
 *
 * Marcas en el HTML del sitio:
 *   data-c="clave"          reemplaza el texto del elemento (que no tenga otras etiquetas adentro)
 *   data-c-alt="clave"      el atributo alt
 *   data-c-content="clave"  el atributo content (<meta>)
 *   data-c-src="clave"      la imagen (src; quita srcset)
 *   data-c-href="clave"     el enlace (url, correo, teléfono o WhatsApp según el campo)
 *   data-c-si="clave …"     vacío → se quita el elemento; con valor → se muestra (quita hidden).
 *                           Con varias claves, se muestra si alguna tiene valor.
 *   data-c-faq="prefijo"    en <script type="application/ld+json">: rearma el FAQPage
 *                           con <prefijo>.N.pregunta / <prefijo>.N.respuesta
 *
 * Colores y tipografías: si cambiaron, se agregan al final del <head> la
 * hoja de cada tipografía nueva y /tema.css?v=<versión> (las variables).
 *
 * Seguridad: el texto se inserta con `html: false` (se ve escrito, no se
 * ejecuta) y los atributos con setAttribute (se escapan). Imágenes y
 * enlaces vienen validados por tipo; las hojas del <head> salen de una
 * lista cerrada. Nada escrito por una persona se vuelve marcado.
 *
 * Si nadie editó nada, la página pasa sin tocar: lo estático ya es correcto.
 */
import type { EnvBase } from "../../core/tipos";
import { enlaceCorreo, enlaceTelefono, enlaceWhatsapp } from "../contacto/index";
import type { EstadoContenido, FuenteContenido } from "./almacen";
import type { Campo, Valores } from "./tipos";

interface ElementoHtml {
  getAttribute(nombre: string): string | null;
  setAttribute(nombre: string, valor: string): void;
  removeAttribute(nombre: string): void;
  setInnerContent(contenido: string, opciones?: { html?: boolean }): void;
  append(contenido: string, opciones?: { html?: boolean }): void;
  remove(): void;
}
interface Reescritor {
  on(selector: string, manejador: { element(el: ElementoHtml): void }): Reescritor;
  transform(r: Response): Response;
}
declare const HTMLRewriter: { new (): Reescritor };

/** Enlace para un campo (o "" si no hay valor). Puro: se prueba aparte. */
export function hrefDe(campo: Campo | undefined, valores: Valores): string {
  if (!campo) return "";
  const v = valores[campo.clave] ?? "";
  if (!v) return "";
  switch (campo.tipo) {
    case "url":
      return v;
    case "email":
      return enlaceCorreo(v);
    case "telefono":
      return campo.enlace === "whatsapp"
        ? enlaceWhatsapp(v, campo.mensajeDe ? valores[campo.mensajeDe] : undefined)
        : enlaceTelefono(v);
    default:
      return "";
  }
}

/** JSON-LD de preguntas frecuentes con las que tengan pregunta y respuesta. */
export function jsonLdFaq(prefijo: string, valores: Valores): string {
  const pares: { q: string; a: string }[] = [];
  for (let i = 1; i <= 50; i++) {
    const q = valores[`${prefijo}.${i}.pregunta`];
    const a = valores[`${prefijo}.${i}.respuesta`];
    if (q === undefined && a === undefined) break;
    if (q && a) pares.push({ q, a });
  }
  const ld = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: pares.map((p) => ({ "@type": "Question", name: p.q, acceptedAnswer: { "@type": "Answer", text: p.a } })),
  };
  // "<" escapado: ningún texto puede cerrar el <script>.
  return JSON.stringify(ld).replace(/</g, "\\u003c");
}

/** Lo que se agrega al <head> cuando cambiaron colores o tipografías. */
export function enlacesTema(estado: EstadoContenido): string {
  if (!estado.temaEditado) return "";
  const hojas = [...estado.fuentesExtra, `/tema.css?v=${encodeURIComponent(estado.version)}`];
  return hojas.map((h) => `<link rel="stylesheet" href="${h.replace(/"/g, "")}">`).join("");
}

export function crearBordeContenido(fuente: FuenteContenido) {
  const campos = new Map(fuente.esquema.campos.map((c) => [c.clave, c]));
  const TEXTO = new Set(["texto", "parrafo", "email", "telefono", "url"]);

  return {
    async onRequest(ctx: { request: Request; env: EnvBase; next: () => Promise<Response> }): Promise<Response> {
      const res = await ctx.next();
      const tipo = res.headers.get("Content-Type") || "";
      if (ctx.request.method !== "GET" || !tipo.includes("text/html")) return res;
      const ruta = new URL(ctx.request.url).pathname;
      if (ruta.startsWith("/admin") || ruta.startsWith("/api/")) return res;
      let estado: EstadoContenido;
      try {
        estado = await fuente.obtener(ctx.env);
      } catch {
        return res; // si KV falla, se sirve lo estático
      }
      if (!estado.editado) return res;
      const v = estado.valores;
      const valor = (el: ElementoHtml, attr: string) => {
        const clave = el.getAttribute(attr) || "";
        return { clave, campo: campos.get(clave), dato: v[clave] };
      };
      const cabeza = enlacesTema(estado);

      let r = new HTMLRewriter()
        .on("[data-c]", {
          element(el) {
            const { campo, dato } = valor(el, "data-c");
            if (campo && TEXTO.has(campo.tipo) && dato !== undefined) el.setInnerContent(dato, { html: false });
          },
        })
        .on("[data-c-alt]", {
          element(el) {
            const { campo, dato } = valor(el, "data-c-alt");
            if (campo && dato !== undefined) el.setAttribute("alt", dato);
          },
        })
        .on("[data-c-content]", {
          element(el) {
            const { campo, dato } = valor(el, "data-c-content");
            if (campo && dato !== undefined) el.setAttribute("content", dato);
          },
        })
        .on("[data-c-src]", {
          element(el) {
            const { campo, dato } = valor(el, "data-c-src");
            if (campo?.tipo === "imagen" && dato) {
              el.setAttribute("src", dato);
              el.removeAttribute("srcset");
            }
          },
        })
        .on("[data-c-href]", {
          element(el) {
            const { campo } = valor(el, "data-c-href");
            const href = hrefDe(campo, v);
            if (href) el.setAttribute("href", href);
          },
        })
        .on("[data-c-si]", {
          element(el) {
            // Una o varias claves (separadas por espacio): se muestra si ALGUNA tiene valor.
            const claves = (el.getAttribute("data-c-si") || "").split(/\s+/).filter((k) => campos.has(k));
            if (!claves.length) return;
            if (claves.some((k) => v[k])) el.removeAttribute("hidden");
            else el.remove();
          },
        })
        .on("script[data-c-faq]", {
          element(el) {
            el.setInnerContent(jsonLdFaq(el.getAttribute("data-c-faq") || "faq", v), { html: true });
          },
        });
      if (cabeza) r = r.on("head", { element: (el) => el.append(cabeza, { html: true }) });
      return r.transform(res);
    },
  };
}

/** GET /tema.css: las variables de colores y tipografías editadas. */
export function crearTemaCss(fuente: FuenteContenido) {
  return {
    async onRequestGet(ctx: { request: Request; env: EnvBase }): Promise<Response> {
      const estado = await fuente.obtener(ctx.env);
      const conVersion = new URL(ctx.request.url).searchParams.get("v") === estado.version;
      return new Response(fuente.css(estado), {
        headers: {
          "Content-Type": "text/css; charset=utf-8",
          // Con la versión correcta en la dirección se guarda mucho tiempo:
          // al editar cambia la versión y con ella la dirección.
          "Cache-Control": conVersion ? "public, max-age=31536000, immutable" : "public, max-age=60",
          "X-Content-Type-Options": "nosniff",
        },
      });
    },
  };
}
