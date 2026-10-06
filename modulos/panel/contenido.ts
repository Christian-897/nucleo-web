/**
 * DISEÑO Y TEXTOS DESDE EL PANEL (módulo contenido).
 *
 *   GET  /api/admin/contenido        esquema, valores, tipografías y avisos de contraste
 *   POST /api/admin/contenido        { accion: "guardar", valores: { clave: valor } }
 *                                    { accion: "restablecer", claves?: string[] }
 *   POST /api/admin/contenido-foto   multipart: clave + archivo (campo de tipo imagen)
 *
 * Los colores se aceptan aunque tengan poco contraste ("libre con aviso"):
 * el aviso vuelve en la respuesta para que la pantalla lo muestre.
 */
import type { FuenteContenido } from "../contenido/almacen";
import { COMBINACIONES, cssDeFuente, FUENTES } from "../contenido/fuentes";
import { MAXIMO_BYTES_FOTO, type ConfigPanel } from "./config";
import { type Ctx, exigirSesion, jsonResponse, leerJson } from "./http";
import { borrarFoto, direccionMediaValida, guardarFoto, medidasAceptables, tipoRealDeImagen } from "./imagenes";

export function crearGestionContenido(fuente: FuenteContenido, config: ConfigPanel) {
  const campos = new Map(fuente.esquema.campos.map((c) => [c.clave, c]));
  const imagenes = fuente.esquema.campos.filter((c) => c.tipo === "imagen").map((c) => c.clave);

  /** Fotos subidas que dejaron de usarse: se borran DESPUÉS de guardar. */
  async function borrarSobrantes(ctx: Ctx, antes: Record<string, string>) {
    const ahora = await fuente.obtener(ctx.env);
    const usadas = new Set(imagenes.map((k) => ahora.valores[k]));
    for (const k of imagenes) {
      const f = antes[k];
      if (f && !usadas.has(f) && direccionMediaValida(f)) await borrarFoto(ctx.env, f);
    }
  }

  async function get(ctx: Ctx): Promise<Response> {
    const s = await exigirSesion(ctx, false);
    if (s instanceof Response) return s;
    const estado = await fuente.obtener(ctx.env);
    return jsonResponse(200, {
      esquema: fuente.esquema,
      valores: estado.valores,
      iniciales: fuente.iniciales,
      cambiados: Object.keys(estado.cambios),
      fuentes: FUENTES.map((f) => ({ id: f.id, nombre: f.nombre, familia: f.familia, roles: f.roles, css: cssDeFuente(f.id) })),
      combinaciones: COMBINACIONES,
      contraste: fuente.opciones.contraste ?? [],
      avisos: fuente.avisos(estado.valores),
    });
  }

  async function post(ctx: Ctx): Promise<Response> {
    const s = await exigirSesion(ctx, true);
    if (s instanceof Response) return s;
    const cuerpo = await leerJson(ctx.request);
    if (!cuerpo) return jsonResponse(400, { message: "Solicitud inválida." });
    const antes = (await fuente.obtener(ctx.env)).valores;

    if (cuerpo.accion === "guardar") {
      const entrada = cuerpo.valores;
      if (!entrada || typeof entrada !== "object" || Array.isArray(entrada)) return jsonResponse(400, { message: "Solicitud inválida." });
      // Las fotos se cambian solo por /contenido-foto (con su revisión de archivo).
      const sinFotos = Object.fromEntries(Object.entries(entrada as Record<string, unknown>).filter(([k]) => campos.get(k)?.tipo !== "imagen"));
      const r = await fuente.guardar(ctx.env, sinFotos);
      if (!r.ok) return jsonResponse(400, { message: r.motivo || "Revisa los campos marcados.", errores: r.errores ?? {} });
      const estado = await fuente.obtener(ctx.env);
      return jsonResponse(200, { ok: true, valores: estado.valores, cambiados: Object.keys(estado.cambios), avisos: fuente.avisos(estado.valores) });
    }
    if (cuerpo.accion === "restablecer") {
      const claves = Array.isArray(cuerpo.claves) ? cuerpo.claves.filter((k): k is string => typeof k === "string" && campos.has(k)) : undefined;
      const r = await fuente.restablecer(ctx.env, claves);
      if (!r.ok) return jsonResponse(500, { message: "No se pudo restablecer. Intenta de nuevo." });
      await borrarSobrantes(ctx, antes);
      const estado = await fuente.obtener(ctx.env);
      return jsonResponse(200, { ok: true, valores: estado.valores, cambiados: Object.keys(estado.cambios), avisos: fuente.avisos(estado.valores) });
    }
    return jsonResponse(400, { message: "Esa acción no existe." });
  }

  /** POST multipart: clave (campo de tipo imagen) + archivo, ya reducido en el navegador. */
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
    const clave = form.get("clave");
    const archivo = form.get("archivo");
    if (typeof clave !== "string" || campos.get(clave)?.tipo !== "imagen") return jsonResponse(400, { message: "Ese campo no es una foto." });
    if (!archivo || typeof archivo === "string") return jsonResponse(400, { message: "No llegó ninguna foto." });
    if (archivo.size === 0) return jsonResponse(400, { message: "El archivo está vacío." });
    if (archivo.size > maximo) return jsonResponse(413, { message: "La foto pesa demasiado. Intenta con otra." });
    const datos = await archivo.arrayBuffer();
    const bytes = new Uint8Array(datos);
    const tipo = tipoRealDeImagen(bytes);
    if (!tipo) return jsonResponse(400, { message: "El archivo no es una foto válida. Usa JPG, PNG o WebP." });
    const medidas = medidasAceptables(bytes, config.maximoLadoFoto);
    if (!medidas.ok) return jsonResponse(400, { message: medidas.motivo || "Esa foto no se puede usar." });

    const antes = (await fuente.obtener(ctx.env)).valores;
    const guardada = await guardarFoto(ctx.env, `sitio-${clave.replace(/[^a-z0-9]/gi, "-")}`.slice(0, 50), datos, tipo);
    if (!guardada.ok || !guardada.direccion) return jsonResponse(500, { message: "No se pudo guardar la foto." });
    const r = await fuente.guardar(ctx.env, { [clave]: guardada.direccion });
    if (!r.ok) {
      await borrarFoto(ctx.env, guardada.direccion);
      return jsonResponse(500, { message: r.motivo || "No se pudo guardar la foto." });
    }
    await borrarSobrantes(ctx, antes);
    return jsonResponse(200, { ok: true, imagen: guardada.direccion });
  }

  return { get, post, foto };
}
