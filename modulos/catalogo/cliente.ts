/**
 * Cliente headless del catálogo: consulta el stock real para marcar
 * productos agotados en una página construida de antemano.
 */
export async function consultarStock(
  ids: string[],
  opciones: { endpoint?: string } = {}
): Promise<Record<string, number | null>> {
  if (!ids.length) return {};
  try {
    const url = `${opciones.endpoint ?? "/api/stock"}?ids=${encodeURIComponent(ids.join(","))}`;
    const res = await fetch(url);
    return res.ok ? ((await res.json()) as Record<string, number | null>) : {};
  } catch {
    return {};
  }
}
