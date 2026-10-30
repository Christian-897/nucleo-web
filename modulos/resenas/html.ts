/**
 * Cómo se ven las reseñas en la ficha (lo arma el borde) y lo que va al
 * JSON-LD para Google. TODO texto lo escribió un comprador: se escapa siempre.
 *
 * Clases para el sitio:
 *   .estrellas            (style="--valor:90%"; dibujar con ::before "★★★★★")
 *   .resenas__lista > .resena
 *   .resena__cabeza · .resena__nombre · .resena__verificada · .resena__fecha
 *   .resena__variante · .resena__texto · .resena__respuesta
 */
import type { ResumenResenas } from "./almacen";

const escapar = (t: string) =>
  t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

/** "4,6" */
export const numeroResena = (n: number) => n.toLocaleString("es-CL", { minimumFractionDigits: n % 1 ? 1 : 0, maximumFractionDigits: 1 });

export function fechaResena(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("es-CL", { day: "numeric", month: "long", year: "numeric", timeZone: "America/Santiago" });
}

/** Estrellas de 0 a 5 (con medias), accesibles. */
export function htmlEstrellas(valor: number): string {
  const v = Math.max(0, Math.min(5, valor));
  return `<span class="estrellas" style="--valor:${Math.round((v / 5) * 100)}%" role="img" aria-label="${numeroResena(v)} de 5 estrellas"></span>`;
}

/** "4,6 de 5 · 12 opiniones" */
export function textoResumen(r: Pick<ResumenResenas, "total" | "promedio">): string {
  return `${numeroResena(r.promedio)} de 5 · ${r.total} ${r.total === 1 ? "opinión" : "opiniones"}`;
}

/** Junto al precio: estrellas y cantidad, como enlace a las opiniones. */
export function htmlEstrellasFicha(r: ResumenResenas): string {
  return `${htmlEstrellas(r.promedio)} <span class="estrellas__texto">${escapar(numeroResena(r.promedio))} (${r.total})</span>`;
}

export function htmlListaResenas(r: ResumenResenas, nombreSitio: string): string {
  return r.resenas
    .map((x) => {
      const variante = x.variante ? `<p class="resena__variante">Compró: ${escapar(x.variante)}</p>` : "";
      const respuesta = x.respuesta
        ? `<div class="resena__respuesta"><strong>Respuesta de ${escapar(nombreSitio)}</strong><p>${escapar(x.respuesta.texto)}</p></div>`
        : "";
      return `<li class="resena"><div class="resena__cabeza">${htmlEstrellas(x.estrellas)}<strong class="resena__nombre">${escapar(x.nombre)}</strong><span class="resena__verificada">Compra verificada</span><time class="resena__fecha" datetime="${escapar(x.fecha.slice(0, 10))}">${escapar(fechaResena(x.fecha))}</time></div>${variante}<p class="resena__texto">${escapar(x.texto)}</p>${respuesta}</li>`;
    })
    .join("");
}

/** Para el JSON-LD del producto (Google): promedio y las reseñas más nuevas. */
export function jsonLdResenas(r: ResumenResenas): Record<string, unknown> {
  return {
    aggregateRating: { "@type": "AggregateRating", ratingValue: r.promedio, reviewCount: r.total, bestRating: 5, worstRating: 1 },
    review: r.resenas.slice(0, 5).map((x) => ({
      "@type": "Review",
      author: { "@type": "Person", name: x.nombre },
      datePublished: x.fecha.slice(0, 10),
      reviewBody: x.texto,
      reviewRating: { "@type": "Rating", ratingValue: x.estrellas, bestRating: 5, worstRating: 1 },
    })),
  };
}
