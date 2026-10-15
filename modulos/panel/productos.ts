/**
 * PRODUCTOS DESDE EL PANEL: crear, editar, eliminar y manejar sus fotos
 * (hasta MAXIMO_FOTOS; la primera es la principal).
 *
 * Todo lo que llega se valida y se limpia aquí (nunca se confía en la
 * pantalla). El id del producto se crea una vez desde el nombre y no
 * cambia más: es la dirección pública /producto/<id>/.
 *
 * Stock: la pantalla muestra y edita lo DISPONIBLE. Si cambia, ese número
 * pasa a ser el stock y se reinicia el contador de vendidos; si no se
 * toca, las ventas siguen descontando normal.
 */
import { normalizeInput } from "../../core/validar";
import type { FuenteCatalogo } from "../catalogo/almacen";
import { ID_VALIDO, MAXIMO_FOTOS } from "../catalogo/catalogo";
import { productoDisponible, reponerStock, unidadesVendidas } from "../catalogo/stock";
import type { ProductoCatalogo } from "../catalogo/tipos";
import { idVideoYoutube } from "../catalogo/video";
import { MAXIMO_BYTES_FOTO, type ConfigPanel } from "./config";
import { type Ctx, exigirSesion, jsonResponse, leerJson } from "./http";
import { borrarFoto, direccionMediaValida, guardarFoto, medidasAceptables, tipoRealDeImagen } from "./imagenes";

const PRECIO_MAXIMO = 100_000_000;
const STOCK_MAXIMO = 100_000;

/** "Gatito de Peluche (grande)" → "gatito-de-peluche-grande" */
export function idDesdeNombre(nombre: string, usados: Set<string>): string {
  const base =
    nombre
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 50)
      .replace(/-+$/g, "") || "producto";
  let id = base;
  for (let n = 2; usados.has(id); n++) id = `${base}-${n}`;
  return id;
}

/** Imagen aceptable: una foto subida al panel o una del propio sitio. */
function imagenValida(v: unknown): v is string {
  return direccionMediaValida(v) || (typeof v === "string" && /^\/img\/[a-zA-Z0-9/_.-]{1,150}$/.test(v) && !v.includes(".."));
}

/** Todas las fotos de un producto, la principal primero. */
export function fotosDe(p: Pick<ProductoCatalogo, "imagen" | "fotos">): string[] {
  return [...(p.imagen ? [p.imagen] : []), ...(p.fotos ?? [])];
}

/** Deja `fotos` como galería: la primera pasa a ser la principal. */
function ponerFotos(p: ProductoCatalogo, todas: string[]) {
  if (todas.length) p.imagen = todas[0];
  else delete p.imagen;
  if (todas.length > 1) p.fotos = todas.slice(1);
  else delete p.fotos;
}

export interface EntradaProducto {
  id?: string;
  nombre: string;
  precio: number;
  /** null = sin límite. */
  disponible: number | null;
  categoria: string;
  tipo: "fisico" | "digital";
  descripcion: string;
  destacado: boolean;
  /** Código del video de YouTube, o null si no tiene. */
  video: string | null;
}

