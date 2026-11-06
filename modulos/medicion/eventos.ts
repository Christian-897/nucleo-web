/**
 * EVENTOS DE LA TIENDA para medir (navegador). El carrito y la compra los
 * emiten en `window`; cada herramienta de medición (Google Analytics, y más
 * adelante otras) los escucha por su cuenta. Así el carrito no depende de
 * ninguna herramienta, y un sitio sin medición no carga nada.
 *
 * Solo viajan datos del producto y del pedido (id, nombre, precio, cantidad,
 * número de orden, monto). Nunca datos del comprador.
 */

export const EVENTO_AGREGAR = "nucleo:carrito-agregado";
export const EVENTO_INICIAR_COMPRA = "nucleo:compra-iniciada";
export const EVENTO_COMPRA = "nucleo:compra-confirmada";

export interface ProductoMedido {
  productoId: string;
  nombre: string;
  precio: number;
  cantidad: number;
}

export interface DetalleAgregar {
  producto: ProductoMedido;
}
export interface DetalleIniciarCompra {
  productos: ProductoMedido[];
  total: number;
}
export interface DetalleCompra {
  orden: string;
  monto: number;
  /** Lo que se compró (los productos con que se fue a pagar). Puede venir vacío. */
  productos: ProductoMedido[];
}

export interface EventoTienda {
  nombre: string;
  detalle: unknown;
}

/**
 * Además del evento, cada aviso queda en una cola de la página: una
 * herramienta que arranca DESPUÉS (por ejemplo, al aceptar las cookies o
 * porque su script cargó más tarde) igual se entera de lo que pasó en esta
 * página. No se guarda entre páginas.
 */
function cola(): EventoTienda[] {
  const w = window as unknown as { __nucleoEventos?: EventoTienda[] };
  if (!Array.isArray(w.__nucleoEventos)) w.__nucleoEventos = [];
  return w.__nucleoEventos;
}

function emitir(nombre: string, detalle: unknown): void {
  try {
    if (typeof window === "undefined" || typeof CustomEvent === "undefined") return;
    const c = cola();
    c.push({ nombre, detalle });
    if (c.length > 20) c.splice(0, c.length - 20);
    window.dispatchEvent(new CustomEvent(nombre, { detail: detalle }));
  } catch {
    // Medir nunca debe romper la compra.
  }
}

/**
 * Para las herramientas de medición: recibe los eventos que ya pasaron en
 * esta página y los que vengan. Devuelve una función para dejar de escuchar.
 */
export function escucharEventos(fn: (e: EventoTienda) => void): () => void {
  if (typeof window === "undefined") return () => {};
  const nombres = [EVENTO_AGREGAR, EVENTO_INICIAR_COMPRA, EVENTO_COMPRA];
  for (const e of cola().slice()) {
    try {
      fn(e);
    } catch {
      /* una herramienta con error no corta a las demás */
    }
  }
  const oyentes = nombres.map((nombre) => {
    const h = (ev: Event) => {
      try {
        fn({ nombre, detalle: (ev as CustomEvent).detail });
      } catch {
        /* idem */
      }
    };
    window.addEventListener(nombre, h);
    return () => window.removeEventListener(nombre, h);
  });
  return () => oyentes.forEach((q) => q());
}

function limpiarProducto(p: Partial<ProductoMedido>): ProductoMedido {
  return {
    productoId: String(p.productoId ?? "").slice(0, 80),
    nombre: String(p.nombre ?? "").slice(0, 120),
    precio: Number.isFinite(Number(p.precio)) ? Math.max(0, Number(p.precio)) : 0,
    cantidad: Math.max(1, Math.floor(Number(p.cantidad) || 1)),
  };
}

/** Lo llama el carrito al agregar un producto. */
export function emitirAgregar(p: Partial<ProductoMedido>): void {
  emitir(EVENTO_AGREGAR, { producto: limpiarProducto(p) } satisfies DetalleAgregar);
}

const CLAVE_EN_CURSO = "nucleo:compra-en-curso";
const HORAS_EN_CURSO = 48;

/**
 * Lo llama la compra cuando los datos están bien y se va a pagar. Además
 * guarda en el navegador qué productos se fueron a pagar, para que la
 * página de retorno sepa qué se compró (aunque el carrito cambie).
 */
export function emitirIniciarCompra(productos: Partial<ProductoMedido>[], total?: number): void {
  const lista = productos.map(limpiarProducto);
  const suma = lista.reduce((a, p) => a + p.precio * p.cantidad, 0);
  const t = typeof total === "number" && Number.isFinite(total) && total >= 0 ? total : suma;
  try {
    localStorage.setItem(CLAVE_EN_CURSO, JSON.stringify({ productos: lista.slice(0, 50), fecha: Date.now() }));
  } catch {
    // Sin almacenamiento: la compra se medirá sin el detalle de productos.
  }
  emitir(EVENTO_INICIAR_COMPRA, { productos: lista, total: t } satisfies DetalleIniciarCompra);
}

/** Los productos con que se fue a pagar (si es de las últimas 48 horas). */
function leerCompraEnCurso(): ProductoMedido[] {
  try {
    const d = JSON.parse(localStorage.getItem(CLAVE_EN_CURSO) || "null");
    if (!d || !Array.isArray(d.productos) || typeof d.fecha !== "number") return [];
    if (Date.now() - d.fecha > HORAS_EN_CURSO * 3_600_000) return [];
    return d.productos.slice(0, 50).map(limpiarProducto).filter((p: ProductoMedido) => p.productoId);
  } catch {
    return [];
  }
}

const ORDEN_MEDIBLE = /^[A-Za-z0-9_-]{1,64}$/;
const CLAVE_MEDIDAS = "nucleo:compras-medidas";

/**
 * Para la página de retorno del pago (`/pago/retorno`): avisa UNA vez por
 * orden que la compra quedó pagada, aunque la persona recargue la página.
 * Llamarla solo cuando `/api/pago/estado` responde `estado: "pagada"`.
 * Los productos se toman de lo que se fue a pagar (lo guardó la compra);
 * también se pueden pasar. Devuelve true si avisó.
 */
export function avisarCompraConfirmada(orden: string, monto: number, productos?: Partial<ProductoMedido>[]): boolean {
  if (!ORDEN_MEDIBLE.test(String(orden)) || !Number.isFinite(Number(monto)) || Number(monto) < 0) return false;
  let medidas: string[] = [];
  try {
    medidas = JSON.parse(localStorage.getItem(CLAVE_MEDIDAS) || "[]");
    if (!Array.isArray(medidas)) medidas = [];
  } catch {
    medidas = [];
  }
  if (medidas.includes(orden)) return false;
  try {
    localStorage.setItem(CLAVE_MEDIDAS, JSON.stringify([...medidas, orden].slice(-30)));
  } catch {
    // Sin almacenamiento: igual se avisa (como mucho, se contaría de nuevo al recargar).
  }
  const lista = productos ? productos.map(limpiarProducto).filter((p) => p.productoId) : leerCompraEnCurso();
  try {
    localStorage.removeItem(CLAVE_EN_CURSO);
  } catch {
    /* nada */
  }
  emitir(EVENTO_COMPRA, { orden, monto: Number(monto), productos: lista } satisfies DetalleCompra);
  return true;
}
