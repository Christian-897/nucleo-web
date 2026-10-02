/**
 * fetch con tiempo límite. Un proveedor externo lento no debe dejar colgada
 * la función del sitio: pasado el plazo se corta y se maneja como error.
 */
export function fetchConTimeout(
  url: string,
  init: RequestInit = {},
  ms = 10_000
): Promise<Response> {
  return fetch(url, { ...init, signal: AbortSignal.timeout(ms) });
}