/** Valida y limpia lo que mandó la pantalla. Devuelve errores por campo. */
export function validarEntrada(
  crudo: unknown,
  categorias: { id: string }[]
): { ok: true; datos: EntradaProducto } | { ok: false; errores: Record<string, string> } {
  const e: Record<string, string> = {};
  const o = (crudo && typeof crudo === "object" ? crudo : {}) as Record<string, unknown>;
  const texto = (v: unknown, saltos = false) => (typeof v === "string" ? normalizeInput(v, { allowNewlines: saltos }) : "");

  const nombre = texto(o.nombre);
  if (nombre.length < 2) e.nombre = "Escribe al menos 2 caracteres.";
  else if (nombre.length > 80) e.nombre = "Máximo 80 caracteres.";

  const descripcion = texto(o.descripcion, true);
  if (descripcion.length > 1000) e.descripcion = "Máximo 1.000 caracteres.";

  const precio = typeof o.precio === "string" ? Number(o.precio.replace(/[.\s$]/g, "")) : o.precio;
  if (typeof precio !== "number" || !Number.isInteger(precio) || precio < 1 || precio > PRECIO_MAXIMO) {
    e.precio = "Escribe el precio en pesos, sin decimales (ej: 15000).";
  }

  let disponible: number | null = null;
  if (o.disponible !== null && o.disponible !== undefined && o.disponible !== "") {
    const d = typeof o.disponible === "string" ? Number(o.disponible) : o.disponible;
    if (typeof d !== "number" || !Number.isInteger(d) || d < 0 || d > STOCK_MAXIMO) {
      e.disponible = "Escribe un número entero, o déjalo vacío para que no tenga límite.";
    } else disponible = d;
  }

  const categoria = typeof o.categoria === "string" ? o.categoria : "";
  if (!categorias.some((c) => c.id === categoria)) e.categoria = "Elige una categoría.";

  const tipo = o.tipo === "digital" ? "digital" : o.tipo === "fisico" ? "fisico" : null;
  if (!tipo) e.tipo = "Elige si es físico o digital.";

  let video: string | null = null;
  const textoVideo = typeof o.video === "string" ? o.video.trim() : "";
  if (textoVideo) {
    video = idVideoYoutube(textoVideo);
    if (!video) e.video = "Pega el enlace de un video de YouTube (ej: https://youtu.be/…), o déjalo vacío.";
  }

  const id = o.id === undefined || o.id === null || o.id === "" ? undefined : o.id;
  if (id !== undefined && (typeof id !== "string" || !ID_VALIDO.test(id))) e.id = "Producto inválido.";

  if (Object.keys(e).length) return { ok: false, errores: e };
  return {
    ok: true,
    datos: {
      id: id as string | undefined,
      nombre,
      descripcion,
      precio: precio as number,
      disponible,
      categoria,
      tipo: tipo as "fisico" | "digital",
      destacado: o.destacado === true,
      video,
    },
  };
}

