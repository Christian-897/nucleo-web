/**
 * Fábrica del panel: un llamado arma todos los endpoints.
 *
 *   // src/servidor/panel.ts
 *   export const panel = crearPanel({ nombreSitio: "Mi Tienda", catalogo });
 *
 *   functions/api/admin/parametros.ts      export const { onRequestGet } = panel.parametros;
 *   functions/api/admin/instalar.ts        export const { onRequestPost } = panel.instalar;
 *   functions/api/admin/entrar.ts          export const { onRequestPost } = panel.entrar;
 *   functions/api/admin/segundo-factor.ts  export const { onRequestPost } = panel.segundoFactor;
 *   functions/api/admin/salir.ts           export const { onRequestPost } = panel.salir;
 *   functions/api/admin/sesion.ts          export const { onRequestGet } = panel.sesion;
 *   functions/api/admin/actividad.ts       export const { onRequestPost } = panel.actividad;
 *   functions/api/admin/seguridad.ts       export const { onRequestGet, onRequestPost } = panel.seguridad;
 *   functions/api/admin/productos.ts       export const { onRequestGet, onRequestPost } = panel.productos;
 *   functions/api/admin/producto-foto.ts   export const { onRequestPost } = panel.productoFoto;
 *   functions/api/admin/categorias.ts      export const { onRequestGet, onRequestPost } = panel.categorias;
 *   functions/api/admin/categoria-foto.ts  export const { onRequestPost } = panel.categoriaFoto;
 *   functions/api/admin/pedidos.ts         export const { onRequestGet, onRequestPost } = panel.pedidos;
 *   functions/api/admin/resumen.ts         export const { onRequestGet } = panel.resumen;
 *   functions/api/admin/visitas.ts         export const { onRequestGet } = panel.visitas;
 *   functions/api/admin/revision-pagos.ts  export const { onRequestGet } = panel.revisionPagos;
 *   functions/api/admin/carrusel.ts        export const { onRequestGet, onRequestPost } = panel.carrusel;
 *   functions/api/admin/contenido.ts       export const { onRequestGet, onRequestPost } = panel.contenido;
 *   functions/api/admin/contenido-foto.ts  export const { onRequestPost } = panel.contenidoFoto;
 *   functions/api/admin/carrusel-foto.ts   export const { onRequestPost } = panel.carruselFoto;
 *   functions/api/admin/suscriptores.ts    export const { onRequestGet, onRequestPost } = panel.suscriptores;
 *   functions/api/admin/boletines.ts       export const { onRequestGet, onRequestPost } = panel.boletines;
 *   functions/api/admin/boletin-foto.ts    export const { onRequestPost } = panel.boletinFoto;
 *   functions/api/admin/despacho.ts        export const { onRequestGet, onRequestPost } = panel.despacho;
 *   functions/api/admin/mensajes.ts        export const { onRequestGet, onRequestPost } = panel.mensajes;
 *   functions/media/[id].ts                export const { onRequestGet } = panel.media;
 *   functions/admin/_middleware.ts         export const { onRequest } = panel.cabeceras;
 *   functions/api/admin/_middleware.ts     export const { onRequest } = panel.cabeceras;
 */
import type { FuenteCarrusel } from "../carrusel/almacen";
import type { ConfigCotizacion } from "../cotizacion/config";
import type { FuenteCatalogo } from "../catalogo/almacen";
import type { FuenteContenido } from "../contenido/almacen";
import type { FuenteDespacho } from "../despacho/almacen";
import { COMUNAS_RM, REGIONES_FUERA_RM } from "../despacho/calculo";
import { listarActivos, quitarPorCorreo, respuestaCsv } from "../newsletter/servidor";
import * as acceso from "./acceso";
import type { ConfigPanel, EnvPanel } from "./config";
import { aplicarCabecerasPanel } from "./encabezados";
import { type Ctx, exigirSesion, jsonResponse, leerJson } from "./http";
import { identificadorValido, responderFoto } from "./imagenes";
import { crearGestionCarrusel } from "./carrusel";
import { crearGestionCategorias } from "./categorias";
import { crearGestionContenido } from "./contenido";
import { type ConfigBoletines, crearGestionBoletines } from "./boletines";
import { type ConfigRevisionPagos, crearRevisionPagos } from "./revision-pagos";
import { crearGestionPedidos } from "./pedidos";
import { crearResumen } from "./resumen";
import { visitasPanel } from "./visitas";
import { crearGestionProductos } from "./productos";
import { crearGestionMensajes } from "./mensajes";

