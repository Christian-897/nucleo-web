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
import { idBase } from "../catalogo/colores";
import { resolverCatalogo } from "../catalogo/almacen";
import { registrarPedido } from "../metricas/almacen";
import type { ConfigPago, PedidoGuardado } from "../pago/config";
import { ErrorPedido } from "../pago/tipos";
import type { ConfigCompra, EnvCompra } from "./config";
import { type Comprador, validarComprador } from "./esquema";
import { correoComprador, correoTienda } from "./plantilla-correo";
import { calcularDespacho, esComunaRM, esRetiro, REGION_RM, type FormaDespacho, type TarifasDespacho, type ZonaDespacho } from "../despacho/calculo";
import { formatearPrecio } from "../carrito/formato";

/** Lo que se cobró de despacho en este pedido (queda en la metadata). */
export interface DespachoPedido {
  /** "ahora": se cobró con la compra. "al-recibir": lo paga el comprador al courier. "retiro": lo retira. */
  forma: FormaDespacho;
  costo: number;
  /** Sin zona en el retiro (no hay dirección del comprador). */
  zona?: ZonaDespacho;
  gratisPorMonto: boolean;
  /** Solo en el retiro: lo que se mostró al comprar, para el correo y el panel. */
  retiro?: { nombre: string; comuna: string; direccion: string; instrucciones: string };
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
      const tipos = carrito.lineas.map((l) => vigente.buscar(idBase(l.productoId))?.tipo);
      const requiereDespacho = tipos.includes("fisico");
      const tieneDigitales = tipos.includes("digital");

      // Retiro (si está ofrecido y lo eligió): no se pide la dirección del comprador.
      let tarifas: TarifasDespacho | null = null;
      if (requiereDespacho && config.despacho) tarifas = await config.despacho.obtener(env);
      const retiro = tarifas !== null && esRetiro(tarifas, cuerpo.formaDespacho);
      const comprador = validarComprador(cuerpo.comprador, requiereDespacho && !retiro);
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
      // El despacho lo calcula SIEMPRE el servidor, con la región y la comuna
      // ya validadas y las tarifas vigentes. Del navegador solo cuenta la forma
      // elegida (ahora o al recibir), y solo si está permitida.
      let costoDespacho = 0;
      if (tarifas && retiro) {
        const r = tarifas.retiro;
        metadata.despacho = {
          forma: "retiro",
          costo: 0,
          gratisPorMonto: false,
          retiro: { nombre: r.nombre, comuna: r.comuna, direccion: r.direccion, instrucciones: r.instrucciones },
        };
      } else if (tarifas) {
        const { region, comuna } = comprador.datos;
        // En la RM la zona depende de la comuna: tiene que ser una de la lista.
        if (region === REGION_RM && !esComunaRM(comuna ?? "")) {
          throw new ErrorPedido("Revisa tus datos: elige tu comuna de la lista.");
        }
        const c = calcularDespacho(tarifas, { region, comuna }, carrito.total, cuerpo.formaDespacho);
        costoDespacho = c.costo;
        metadata.despacho = { forma: c.forma, costo: c.costo, zona: c.zona, gratisPorMonto: c.gratisPorMonto };
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
