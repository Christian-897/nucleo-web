/**
 * CATEGORÍAS DESDE EL PANEL: crear, borrar (solo vacías) y cambiar nombre,
 * nombre corto, bajada, texto de la página (descripcion, v0.44) y foto.
 *
 *   GET  /api/admin/categorias        lista con lo vigente y lo original del sitio
 *   POST /api/admin/categorias        { accion: "guardar", id, categoria: { nombre, corto, bajada, descripcion?, subcategorias? } }
 *                                     { accion: "crear", categoria: { nombre, corto, bajada } }
 *                                     { accion: "borrar", id }  (solo si no tiene productos)
 *                                     { accion: "restablecer" }  (nombres y fotos vuelven a los del sitio)
 *   POST /api/admin/categoria-foto    multipart: id + archivo
 *
 * Una categoría nueva no tiene página estática: el borde la arma desde la
 * plantilla del sitio y la agrega a los menús (ver catalogo/borde.ts). Por
 * eso hay un tope (MAXIMO_NUEVAS): son los espacios que el sitio deja.
 */
import type { FuenteCatalogo } from "../catalogo/almacen";
import { LIMITES_CATEGORIA, limpiarTextoLargo, MAXIMO_NUEVAS, MAXIMO_SUBCATEGORIAS, validarCambioCategoria, type CambiosCategorias } from "../catalogo/categorias";
import { idDesdeNombre } from "./productos";
import { MAXIMO_BYTES_FOTO, type ConfigPanel } from "./config";
import { type Ctx, exigirSesion, jsonResponse, leerJson } from "./http";
import { borrarFoto, direccionMediaValida, guardarFoto, medidasAceptables, tipoRealDeImagen } from "./imagenes";

