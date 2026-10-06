/**
 * CATEGORÍAS DESDE EL PANEL: cambiar nombre, nombre corto y foto.
 *
 *   GET  /api/admin/categorias        lista con lo vigente y lo original del sitio
 *   POST /api/admin/categorias        { accion: "guardar", id, categoria: { nombre, corto } }
 *                                     { accion: "restablecer" }  (todas vuelven a las del sitio)
 *   POST /api/admin/categoria-foto    multipart: id + archivo
 *
 * Crear o borrar categorías no se hace aquí: cada una tiene su página
 * (/tienda/<id>/) y eso se arma en el código del sitio.
 */
import type { FuenteCatalogo } from "../catalogo/almacen";
import { LIMITES_CATEGORIA, validarCambioCategoria, type CambiosCategorias } from "../catalogo/categorias";
import { MAXIMO_BYTES_FOTO, type ConfigPanel } from "./config";
import { type Ctx, exigirSesion, jsonResponse, leerJson } from "./http";
import { borrarFoto, direccionMediaValida, guardarFoto, medidasAceptables, tipoRealDeImagen } from "./imagenes";

export function crearGestionCategorias(catalogo: FuenteCatalogo, config: ConfigPanel) {
  const existe = (id: unknown): id is string => typeof id === "string" && catalogo.categorias.some((c) => c.id === id);

  async function get(ctx: Ctx): Promise<Response> {
    const s = await exigirSesion(ctx, false);
    if (s instanceof Response) return s;
    const vigente = await catalogo.obtener(ctx.env);
    const cambios = await catalogo.cambiosCategorias(ctx.env);
    const categorias = vigente.categorias.map((c) => {
      const original = catalogo.categorias.find((o) => o.id === c.id)!;
      return {
        id: c.id,
        nombre: c.nombre,
        corto: c.corto ?? "",
        imagen: typeof c.imagen === "string" ? c.imagen : "",
        productos: vigente.deCategoria(c.id).length,
        editada: Boolean(cambios[c.id]),
        original: { nombre: original.nombre, corto: original.corto ?? "" },
      };
    });
    return jsonResponse(200, { editadas: Object.keys(cambios).length > 0, categorias, limites: LIMITES_CATEGORIA });
  }

  async function guardarCambios(ctx: Ctx, cambios: CambiosCategorias, antes: CambiosCategorias): Promise<Response | null> {
    const r = await catalogo.guardarCambiosCategorias(ctx.env, cambios);
    if (!r.ok) return jsonResponse(500, { message: r.motivo || "No se pudo guardar." });
    // Fotos subidas que ya no usa ninguna categoría: se borran DESPUÉS de guardar.
    const siguen = new Set(Object.values(cambios).map((c) => c.imagen));
    for (const c of Object.values(antes)) if (c.imagen && !siguen.has(c.imagen) && direccionMediaValida(c.imagen)) await borrarFoto(ctx.env, c.imagen);
    return null;
  }

  async function post(ctx: Ctx): Promise<Response> {
    const s = await exigirSesion(ctx, true);
    if (s instanceof Response) return s;
    const cuerpo = await leerJson(ctx.request);
    if (!cuerpo) return jsonResponse(400, { message: "Solicitud inválida." });
    const antes = await catalogo.cambiosCategorias(ctx.env);

    if (cuerpo.accion === "guardar") {
      if (!existe(cuerpo.id)) return jsonResponse(404, { message: "Esa categoría no existe. Recarga la página." });
      const v = validarCambioCategoria(cuerpo.categoria);
      if (!v.ok) return jsonResponse(400, { message: "Revisa los campos marcados.", errores: v.errores });
      const cambios = { ...antes, [cuerpo.id]: { ...antes[cuerpo.id], ...v.datos } };
      const error = await guardarCambios(ctx, cambios, antes);
      return error ?? jsonResponse(200, { ok: true });
    }
    if (cuerpo.accion === "restablecer") {
      const error = await guardarCambios(ctx, {}, antes);
      return error ?? jsonResponse(200, { ok: true });
    }
    return jsonResponse(400, { message: "Esa acción no existe." });
  }

  /** POST multipart: id + archivo (ya reducida en el navegador). */
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
    if (!existe(id)) return jsonResponse(404, { message: "Esa categoría no existe. Recarga la página." });
    if (!archivo || typeof archivo === "string") return jsonResponse(400, { message: "No llegó ninguna foto." });
    if (archivo.size === 0) return jsonResponse(400, { message: "El archivo está vacío." });
    if (archivo.size > maximo) return jsonResponse(413, { message: "La foto pesa demasiado. Intenta con otra." });
    const datos = await archivo.arrayBuffer();
    const bytes = new Uint8Array(datos);
    const tipo = tipoRealDeImagen(bytes);
    if (!tipo) return jsonResponse(400, { message: "El archivo no es una foto válida. Usa JPG, PNG o WebP." });
    const medidas = medidasAceptables(bytes, config.maximoLadoFoto);
    if (!medidas.ok) return jsonResponse(400, { message: medidas.motivo || "Esa foto no se puede usar." });

    const guardada = await guardarFoto(ctx.env, `categoria-${id}`, datos, tipo);
    if (!guardada.ok || !guardada.direccion) return jsonResponse(500, { message: "No se pudo guardar la foto." });
    const antes = await catalogo.cambiosCategorias(ctx.env);
    const original = catalogo.categorias.find((c) => c.id === id)!;
    const cambios = { ...antes, [id]: { nombre: original.nombre, ...antes[id], imagen: guardada.direccion } };
    const error = await guardarCambios(ctx, cambios, antes);
    if (error) {
      await borrarFoto(ctx.env, guardada.direccion);
      return error;
    }
    return jsonResponse(200, { ok: true, imagen: guardada.direccion });
  }

  return { get, post, foto };
}
