import { escapeHtml } from "../../core/validar";
import type { ConfigConstruccion, EnlaceContacto } from "./config";

const COLOR = /^#[0-9a-fA-F]{3,8}$/;
const color = (valor: string | undefined, porDefecto: string) =>
  valor && COLOR.test(valor) ? valor : porDefecto;

/** Solo enlaces seguros: nada de javascript:, data:, etc. */
export function enlaceSeguro(c: EnlaceContacto): boolean {
  try {
    const u = new URL(c.url);
    return ["https:", "mailto:", "tel:"].includes(u.protocol);
  } catch {
    return false;
  }
}

/** Página autocontenida: no carga nada externo salvo el logo del propio sitio. */
export function paginaConstruccion(config: ConfigConstruccion): string {
  const acento = color(config.colores?.acento, "#D81B72");
  const fondo = color(config.colores?.fondo, "#FFF7FA");
  const tinta = color(config.colores?.tinta, "#1F1419");
  const nombre = escapeHtml(config.nombreSitio);
  const titulo = escapeHtml(config.titulo ?? "Sitio en construcción");
  const mensaje = escapeHtml(config.mensaje ?? "Estamos preparando algo bonito. Vuelve pronto.");
  const logo =
    config.logo && config.logo.startsWith("/") && !config.logo.startsWith("//")
      ? `<img class="logo" src="${escapeHtml(config.logo)}" alt="${nombre}" width="140" height="140">`
      : `<p class="nombre">${nombre}</p>`;
  const contactos = (config.contactos ?? [])
    .filter(enlaceSeguro)
    .map(
      (c) =>
        `<a href="${escapeHtml(c.url)}" ${c.url.startsWith("https:") ? 'target="_blank" rel="noopener noreferrer"' : ""}>${escapeHtml(c.etiqueta)}</a>`
    )
    .join("");

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${titulo} | ${nombre}</title>
<style>
  *{box-sizing:border-box}
  body{margin:0;min-height:100vh;display:grid;place-items:center;background:${fondo};color:${tinta};
    font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;padding:24px;text-align:center}
  main{max-width:460px}
  .logo{width:140px;height:140px;border-radius:50%;margin:0 auto 20px;display:block}
  .nombre{font-size:2rem;font-weight:700;margin:0 0 12px}
  h1{font-size:1.6rem;margin:0 0 10px}
  p{line-height:1.6;margin:0 0 24px;opacity:.85}
  .linea{width:56px;height:3px;border-radius:3px;background:${acento};margin:0 auto 20px}
  nav{display:flex;gap:10px;justify-content:center;flex-wrap:wrap}
  nav a{color:#fff;background:${acento};padding:10px 20px;border-radius:999px;text-decoration:none;font-weight:600}
  nav a:focus-visible{outline:3px solid ${tinta};outline-offset:2px}
</style>
</head>
<body>
<main>
  ${logo}
  <div class="linea" aria-hidden="true"></div>
  <h1>${titulo}</h1>
  <p>${mensaje}</p>
  ${contactos ? `<nav aria-label="Contacto">${contactos}</nav>` : ""}
</main>
</body>
</html>`;
}
