/**
 * Cabeceras de seguridad del panel (/admin/* y /api/admin/*).
 *
 * Van en un middleware y no en _headers: en Pages, los bloques de
 * _headers se SUMAN (/* + /admin/*) y el panel terminaba con dos CSP
 * distintas. Aquí se REEMPLAZAN una por una con `set`. (Comprobado en
 * Muebles Crea: "! Cabecera" en _headers no surte efecto.)
 */
export const CABECERAS_PANEL: Record<string, string> = {
  "Content-Security-Policy": [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "script-src 'self'",
    "style-src 'self'",
    "font-src 'self'",
    // data: solo para el código QR del doble factor, mostrado como imagen.
    "img-src 'self' data: blob:",
    "connect-src 'self'",
    "upgrade-insecure-requests",
  ].join("; "),
  "X-Frame-Options": "DENY",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "X-Robots-Tag": "noindex, nofollow",
  "Cache-Control": "no-store, max-age=0",
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Resource-Policy": "same-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=()",
};

export function aplicarCabecerasPanel(respuesta: Response): Response {
  const copia = new Response(respuesta.body, respuesta);
  for (const [nombre, valor] of Object.entries(CABECERAS_PANEL)) copia.headers.set(nombre, valor);
  return copia;
}