export interface OpcionesPanel extends ConfigPanel {
  /** Catálogo editable (crearCatalogoEditable). Sin él, no hay sección Productos. */
  catalogo?: FuenteCatalogo;
  /** Portada editable (crearCarruselEditable). Sin ella, no hay sección Portada. */
  carrusel?: FuenteCarrusel;
  /** Colores, tipografías y textos del sitio (crearContenidoEditable). Sin él, no hay pestaña "Diseño y textos". */
  contenido?: FuenteContenido;
  /**
   * Boletines a los suscriptores (la misma config del newsletter + urlPublica).
   * Sin ella, no hay sección "Boletines" en Suscriptores.
   */
  boletines?: ConfigBoletines;
  /**
   * Revisión de pagos con Flow (Resumen): compara lo cobrado en Flow con los
   * pedidos. `true` o sus opciones. Sin ella, no hay cuadro "Revisión de pagos".
   */
  revisionPagos?: boolean | ConfigRevisionPagos;
  /** Tarifas de despacho (crearDespachoEditable), la misma fuente que usa la tienda. Sin ella, no hay cuadro "Despacho". */
  despacho?: FuenteDespacho;
  /**
   * Mensajes del formulario de contacto: la MISMA config que usa el
   * endpoint del formulario (crearEndpointCotizacion). Sin ella, no hay
   * pestaña "Mensajes".
   */
  mensajes?: ConfigCotizacion;
  /** Días que se guarda la marca de "enviado". Por defecto 90. */
  retencionPedidosDias?: number;
  /** Zona horaria del negocio para las métricas. Por defecto America/Santiago. */
  zonaHoraria?: string;
}

const noDisponible = async () => jsonResponse(404, { message: "Esta sección no está activa en este sitio." });