export function crearGestionProductos(catalogo: FuenteCatalogo, config: ConfigPanel) {
  async function listar(ctx: Ctx): Promise<Response> {
    const s = await exigirSesion(ctx, false);
    if (s instanceof Response) return s;
    const vigente = await catalogo.obtener(ctx.env);
    const productos = [];
    for (const p of vigente.productos) {
      const d = await productoDisponible(vigente, ctx.env, p.id);
      productos.push({
        ...p,
        disponible: p.stock === undefined ? null : Number(d?.stock ?? 0),
        vendidos: p.stock === undefined ? null : await unidadesVendidas(ctx.env, p.id),
      });
    }
    // Los nombres de categoría vigentes (pueden haberse cambiado en el panel).
    const categorias = vigente.categorias.map((c) => ({ id: c.id, nombre: c.nombre }));
    return jsonResponse(200, { editado: await catalogo.editado(ctx.env), categorias, productos });
  }

  async function guardar(ctx: Ctx, entrada: EntradaProducto): Promise<Response> {
    const vigente = await catalogo.obtener(ctx.env);
    const lista = vigente.productos.map((p) => ({ ...p }));
    let producto: ProductoCatalogo;
    let reponer = false;

    if (entrada.id) {
      const i = lista.findIndex((p) => p.id === entrada.id);
      if (i < 0) return jsonResponse(404, { message: "Ese producto ya no existe. Recarga la página." });
      const actual = lista[i];
      const disponibleAhora =
        actual.stock === undefined ? null : Number((await productoDisponible(vigente, ctx.env, actual.id))?.stock ?? 0);
      producto = {
        ...actual,
        nombre: entrada.nombre,
        precio: entrada.precio,
        categoria: entrada.categoria,
        tipo: entrada.tipo,
        descripcion: entrada.descripcion,
        destacado: entrada.destacado,
      };
      if (entrada.video) producto.video = entrada.video;
      else delete producto.video;
      if (entrada.disponible !== disponibleAhora) {
        reponer = true;
        if (entrada.disponible === null) delete producto.stock;
        else producto.stock = entrada.disponible;
      }
      lista[i] = producto;
    } else {
      producto = {
        id: idDesdeNombre(entrada.nombre, new Set(lista.map((p) => p.id))),
        nombre: entrada.nombre,
        precio: entrada.precio,
        categoria: entrada.categoria,
        tipo: entrada.tipo,
        descripcion: entrada.descripcion,
        destacado: entrada.destacado,
        ...(entrada.video ? { video: entrada.video } : {}),
        ...(entrada.disponible === null ? {} : { stock: entrada.disponible }),
      };
      reponer = true;
      lista.push(producto);
    }

    const r = await catalogo.guardar(ctx.env, lista);
    if (!r.ok) return jsonResponse(400, { message: r.motivo || "No se pudo guardar." });
    if (reponer) await reponerStock(ctx.env, producto.id);
    return jsonResponse(200, { ok: true, producto });
  }

  async function eliminar(ctx: Ctx, id: unknown): Promise<Response> {
    if (typeof id !== "string" || !ID_VALIDO.test(id)) return jsonResponse(400, { message: "Producto inválido." });
    const vigente = await catalogo.obtener(ctx.env);
    const quitado = vigente.productos.find((p) => p.id === id);
    if (!quitado) return jsonResponse(404, { message: "Ese producto ya no existe." });
    const r = await catalogo.guardar(ctx.env, vigente.productos.filter((p) => p.id !== id));
    if (!r.ok) return jsonResponse(400, { message: r.motivo || "No se pudo eliminar." });
    // Las fotos se borran DESPUÉS de sacar el producto: si algo falla a mitad,
    // nunca queda un producto apuntando a una foto que no existe.
    for (const f of fotosDe(quitado)) await borrarFoto(ctx.env, f);
    await reponerStock(ctx.env, id);
    return jsonResponse(200, { ok: true });
  }

  async function post(ctx: Ctx): Promise<Response> {
    const s = await exigirSesion(ctx, true);
    if (s instanceof Response) return s;
    const cuerpo = await leerJson(ctx.request);
    if (!cuerpo) return jsonResponse(400, { message: "Solicitud inválida." });
    if (cuerpo.accion === "eliminar") return eliminar(ctx, cuerpo.id);
    if (cuerpo.accion === "fotos") return ordenarFotos(ctx, cuerpo.id, cuerpo.fotos);
    if (cuerpo.accion === "guardar") {
      const v = validarEntrada(cuerpo.producto, catalogo.categorias);
      if (!v.ok) return jsonResponse(400, { message: "Revisa los campos marcados.", errores: v.errores });
      return guardar(ctx, v.datos);
    }
    return jsonResponse(400, { message: "Esa acción no existe." });
  }

  /**
   * Orden final de las fotos de un producto: la primera es la principal.
   * Solo se aceptan fotos que el producto YA tiene (reordenar o quitar);
   * las que se quitan se borran del almacén.
   */
  async function ordenarFotos(ctx: Ctx, id: unknown, fotos: unknown): Promise<Response> {
    if (typeof id !== "string" || !ID_VALIDO.test(id)) return jsonResponse(400, { message: "Producto inválido." });
    if (!Array.isArray(fotos) || fotos.length > MAXIMO_FOTOS || fotos.some((f) => typeof f !== "string")) {
      return jsonResponse(400, { message: "La lista de fotos no es válida." });
    }
    const vigente = await catalogo.obtener(ctx.env);
    const lista = vigente.productos.map((p) => ({ ...p }));
    const i = lista.findIndex((p) => p.id === id);
    if (i < 0) return jsonResponse(404, { message: "Ese producto ya no existe. Recarga la página." });
    const actuales = fotosDe(lista[i]);
    const nuevas = [...new Set(fotos as string[])];
    if (nuevas.some((f) => !actuales.includes(f))) {
      return jsonResponse(400, { message: "Las fotos cambiaron mientras editabas. Recarga la página." });
    }
    ponerFotos(lista[i], nuevas);
    const r = await catalogo.guardar(ctx.env, lista);
    if (!r.ok) return jsonResponse(400, { message: r.motivo || "No se pudieron guardar las fotos." });
    for (const f of actuales) if (!nuevas.includes(f)) await borrarFoto(ctx.env, f);
    return jsonResponse(200, { ok: true, imagen: lista[i].imagen ?? null, fotos: lista[i].fotos ?? [] });
  }

  /**
   * POST multipart: id + archivo (+ modo). La foto ya viene reducida desde el navegador.
   *   modo "agregar": se suma al final de la galería (hasta MAXIMO_FOTOS).
   *   sin modo: reemplaza la foto principal (como antes).
   */
  async function foto(ctx: Ctx): Promise<Response> {
    const s = await exigirSesion(ctx, true);
    if (s instanceof Response) return s;
    const maximo = config.maximoBytesFoto ?? MAXIMO_BYTES_FOTO;
    if (Number(ctx.request.headers.get("Content-Length") || "0") > maximo + 64 * 1024) {
      return jsonResponse(413, { message: "La foto pesa demasiado. Intenta con otra." });
    }
    let form: FormData;
    try {
      form = await ctx.request.formData();
    } catch {
      return jsonResponse(400, { message: "Solicitud inválida." });
    }
    const id = form.get("id");
    const archivo = form.get("archivo");
    const agregar = form.get("modo") === "agregar";
    if (typeof id !== "string" || !ID_VALIDO.test(id)) return jsonResponse(400, { message: "Producto inválido." });
    if (!archivo || typeof archivo === "string") return jsonResponse(400, { message: "No llegó ninguna foto." });
    if (archivo.size === 0) return jsonResponse(400, { message: "El archivo está vacío." });
    if (archivo.size > maximo) return jsonResponse(413, { message: "La foto pesa demasiado. Intenta con otra." });

    const datos = await archivo.arrayBuffer();
    const bytes = new Uint8Array(datos);
    const tipo = tipoRealDeImagen(bytes);
    if (!tipo) return jsonResponse(400, { message: "El archivo no es una foto válida. Usa JPG, PNG o WebP." });
    const medidas = medidasAceptables(bytes, config.maximoLadoFoto);
    if (!medidas.ok) return jsonResponse(400, { message: medidas.motivo || "Esa foto no se puede usar." });

    const vigente = await catalogo.obtener(ctx.env);
    const lista = vigente.productos.map((p) => ({ ...p }));
    const i = lista.findIndex((p) => p.id === id);
    if (i < 0) return jsonResponse(404, { message: "Ese producto ya no existe. Recarga la página." });
    if (agregar && fotosDe(lista[i]).length >= MAXIMO_FOTOS) {
      return jsonResponse(400, { message: `Cada producto puede tener hasta ${MAXIMO_FOTOS} fotos.` });
    }

    const guardada = await guardarFoto(ctx.env, `producto-${id}`, datos, tipo);
    if (!guardada.ok || !guardada.direccion) return jsonResponse(500, { message: "No se pudo guardar la foto." });
    const anterior = agregar ? undefined : lista[i].imagen;
    if (agregar) ponerFotos(lista[i], [...fotosDe(lista[i]), guardada.direccion]);
    else lista[i].imagen = guardada.direccion;
    const r = await catalogo.guardar(ctx.env, lista);
    if (!r.ok) {
      await borrarFoto(ctx.env, guardada.direccion);
      return jsonResponse(500, { message: r.motivo || "No se pudo guardar la foto." });
    }
    if (anterior && anterior !== guardada.direccion) await borrarFoto(ctx.env, anterior);
    return jsonResponse(200, { ok: true, imagen: guardada.direccion, fotos: fotosDe(lista[i]) });
  }

  return { listar, post, foto, imagenValida };
}
