/**
 * Modo del panel (v0.49).
 *
 *  - "tienda" (por defecto): el panel completo de una tienda online.
 *  - "servicios": para sitios que venden servicios y reciben cotizaciones.
 *    Esconde Productos, Categorías, Pedidos, Suscriptores y las ventas del
 *    Resumen, y habla de «el sitio» en vez de «la tienda».
 *
 * El sitio lo elige con <PanelAdmin modo="servicios" />. Los textos que ya
 * dicen «tienda» (ayuda, «Muéstrame cómo», avisos) pasan por textoSegunModo
 * para no tener dos copias de cada uno.
 */

export type ModoPanel = "tienda" | "servicios";

/** Pestañas que solo existen en una tienda. */
export const PESTANAS_SOLO_TIENDA = ["productos", "categorias", "pedidos", "suscriptores"] as const;

/** Lee el modo de un valor cualquiera (atributo data-modo, prop, etc.). */
export function leerModo(valor: unknown): ModoPanel {
  return valor === "servicios" ? "servicios" : "tienda";
}

/**
 * Frases de tienda → sitio de servicios. Van de la más larga a la más corta:
 * las frases con género («está abierta», «cerrada») y las que hablan de
 * comprar se resuelven antes que el cambio general «tienda → sitio».
 */
const FRASES_SERVICIOS: [RegExp, string][] = [
  // Lo que se pierde al cerrar: en un sitio de servicios no hay productos ni compras.
  [/los clientes no pueden ver productos ni comprar/gi, "las visitas solo ven el aviso"],
  [/no pueden ver productos ni comprar/gi, "solo ven el aviso"],
  [/no podrán ver productos ni comprar/gi, "solo verán el aviso"],
  [/Todos podrán ver productos y comprar/g, "Todos podrán ver el sitio"],
  [/todos podrán ver productos y comprar/g, "todos podrán ver el sitio"],
  [/ver productos ni comprar/gi, "ver el sitio"],
  [/los clientes ven el aviso y no pueden comprar/gi, "las visitas ven el aviso en vez del sitio"],
  [/manejas productos, pedidos, textos, fotos y despacho/g, "manejas textos, fotos y mensajes"],
  [/tutienda\.cl/g, "tusitio.cl"],
  [/productos, pedidos y textos/gi, "textos, fotos y mensajes"],
  [/Si necesitas cerrarla/g, "Si necesitas cerrarlo"],
  [/Tus datos y pedidos no se borran/g, "Tus textos y mensajes no se borran"],
  [/volver a vender/gi, "volver a publicar"],
  [/suspender ventas/gi, "pausar el sitio"],
  // Género: «la tienda está abierta» → «el sitio está abierto».
  [/tienda está abierta/g, "sitio está abierto"],
  [/tienda está cerrada/g, "sitio está cerrado"],
  [/Mientras está cerrada/g, "Mientras está cerrado"],
  [/mientras está cerrada/g, "mientras está cerrado"],
  [/tienda abierta/g, "sitio abierto"],
  [/tienda cerrada/g, "sitio cerrado"],
  [/ocultar tienda/g, "ocultar el sitio"],
  // Vista previa de colores y tipografías del panel.
  [/Envíos a todo Chile · Compra segura/g, "Atención en todo Chile · Respuesta rápida"],
  [/Productos destacados/g, "Nuestros servicios"],
  [/¡Qué lindo tejido!/g, "¡Qué buen servicio!"],
  [/Agregar al carrito/g, "Cotizar"],
  // Cambio general, cuidando artículos y contracciones.
  [/\bde la tienda\b/g, "del sitio"],
  [/\bDe la tienda\b/g, "Del sitio"],
  [/\ba la tienda\b/g, "al sitio"],
  [/\bA la tienda\b/g, "Al sitio"],
  [/\bla tienda\b/g, "el sitio"],
  [/\bLa tienda\b/g, "El sitio"],
  [/\buna tienda\b/g, "un sitio"],
  [/\bUna tienda\b/g, "Un sitio"],
  [/\besta tienda\b/g, "este sitio"],
  [/\bEsta tienda\b/g, "Este sitio"],
  [/\btu tienda\b/g, "tu sitio"],
  [/\bTu tienda\b/g, "Tu sitio"],
  [/\bVer tienda\b/g, "Ver sitio"],
  [/\btienda\b/g, "sitio"],
  [/\bTienda\b/g, "Sitio"],
];

/** Adapta un texto escrito para tiendas al modo del panel. En modo tienda no cambia nada. */
export function textoSegunModo(texto: string, modo: ModoPanel): string {
  if (modo !== "servicios" || !texto) return texto;
  let r = texto;
  for (const [patron, reemplazo] of FRASES_SERVICIOS) r = r.replace(patron, reemplazo);
  return r;
}
