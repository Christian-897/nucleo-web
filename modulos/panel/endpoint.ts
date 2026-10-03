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
 *   functions/api/admin/pedidos.ts         export const { onRequestGet, onRequestPost } = panel.pedidos;
 *   functions/api/admin/suscriptores.ts    export const { onRequestGet } = panel.suscriptores;
 *   functions/media/[id].ts                export const { onRequestGet } = panel.media;
 *   functions/admin/_middleware.ts         export const { onRequest } = panel.cabeceras;
 *   functions/api/admin/_middleware.ts     export const { onRequest } = panel.cabeceras;
 */
import type { FuenteCatalogo } from "../catalogo/almacen";
import { listarActivos, respuestaCsv } from "../newsletter/servidor";
import * as acceso from "./acceso";
import type { ConfigPanel, EnvPanel } from "./config";
import { aplicarCabecerasPanel } from "./encabezados";
import { type Ctx, exigirSesion, jsonResponse } from "./http";
import { identificadorValido, responderFoto } from "./imagenes";
import { crearGestionPedidos } from "./pedidos";
import { crearGestionProductos } from "./productos";

export interface OpcionesPanel extends ConfigPanel {
  /** Catálogo editable (crearCatalogoEditable). Sin él, no hay sección Productos. */
  catalogo?: FuenteCatalogo;
  /** Días que se guarda la marca de "enviado". Por defecto 90. */
  retencionPedidosDias?: number;
}

const noDisponible = async () => jsonResponse(404, { message: "Esta sección no está activa en este sitio." });

export function crearPanel(opciones: OpcionesPanel) {
  const productos = opciones.catalogo ? crearGestionProductos(opciones.catalogo, opciones) : null;
  const pedidos = crearGestionPedidos(opciones.retencionPedidosDias);

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
    pedidos: { onRequestGet: (c: Ctx) => pedidos.get(c), onRequestPost: (c: Ctx) => pedidos.post(c) },
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
        return jsonResponse(200, { total: activos.length });
      },
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
