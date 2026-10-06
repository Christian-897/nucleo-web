/**
 * PORTADA (CARRUSEL) DESDE EL PANEL.
 *
 *   GET  /api/admin/carrusel        carrusel vigente y si ya se editó
 *   POST /api/admin/carrusel        { accion: "guardar", carrusel } | { accion: "restablecer" }
 *   POST /api/admin/carrusel-foto   multipart "archivo": sube una foto y devuelve su dirección
 *
 * La pantalla sube primero la foto (si cambió) y después guarda el
 * carrusel completo con esa dirección. Todo se vuelve a validar aquí.
 * Al guardar, las fotos subidas que ya no usa ninguna diapositiva se borran.
 */
import type { FuenteCarrusel } from "../carrusel/almacen";
import { LIMITES } from "../carrusel/tipos";
import type { EstadoCarrusel } from "../carrusel/tipos";
import { MAXIMO_BYTES_FOTO, type ConfigPanel } from "./config";
import { type Ctx, exigirSesion, jsonResponse, leerJson } from "./http";
import { borrarFoto, direccionMediaValida, guardarFoto, medidasAceptables, tipoRealDeImagen } from "./imagenes";

const fotosDe = (e: EstadoCarrusel) => new Set(e.diapositivas.map((d) => d.imagen).filter(direccionMediaValida));

async function borrarSobrantes(ctx: Ctx, antes: EstadoCarrusel, despues: EstadoCarrusel | null) {
  const siguen = despues ? fotosDe(despues) : new Set<string>();
  for (const f of fotosDe(antes)) if (!siguen.has(f)) await borrarFoto(ctx.env, f);
}

export function crearGestionCarrusel(fuente: FuenteCarrusel, config: ConfigPanel) {
  async function get(ctx: Ctx): Promise<Response> {
    const s = await exigirSesion(ctx, false);
    if (s instanceof Response) return s;
    return jsonResponse(200, {
      editado: await fuente.editado(ctx.env),
      carrusel: await fuente.obtener(ctx.env),
      limites: LIMITES,
    });
  }

  async function post(ctx: Ctx): Promise<Response> {
    const s = await exigirSesion(ctx, true);
    if (s instanceof Response) return s;
    const cuerpo = await leerJson(ctx.request);
    if (!cuerpo) return jsonResponse(400, { message: "Solicitud inválida." });
    const antes = await fuente.obtener(ctx.env);

    if (cuerpo.accion === "guardar") {
      const r = await fuente.guardar(ctx.env, cuerpo.carrusel);
      if (!r.ok) return jsonResponse(400, { message: r.motivo, errores: r.errores ?? {} });
      // Después de guardar: si algo falla a mitad, nunca queda una diapositiva sin su foto.
      await borrarSobrantes(ctx, antes, r.estado);
      return jsonResponse(200, { ok: true, carrusel: r.estado });
    }
    if (cuerpo.accion === "restablecer") {
      const r = await fuente.restablecer(ctx.env);
      if (!r.ok) return jsonResponse(500, { message: "No se pudo restablecer. Intenta de nuevo." });
      await borrarSobrantes(ctx, antes, fuente.inicial);
      return jsonResponse(200, { ok: true, carrusel: fuente.inicial });
    }
    return jsonResponse(400, { message: "Esa acción no existe." });
  }

  /** POST multipart: "archivo". La foto ya viene reducida desde el navegador. */
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
    const archivo = form.get("archivo");
    if (!archivo || typeof archivo === "string") return jsonResponse(400, { message: "No llegó ninguna foto." });
    if (archivo.size === 0) return jsonResponse(400, { message: "El archivo está vacío." });
    if (archivo.size > maximo) return jsonResponse(413, { message: "La foto pesa demasiado. Intenta con otra." });

    const datos = await archivo.arrayBuffer();
    const bytes = new Uint8Array(datos);
    const tipo = tipoRealDeImagen(bytes);
    if (!tipo) return jsonResponse(400, { message: "El archivo no es una foto válida. Usa JPG, PNG o WebP." });
    const medidas = medidasAceptables(bytes, config.maximoLadoFoto);
    if (!medidas.ok) return jsonResponse(400, { message: medidas.motivo || "Esa foto no se puede usar." });

    const guardada = await guardarFoto(ctx.env, "portada", datos, tipo);
    if (!guardada.ok || !guardada.direccion) return jsonResponse(500, { message: "No se pudo guardar la foto." });
    return jsonResponse(200, { ok: true, imagen: guardada.direccion });
  }

  return { get, post, foto };
}
