/**
 * MOTOR de la compra: arma la config del módulo `pago` para una tienda con
 * catálogo. Une catálogo + carrito + pago + datos del comprador + correos.
 *
 *  - prepararPedido: valida el carrito contra el catálogo y el stock REAL,
 *    valida al comprador (dirección solo si hay productos físicos) y entrega
 *    el monto calculado en el servidor.
 *  - onConfirmado: se ejecuta con el pago ya verificado por `pago`. Descuenta
 *    stock UNA sola vez por pedido y avisa por correo a la tienda y al
 *    comprador. Los correos nunca hacen fallar la confirmación.
 */
import { enviarCorreo, sendNotificationEmail } from "../../core/correo";
import { validarCarrito } from "../carrito/servidor";
import type { LineaValidada } from "../carrito/tipos";
import { fuenteCarrito, registrarVenta } from "../catalogo/stock";
import { resolverCatalogo } from "../catalogo/almacen";
import { registrarPedido } from "../metricas/almacen";
import type { ConfigPago, PedidoGuardado } from "../pago/config";
import { ErrorPedido } from "../pago/tipos";
import type { ConfigCompra, EnvCompra } from "./config";
import { type Comprador, validarComprador } from "./esquema";
import { correoComprador, correoTienda } from "./plantilla-correo";
import { calcularDespacho, type ModoDespacho, type ZonaDespacho } from "../despacho/calculo";
import { formatearPrecio } from "../carrito/formato";

/** Lo que se cobró de despacho en este pedido (queda en la metadata). */
export interface DespachoPedido {
  modo: ModoDespacho;
  costo: number;
  zona?: ZonaDespacho;
  gratisPorMonto: boolean;
}

export interface MetadataCompra {
  lineas: LineaValidada[];
  comprador: Comprador;
  requiereDespacho: boolean;
  tieneDigitales: boolean;
  /** Solo en pedidos con productos físicos y con el módulo despacho. */
  despacho?: DespachoPedido;
  [k: string]: unknown;
}

const clavePedidoProcesado = (orden: string) => `compra:procesado:${orden}`;

export function crearConfigPagoCompra(config: ConfigCompra): ConfigPago {
  const fuente = fuenteCarrito(config.catalogo);
  const maxLineas = config.maxLineas ?? 30;

  return {
    proveedores: config.proveedores,
    retencionDias: config.retencionDias ?? 90,

    async prepararPedido(cuerpo, env) {
      const items = Array.isArray(cuerpo.items) ? cuerpo.items.slice(0, maxLineas + 1) : [];
      if (!items.length) throw new ErrorPedido("Tu carrito está vacío.");
      if (items.length > maxLineas) {
        throw new ErrorPedido(`Puedes comprar hasta ${maxLineas} productos distintos por pedido.`);
      }

      const carrito = await validarCarrito(items, fuente(env));
      if (!carrito.listoParaPagar) {
        throw new ErrorPedido(
          carrito.problemas.length
            ? `Tu carrito cambió: ${carrito.problemas.map((p) => p.mensaje).join(" ")} Revísalo e intenta de nuevo.`
            : "Tu carrito está vacío."
        );
      }

      const vigente = await resolverCatalogo(config.catalogo, env);
      const tipos = carrito.lineas.map((l) => vigente.buscar(l.productoId)?.tipo);
      const requiereDespacho = tipos.includes("fisico");
      const tieneDigitales = tipos.includes("digital");

      const comprador = validarComprador(cuerpo.comprador, requiereDespacho);
      if (!comprador.ok || !comprador.datos) {
        const primero = Object.values(comprador.fieldErrors)[0]?.[0];
        throw new ErrorPedido(primero ? `Revisa tus datos: ${primero}` : "Revisa tus datos.");
      }

      const metadata: MetadataCompra = {
        lineas: carrito.lineas,
        comprador: comprador.datos,
        requiereDespacho,
        tieneDigitales,
      };
      // El despacho lo calcula SIEMPRE el servidor, con la región ya validada
      // y las tarifas vigentes: nada de lo que mande el navegador cuenta.
      let costoDespacho = 0;
      if (requiereDespacho && config.despacho) {
        const tarifas = await config.despacho.obtener(env);
        const c = calcularDespacho(tarifas, comprador.datos.region, carrito.total, config.despacho.zonasExtremas);
        costoDespacho = c.costo;
        metadata.despacho = { modo: c.modo, costo: c.costo, gratisPorMonto: c.gratisPorMonto, ...(c.zona ? { zona: c.zona } : {}) };
      }
      const monto = carrito.total + costoDespacho;
      // Si el carrito mostró otro total (tarifas cambiadas mientras compraba),
      // se avisa en vez de cobrar algo distinto a lo que la persona vio.
      if (typeof cuerpo.totalVisto === "number" && cuerpo.totalVisto !== monto) {
        throw new ErrorPedido(`El total cambió a ${formatearPrecio(monto)}. Revisa el resumen y vuelve a presionar Pagar.`);
      }
      return {
        descripcion: `Compra en ${config.nombreSitio}`,
        monto,
        email: comprador.datos.email,
        metadata,
      };
    },

    async onConfirmado(confirmacion, env) {
      const pedido = confirmacion.pedido as PedidoGuardado | null;
      const meta = pedido?.metadata as MetadataCompra | undefined;
      if (!pedido || !meta?.lineas) {
        console.error(`[compra] pedido ${confirmacion.orden} pagado sin datos guardados`);
        return;
      }
      const kv = env.REVIEWS_KV;
      // Segunda barrera de idempotencia (además de la de `pago`): si el
      // proveedor reintenta después de que ya se descontó, no se repite.
      if (kv && (await kv.get(clavePedidoProcesado(confirmacion.orden)))) return;

      await registrarVenta(config.catalogo, env as EnvCompra, meta.lineas);
      await kv?.put(clavePedidoProcesado(confirmacion.orden), "1", {
        expirationTtl: (config.retencionDias ?? 90) * 86400,
      });

      // Métricas del panel. Nunca debe romper una venta ya pagada.
      try {
        await registrarPedido(
          kv,
          { orden: confirmacion.orden, creado: pedido.creado, monto: confirmacion.monto, proveedor: confirmacion.proveedor, lineas: meta.lineas },
          config.zonaHoraria
        );
      } catch (e) {
        console.error("[compra] no se pudo registrar en métricas", e);
      }

      const datos = { orden: confirmacion.orden, monto: confirmacion.monto, ...meta };
      const tienda = correoTienda(config, datos);
      await sendNotificationEmail(env, {
        subject: tienda.asunto,
        html: tienda.html,
        replyTo: meta.comprador.email,
        remitentePorDefecto: config.remitentePorDefecto,
      });
      const cliente = correoComprador(config, datos);
      await enviarCorreo(env, {
        para: meta.comprador.email,
        subject: cliente.asunto,
        html: cliente.html,
        replyTo: env.ADMIN_NOTIFY_EMAIL,
        remitentePorDefecto: config.remitentePorDefecto,
      });

      try {
        await config.alConfirmar?.(pedido, confirmacion, env as EnvCompra);
      } catch (e) {
        console.error("[compra] alConfirmar falló (el pago igual quedó confirmado)", e);
      }
    },
  };
}