export function crearGestionCategorias(catalogo: FuenteCatalogo, config: ConfigPanel) {
  /** ¿Existe HOY (del sitio sin borrar, o creada en el panel)? */
  const existe = async (ctx: Ctx, id: unknown): Promise<boolean> =>
    typeof id === "string" && Boolean((await catalogo.obtener(ctx.env)).categoria(id));

  async function get(ctx: Ctx): Promise<Response> {
    const s = await exigirSesion(ctx, false);
    if (s instanceof Response) return s;
    const vigente = await catalogo.obtener(ctx.env);
    const cambios = await catalogo.cambiosCategorias(ctx.env);
    const estructura = await catalogo.estructuraCategorias(ctx.env);
    const categorias = vigente.categorias.map((c) => {
      const nueva = estructura.nuevas.find((n) => n.id === c.id);
      const original = catalogo.categorias.find((o) => o.id === c.id) ?? { nombre: nueva?.nombre ?? c.nombre, corto: nueva?.nombre ?? "", bajada: "", descripcion: "" };
      return {
        id: c.id,
        nombre: c.nombre,
        corto: c.corto ?? "",
        bajada: typeof c.bajada === "string" ? c.bajada : "",
        descripcion: typeof c.descripcion === "string" ? c.descripcion : "",
        imagen: typeof c.imagen === "string" ? c.imagen : "",
        productos: vigente.deCategoria(c.id).length,
        // Subcategorías (v0.39) con cuántos productos tiene cada una.
        subcategorias: (c.subcategorias ?? []).map((x) => ({ id: x.id, nombre: x.nombre, productos: vigente.deCategoria(c.id).filter((p) => p.subcategoria === x.id).length })),
        editada: Boolean(cambios[c.id]),
        nueva: Boolean(nueva),
        original: {
          nombre: original.nombre,
          corto: original.corto ?? "",
          bajada: typeof original.bajada === "string" ? original.bajada : "",
          descripcion: typeof original.descripcion === "string" ? original.descripcion : "",
        },
      };
    });
    return jsonResponse(200, {
      editadas: Object.keys(cambios).length > 0,
      categorias,
      limites: LIMITES_CATEGORIA,
      maximoSubcategorias: MAXIMO_SUBCATEGORIAS,
      nuevas: estructura.nuevas.length,
      maximoNuevas: MAXIMO_NUEVAS,
    });
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

    if (cuerpo.accion === "crear") {
      const v = validarCambioCategoria(cuerpo.categoria);
      if (!v.ok) return jsonResponse(400, { message: "Revisa los campos marcados.", errores: v.errores });
      const estructura = await catalogo.estructuraCategorias(ctx.env);
      if (estructura.nuevas.length >= MAXIMO_NUEVAS) {
        return jsonResponse(400, { message: `Puedes crear hasta ${MAXIMO_NUEVAS} categorías nuevas. Borra una que no uses para crear otra.` });
      }
      const vigente = await catalogo.obtener(ctx.env);
      if (vigente.categorias.some((c) => c.nombre.toLowerCase() === v.datos.nombre!.toLowerCase())) {
        return jsonResponse(400, { message: "Ya hay una categoría con ese nombre.", errores: { nombre: "Ya existe una categoría con ese nombre." } });
      }
      // El id (su dirección /tienda/<id>/) no puede repetir ninguno, ni el de una categoría del sitio borrada.
      const usados = new Set([...catalogo.categorias.map((c) => c.id), ...estructura.nuevas.map((n) => n.id), "plantilla"]);
      const id = idDesdeNombre(v.datos.nombre!, usados);
      const r = await catalogo.guardarEstructuraCategorias(ctx.env, {
        ...estructura,
        nuevas: [...estructura.nuevas, { id, nombre: v.datos.nombre!, creada: new Date().toISOString() }],
      });
      if (!r.ok) return jsonResponse(500, { message: r.motivo || "No se pudo crear." });
      // Nombre corto y bajada van como cambios, igual que en las demás.
      const cambios = { ...antes, [id]: { ...v.datos } };
      const error = await guardarCambios(ctx, cambios, antes);
      return error ?? jsonResponse(200, { ok: true, id });
    }
    if (cuerpo.accion === "borrar") {
      const id = cuerpo.id;
      const vigente = await catalogo.obtener(ctx.env);
      if (typeof id !== "string" || !vigente.categoria(id)) return jsonResponse(404, { message: "Esa categoría ya no existe. Recarga la página." });
      const n = vigente.deCategoria(id).length;
      if (n > 0) {
        return jsonResponse(409, {
          message: `Esta categoría tiene ${n} ${n === 1 ? "producto" : "productos"}. Muévelos a otra categoría (o elimínalos) y vuelve a intentar.`,
        });
      }
      if (vigente.categorias.length <= 1) return jsonResponse(409, { message: "La tienda necesita al menos una categoría." });
      const estructura = await catalogo.estructuraCategorias(ctx.env);
      const esNueva = estructura.nuevas.some((x) => x.id === id);
      const r = await catalogo.guardarEstructuraCategorias(ctx.env, {
        nuevas: estructura.nuevas.filter((x) => x.id !== id),
        ocultas: esNueva ? estructura.ocultas : [...estructura.ocultas, id],
      });
      if (!r.ok) return jsonResponse(500, { message: r.motivo || "No se pudo borrar." });
      const { [id]: _quitado, ...resto } = antes;
      const error = await guardarCambios(ctx, resto, antes);
      return error ?? jsonResponse(200, { ok: true });
    }
    if (cuerpo.accion === "guardar") {
      if (!(await existe(ctx, cuerpo.id))) return jsonResponse(404, { message: "Esa categoría no existe. Recarga la página." });
      const v = validarCambioCategoria(cuerpo.categoria);
      if (!v.ok) return jsonResponse(400, { message: "Revisa los campos marcados.", errores: v.errores });
      const id = cuerpo.id as string;
      const cambio = { ...antes[id], ...v.datos };
      // Si el texto queda igual al que trae el sitio, no se guarda: así un texto
      // nuevo que se prepare en el sitio llega solo, mientras nadie lo cambie.
      const delSitio = catalogo.categorias.find((o) => o.id === id)?.descripcion;
      if (cambio.descripcion !== undefined && cambio.descripcion === (typeof delSitio === "string" ? limpiarTextoLargo(delSitio, LIMITES_CATEGORIA.descripcion) : "")) delete cambio.descripcion;
      const cambios = { ...antes, [id]: cambio };
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
    if (typeof id !== "string" || !(await existe(ctx, id))) return jsonResponse(404, { message: "Esa categoría no existe. Recarga la página." });
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
    const original = (await catalogo.obtener(ctx.env)).categoria(id)!;
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
