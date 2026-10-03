/**
 * CATÁLOGO EDITABLE: vive en KV y se edita desde el panel.
 *
 * Mientras nadie edite, rige el catálogo inicial del sitio (su JSON). La
 * primera vez que el panel guarda, el catálogo completo pasa a KV y desde
 * ahí manda KV. Así un sitio nuevo funciona sin instalar nada, y un
 * cambio del panel se ve sin reconstruir.
 *
 * Caché en memoria de 10 s por copia del worker: cada visita no puede ser
 * una lectura de KV (el plan gratis da 100.000 al día).
 */
import type { EnvBase } from "../../core/tipos";
import { crearCatalogo, validarCatalogo } from "./catalogo";
import type { Catalogo, CategoriaCatalogo, ProductoCatalogo } from "./tipos";

export const CLAVE_CATALOGO = "catalogo:productos";
const CACHE_MS = 10_000;

export interface FuenteCatalogo {
  /** Marca para distinguirla de un Catalogo fijo. */
  readonly dinamico: true;
  readonly categorias: CategoriaCatalogo[];
  /** El catálogo del JSON del sitio (lo que rige mientras nadie edite). */
  readonly inicial: Catalogo;
  obtener(env: EnvBase): Promise<Catalogo>;
  /** ¿Ya se editó alguna vez desde el panel? */
  editado(env: EnvBase): Promise<boolean>;
  guardar(env: EnvBase, productos: ProductoCatalogo[]): Promise<{ ok: boolean; motivo?: string }>;
}

export type CatalogoODinamico = Catalogo | FuenteCatalogo;

export function esDinamico(c: CatalogoODinamico): c is FuenteCatalogo {
  return (c as FuenteCatalogo).dinamico === true;
}

/** Catálogo vigente para esta petición, sea fijo o editable. */
export async function resolverCatalogo(c: CatalogoODinamico, env: EnvBase): Promise<Catalogo> {
  return esDinamico(c) ? c.obtener(env) : c;
}

export function crearCatalogoEditable(
  productosIniciales: ProductoCatalogo[],
  categorias: CategoriaCatalogo[] = []
): FuenteCatalogo {
  const inicial = crearCatalogo(productosIniciales, categorias);
  // Caché por almacén: en producción hay uno solo, pero así dos entornos
  // (pruebas, vista previa) nunca se ven los datos entre sí.
  const caches = new WeakMap<object, { catalogo: Catalogo; editado: boolean; hasta: number }>();
  const SIN_KV = {};

  async function leer(env: EnvBase) {
    const ahora = Date.now();
    const llave = (env.REVIEWS_KV as object | undefined) ?? SIN_KV;
    const cache = caches.get(llave);
    if (cache && cache.hasta > ahora) return cache;
    let catalogo = inicial;
    let editado = false;
    const crudo = await env.REVIEWS_KV?.get(CLAVE_CATALOGO);
    if (crudo) {
      try {
        catalogo = crearCatalogo(JSON.parse(crudo) as ProductoCatalogo[], categorias);
        editado = true;
      } catch (e) {
        // Datos dañados: se sirve el inicial antes que romper la tienda,
        // y queda dicho en el registro.
        console.error("[catalogo] el catálogo guardado en KV no es válido; se usa el inicial", e);
      }
    }
    const nuevo = { catalogo, editado, hasta: ahora + CACHE_MS };
    caches.set(llave, nuevo);
    return nuevo;
  }

  return {
    dinamico: true,
    categorias,
    inicial,
    obtener: async (env) => (await leer(env)).catalogo,
    editado: async (env) => (await leer(env)).editado,
    async guardar(env, productos) {
      try {
        validarCatalogo(productos, categorias);
      } catch (e) {
        return { ok: false, motivo: e instanceof Error ? e.message.replace(/^\[catálogo\] /, "") : "Datos inválidos." };
      }
      if (!env.REVIEWS_KV) return { ok: false, motivo: "Falta la base de datos." };
      await env.REVIEWS_KV.put(CLAVE_CATALOGO, JSON.stringify(productos));
      caches.delete(env.REVIEWS_KV as object); // esta copia lo ve al instante; las demás en ≤10 s
      return { ok: true };
    },
  };
}