export function crearPanel(opciones: OpcionesPanel) {
  const productos = opciones.catalogo ? crearGestionProductos(opciones.catalogo, opciones) : null;
  const categorias = opciones.catalogo ? crearGestionCategorias(opciones.catalogo, opciones) : null;
  const pedidos = crearGestionPedidos(opciones.retencionPedidosDias, opciones.catalogo);
  const resumen = crearResumen(opciones.zonaHoraria);
  const portada = opciones.carrusel ? crearGestionCarrusel(opciones.carrusel, opciones) : null;
  const contenido = opciones.contenido ? crearGestionContenido(opciones.contenido, opciones) : null;
  const boletines = opciones.boletines ? crearGestionBoletines(opciones.boletines, opciones) : null;
  const mensajes = opciones.mensajes ? crearGestionMensajes(opciones.mensajes) : null;
  const revision = opciones.revisionPagos
    ? crearRevisionPagos({ zonaHoraria: opciones.zonaHoraria, ...(opciones.revisionPagos === true ? {} : opciones.revisionPagos) })
    : null;

  return {
    parametros: { onRequestGet: (c: Ctx) => acceso.parametros(c) },
    instalar: { onRequestPost: (c: Ctx) => acceso.instalar(c) },
    entrar: { onRequestPost: (c: Ctx) => acceso.entrar(c) },
    segundoFactor: { onRequestPost: (c: Ctx) => acceso.entrarSegundoFactor(c) },
    salir: { onRequestPost: (c: Ctx) => acceso.salir(c) },
    sesion: { onRequestGet: (c: Ctx) => acceso.sesion(c) },
    actividad: { onRequestPost: (c: Ctx) => acceso.actividad(c) },
    seguridad: {
      onRequestGet: (c: Ctx) => acceso.seguridadGet(c),
      onRequestPost: (c: Ctx) => acceso.seguridadPost(c, opciones),
    },
    productos: {
      onRequestGet: (c: Ctx) => (productos ? productos.listar(c) : noDisponible()),
      onRequestPost: (c: Ctx) => (productos ? productos.post(c) : noDisponible()),
    },
    productoFoto: { onRequestPost: (c: Ctx) => (productos ? productos.foto(c) : noDisponible()) },
    /** Nombre, nombre corto y foto de cada categoría. */
    categorias: {
      onRequestGet: (c: Ctx) => (categorias ? categorias.get(c) : noDisponible()),
      onRequestPost: (c: Ctx) => (categorias ? categorias.post(c) : noDisponible()),
    },
    categoriaFoto: { onRequestPost: (c: Ctx) => (categorias ? categorias.foto(c) : noDisponible()) },
    /** Portada (carrusel). */
    carrusel: {
      onRequestGet: (c: Ctx) => (portada ? portada.get(c) : noDisponible()),
      onRequestPost: (c: Ctx) => (portada ? portada.post(c) : noDisponible()),
    },
    carruselFoto: { onRequestPost: (c: Ctx) => (portada ? portada.foto(c) : noDisponible()) },
    /** Diseño y textos (colores, tipografías, textos y fotos del sitio). */
    contenido: {
      onRequestGet: (c: Ctx) => (contenido ? contenido.get(c) : noDisponible()),
      onRequestPost: (c: Ctx) => (contenido ? contenido.post(c) : noDisponible()),
    },
    contenidoFoto: { onRequestPost: (c: Ctx) => (contenido ? contenido.foto(c) : noDisponible()) },
    pedidos: { onRequestGet: (c: Ctx) => pedidos.get(c), onRequestPost: (c: Ctx) => pedidos.post(c) },
    /** Métricas de ventas (pestaña Resumen). */
    resumen: { onRequestGet: (c: Ctx) => resumen(c) },
    /** Visitas de Cloudflare Web Analytics (si están las variables ANALITICA_*). */
    visitas: { onRequestGet: (c: Ctx) => visitasPanel(c) },
    /** Revisión de pagos con Flow (si el sitio la activó). */
    revisionPagos: { onRequestGet: (c: Ctx) => (revision ? revision(c) : noDisponible()) },
    suscriptores: {
      onRequestGet: async (c: Ctx) => {
        const s = await exigirSesion(c, false);
        if (s instanceof Response) return s;
        const activos = await listarActivos(c.env);
        if (new URL(c.request.url).searchParams.get("formato") === "csv") {
          const r = respuestaCsv(activos);
          r.headers.set("Cache-Control", "no-store");
          return r;
        }
        const lista = activos
          .map((a) => ({ email: a.email, confirmado: a.confirmado ?? "" }))
          .sort((a, b) => b.confirmado.localeCompare(a.confirmado));
        return jsonResponse(200, { total: lista.length, lista });
      },
      /** Quitar a alguien de la lista (lo pidió por WhatsApp o correo). */
      onRequestPost: async (c: Ctx) => {
        const s = await exigirSesion(c, true);
        if (s instanceof Response) return s;
        const cuerpo = await leerJson(c.request);
        if (cuerpo?.accion !== "quitar") return jsonResponse(400, { message: "Acción no válida." });
        const r = await quitarPorCorreo(c.env, cuerpo.email);
        if (r === "no-disponible") return jsonResponse(503, { message: "El newsletter no está activo." });
        if (r === "correo-invalido") return jsonResponse(400, { message: "Ese correo no es válido." });
        if (r === "no-estaba") return jsonResponse(404, { message: "Ese correo no está en la lista." });
        return jsonResponse(200, { ok: true });
      },
    },
    /** Boletines a los suscriptores (escribir, probar, enviar). */
    boletines: {
      onRequestGet: (c: Ctx) => (boletines ? boletines.get(c) : noDisponible()),
      onRequestPost: (c: Ctx) => (boletines ? boletines.post(c) : noDisponible()),
    },
    boletinFoto: { onRequestPost: (c: Ctx) => (boletines ? boletines.foto(c) : noDisponible()) },
    /** Tarifas de despacho (cuadro "Despacho" en Pedidos). */
    despacho: {
      onRequestGet: async (c: Ctx) => {
        const fuente = opciones.despacho;
        if (!fuente) return noDisponible();
        const s = await exigirSesion(c, false);
        if (s instanceof Response) return s;
        const tarifas = await fuente.obtener(c.env);
        return jsonResponse(200, { tarifas, textos: fuente.textos(tarifas), detallePorPagar: fuente.detallePorPagar, comunasRM: COMUNAS_RM, regiones: REGIONES_FUERA_RM });
      },
      onRequestPost: async (c: Ctx) => {
        const fuente = opciones.despacho;
        if (!fuente) return noDisponible();
        const s = await exigirSesion(c, true);
        if (s instanceof Response) return s;
        const cuerpo = await leerJson(c.request);
        if (cuerpo?.accion !== "guardar") return jsonResponse(400, { message: "Acción no válida." });
        const r = await fuente.guardar(c.env, cuerpo.tarifas);
        if (!r.ok) return jsonResponse(400, { message: r.motivo, errores: r.errores });
        return jsonResponse(200, { ok: true, tarifas: r.tarifas, textos: fuente.textos(r.tarifas) });
      },
    },
    /** Mensajes del formulario de contacto (pestaña "Mensajes"). */
    mensajes: {
      onRequestGet: (c: Ctx) => (mensajes ? mensajes.get(c) : noDisponible()),
      onRequestPost: (c: Ctx) => (mensajes ? mensajes.post(c) : noDisponible()),
    },
    /** Fotos públicas subidas desde el panel. */
    media: {
      onRequestGet: ({ env, params }: { env: EnvPanel; params: Record<string, string | string[]> }) => {
        const id = Array.isArray(params.id) ? params.id[0] : params.id;
        return identificadorValido(id) ? responderFoto(env, id) : Promise.resolve(new Response("No encontrada", { status: 404 }));
      },
    },
    cabeceras: {
      onRequest: async ({ next }: { next: () => Promise<Response> }) => aplicarCabecerasPanel(await next()),
    },
  };
}
