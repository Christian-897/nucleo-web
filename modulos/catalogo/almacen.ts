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
import {
  CLAVE_CATEGORIAS,
  CLAVE_ESTRUCTURA,
  categoriasVigentes,
  ESTRUCTURA_VACIA,
  limpiarCambios,
  limpiarEstructura,
  type CambiosCategorias,
  type EstructuraCategorias,
} from "./categorias";
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
  /** ¿Ya se editaron los productos desde el panel? */
  editado(env: EnvBase): Promise<boolean>;
  guardar(env: EnvBase, productos: ProductoCatalogo[]): Promise<{ ok: boolean; motivo?: string }>;
  /** ¿Se cambió, creó o borró alguna categoría desde el panel? */
  categoriasEditadas(env: EnvBase): Promise<boolean>;
  /** Cambios guardados por id (lo que el panel cambió encima del sitio). */
  cambiosCategorias(env: EnvBase): Promise<CambiosCategorias>;
  guardarCambiosCategorias(env: EnvBase, cambios: CambiosCategorias): Promise<{ ok: boolean; motivo?: string }>;
  /** Categorías creadas y borradas desde el panel. */
  estructuraCategorias(env: EnvBase): Promise<EstructuraCategorias>;
  guardarEstructuraCategorias(env: EnvBase, estructura: EstructuraCategorias): Promise<{ ok: boolean; motivo?: string }>;
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
  const caches = new WeakMap<
    object,
    { catalogo: Catalogo; editado: boolean; cambios: CambiosCategorias; estructura: EstructuraCategorias; categoriasEditadas: boolean; hasta: number }
  >();
  const SIN_KV = {};

  async function leer(env: EnvBase) {
    const ahora = Date.now();
    const llave = (env.REVIEWS_KV as object | undefined) ?? SIN_KV;
    const cache = caches.get(llave);
    if (cache && cache.hasta > ahora) return cache;
    let catalogo = inicial;
    let editado = false;
    const [crudo, crudoCategorias, crudoEstructura] = await Promise.all([
      env.REVIEWS_KV?.get(CLAVE_CATALOGO),
      env.REVIEWS_KV?.get(CLAVE_CATEGORIAS),
      env.REVIEWS_KV?.get(CLAVE_ESTRUCTURA),
    ]);
    let estructura: EstructuraCategorias = ESTRUCTURA_VACIA;
    if (crudoEstructura) {
      try {
        estructura = limpiarEstructura(JSON.parse(crudoEstructura), categorias);
      } catch (e) {
        console.error("[catalogo] las categorías creadas/borradas en KV no son válidas; se usan las del sitio", e);
      }
    }
    const conNuevas = [...categorias, ...estructura.nuevas.map((n) => ({ id: n.id, nombre: n.nombre }))];
    let cambios: CambiosCategorias = {};
    if (crudoCategorias) {
      try {
        cambios = limpiarCambios(JSON.parse(crudoCategorias), conNuevas);
      } catch (e) {
        console.error("[catalogo] los cambios de categorías en KV no son válidos; se usan las del sitio", e);
      }
    }
    const categoriasEditadas = Object.keys(cambios).length > 0 || estructura.nuevas.length > 0 || estructura.ocultas.length > 0;
    let vigentes = categoriasEditadas ? categoriasVigentes(categorias, estructura, cambios) : categorias;
    // Productos: los editados en el panel (KV) si los hay y sirven; si no, los del sitio.
    let productos = productosIniciales;
    if (crudo) {
      try {
        const guardados = JSON.parse(crudo) as ProductoCatalogo[];
        catalogo = crearCatalogo(guardados, vigentes);
        productos = guardados;
        editado = true;
      } catch (e) {
        // Datos dañados: se sirve el inicial antes que romper la tienda,
        // y queda dicho en el registro.
        console.error("[catalogo] el catálogo guardado en KV no es válido; se usa el inicial", e);
      }
    }
    if (!editado && categoriasEditadas) {
      try {
        catalogo = crearCatalogo(productos, vigentes);
      } catch (e) {
        // Nunca debería pasar (solo se borran categorías vacías), pero la tienda no se cae por esto.
        console.error("[catalogo] las categorías del panel no calzan con los productos; se usan las del sitio", e);
        vigentes = categorias;
        estructura = ESTRUCTURA_VACIA;
      }
    }
    const nuevo = { catalogo, editado, cambios, estructura, categoriasEditadas, hasta: ahora + CACHE_MS };
    caches.set(llave, nuevo);
    return nuevo;
  }

  return {
    dinamico: true,
    categorias,
    inicial,
    obtener: async (env) => (await leer(env)).catalogo,
    editado: async (env) => (await leer(env)).editado,
    categoriasEditadas: async (env) => (await leer(env)).categoriasEditadas,
    cambiosCategorias: async (env) => (await leer(env)).cambios,
    estructuraCategorias: async (env) => (await leer(env)).estructura,
    async guardarEstructuraCategorias(env, estructura) {
      if (!env.REVIEWS_KV) return { ok: false, motivo: "Falta la base de datos." };
      const limpia = limpiarEstructura(estructura, categorias);
      try {
        if (limpia.nuevas.length || limpia.ocultas.length) await env.REVIEWS_KV.put(CLAVE_ESTRUCTURA, JSON.stringify(limpia));
        else await env.REVIEWS_KV.delete(CLAVE_ESTRUCTURA);
      } catch {
        return { ok: false, motivo: "No se pudo guardar. Intenta de nuevo." };
      }
      caches.delete(env.REVIEWS_KV as object);
      return { ok: true };
    },
    async guardarCambiosCategorias(env, cambios) {
      if (!env.REVIEWS_KV) return { ok: false, motivo: "Falta la base de datos." };
      const { estructura } = await leer(env);
      const limpios = limpiarCambios(cambios, [...categorias, ...estructura.nuevas.map((n) => ({ id: n.id, nombre: n.nombre }))]);
      try {
        if (Object.keys(limpios).length) await env.REVIEWS_KV.put(CLAVE_CATEGORIAS, JSON.stringify(limpios));
        else await env.REVIEWS_KV.delete(CLAVE_CATEGORIAS);
      } catch {
        return { ok: false, motivo: "No se pudo guardar. Intenta de nuevo." };
      }
      caches.delete(env.REVIEWS_KV as object);
      return { ok: true };
    },
    async guardar(env, productos) {
      try {
        // Contra las categorías VIGENTES: un producto puede ir a una categoría creada en el panel.
        validarCatalogo(productos, (await leer(env)).catalogo.categorias);
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
