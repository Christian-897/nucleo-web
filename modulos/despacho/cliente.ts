/**
 * Cliente del despacho (navegador). Solo MUESTRA: el monto que se cobra lo
 * calcula el servidor.
 *
 *   import { pintarAvisosDespacho } from "nucleo-web/despacho/cliente";
 *   pintarAvisosDespacho(); // llena [data-despacho-aviso="corto|ficha|detalle"]
 */
import { calcularDespacho, type CalculoDespacho, type TarifasDespacho, type TextosDespacho } from "./calculo";

export { COMUNAS_RM, REGION_RM, nombreZona, type FormaDespacho } from "./calculo";

export interface DatosDespacho {
  tarifas: TarifasDespacho;
  textos: TextosDespacho;
}

let pedido: Promise<DatosDespacho | null> | null = null;

/** Una sola petición por página. null si no se pudo (queda el texto del HTML). */
export function obtenerDespacho(endpoint = "/api/despacho"): Promise<DatosDespacho | null> {
  pedido ??= fetch(endpoint)
    .then((r) => (r.ok ? (r.json() as Promise<DatosDespacho>) : null))
    .catch(() => null);
  return pedido;
}

/** Reemplaza el texto de cada [data-despacho-aviso] por el que corresponde a la configuración vigente. */
export async function pintarAvisosDespacho(raiz: ParentNode = document): Promise<DatosDespacho | null> {
  // Páginas sin avisos de despacho no gastan una petición.
  if (!raiz.querySelector("[data-despacho-aviso]")) return null;
  const d = await obtenerDespacho();
  if (!d) return null;
  raiz.querySelectorAll<HTMLElement>("[data-despacho-aviso]").forEach((el) => {
    const tipo = el.dataset.despachoAviso as keyof TextosDespacho;
    if (typeof d.textos[tipo] === "string") el.textContent = d.textos[tipo];
  });
  return d;
}

export function calcularEnNavegador(
  d: DatosDespacho,
  destino: { region?: string; comuna?: string },
  subtotal: number,
  forma?: unknown
): CalculoDespacho {
  return calcularDespacho(d.tarifas, destino, subtotal, forma);
}
