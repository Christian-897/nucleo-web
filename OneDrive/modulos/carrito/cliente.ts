/**
 * Carrito EN EL NAVEGADOR (headless). Maneja el estado, lo guarda en
 * localStorage y avisa a quien se suscriba. No trae estilos ni markup:
 * cualquier diseño lo usa. El total que muestra es una "foto"; el total
 * que vale es el que confirma el servidor con `validar()`.
 */
import {
  type OpcionesCarritoCliente,
  MAX_POR_LINEA_POR_DEFECTO,
} from "./config";
import type { CarritoValidado, ItemCarrito } from "./tipos";

export interface Carrito {
  items(): ItemCarrito[];
  /** Agrega (o suma cantidad si ya está). cantidad por defecto 1. */
  agregar(item: Omit<ItemCarrito, "cantidad"> & { cantidad?: number }): void;
  quitar(productoId: string): void;
  /** Fija la cantidad exacta. 0 o menos quita la línea. */
  actualizar(productoId: string, cantidad: number): void;
  vaciar(): void;
  cantidadTotal(): number;
  /** Total de la "foto" local (para mostrar). El real lo da validar(). */
  totalLocal(): number;
  /** Se suscribe a cambios; devuelve función para desuscribirse. */
  suscribir(fn: (items: ItemCarrito[]) => void): () => void;
  /** Valida contra el servidor (precio/stock reales). */
  validar(): Promise<CarritoValidado>;
}

export function crearCarrito(opciones: OpcionesCarritoCliente = {}): Carrito {
  const endpoint = opciones.endpoint ?? "/api/carrito";
  const storageKey = opciones.storageKey ?? "carrito";
  const max = opciones.maxPorLinea ?? MAX_POR_LINEA_POR_DEFECTO;

  let items: ItemCarrito[] = cargar();
  const suscriptores = new Set<(items: ItemCarrito[]) => void>();

  function cargar(): ItemCarrito[] {
    try {
      if (typeof localStorage === "undefined") return [];
      const crudo = localStorage.getItem(storageKey);
      if (!crudo) return [];
      const datos = JSON.parse(crudo);
      if (!Array.isArray(datos)) return [];
      return datos
        .filter((x) => x && typeof x.productoId === "string")
        .map((x) => ({
          productoId: String(x.productoId),
          nombre: String(x.nombre ?? ""),
          precio: Number(x.precio) || 0,
          cantidad: acotar(Number(x.cantidad) || 1),
          imagen: x.imagen ? String(x.imagen) : undefined,
        }));
    } catch {
      return [];
    }
  }

  function guardar(): void {
    try {
      if (typeof localStorage === "undefined") return;
      localStorage.setItem(storageKey, JSON.stringify(items));
    } catch {
      // Modo incógnito o almacenamiento bloqueado: el carrito vive en memoria.
    }
  }

  function acotar(n: number): number {
    const e = Math.floor(n);
    if (!Number.isFinite(e)) return 1;
    return Math.min(Math.max(e, 1), max);
  }

  function avisar(): void {
    guardar();
    const copia = items.map((i) => ({ ...i }));
    suscriptores.forEach((fn) => fn(copia));
  }

  return {
    items() {
      return items.map((i) => ({ ...i }));
    },

    agregar(item) {
      const cantidad = acotar(item.cantidad ?? 1);
      const existente = items.find((i) => i.productoId === item.productoId);
      if (existente) {
        existente.cantidad = acotar(existente.cantidad + cantidad);
      } else {
        items.push({
          productoId: item.productoId,
          nombre: item.nombre,
          precio: Number(item.precio) || 0,
          cantidad,
          imagen: item.imagen,
        });
      }
      avisar();
    },

    quitar(productoId) {
      items = items.filter((i) => i.productoId !== productoId);
      avisar();
    },

    actualizar(productoId, cantidad) {
      const n = Math.floor(Number(cantidad) || 0);
      if (n <= 0) {
        items = items.filter((i) => i.productoId !== productoId);
      } else {
        const it = items.find((i) => i.productoId === productoId);
        if (it) it.cantidad = acotar(n);
      }
      avisar();
    },

    vaciar() {
      items = [];
      avisar();
    },

    cantidadTotal() {
      return items.reduce((acc, i) => acc + i.cantidad, 0);
    },

    totalLocal() {
      return items.reduce((acc, i) => acc + i.precio * i.cantidad, 0);
    },

    suscribir(fn) {
      suscriptores.add(fn);
      fn(items.map((i) => ({ ...i }))); // estado actual al entrar
      return () => suscriptores.delete(fn);
    },

    async validar() {
      const cuerpo = {
        items: items.map((i) => ({
          productoId: i.productoId,
          cantidad: i.cantidad,
        })),
      };
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cuerpo),
      });
      return (await res.json()) as CarritoValidado;
    },
  };
}

/**
 * Carrito COMPARTIDO por página: para que el botón "agregar" y el panel del
 * carrito vean el mismo estado y se enteren de los cambios entre sí. Los
 * componentes de UI por defecto lo usan. Un sitio puede seguir creando el
 * suyo con `crearCarrito` si prefiere manejar la instancia a mano.
 */
let instancia: Carrito | null = null;
export function obtenerCarrito(opciones?: OpcionesCarritoCliente): Carrito {
  if (!instancia) instancia = crearCarrito(opciones);
  return instancia;
}
