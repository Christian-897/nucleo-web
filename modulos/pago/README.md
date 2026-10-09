# Módulo: pago (Flow + Mercado Pago)

Cobro con **Flow** y/o **Mercado Pago** bajo una misma interfaz. Seguro por
defecto y simple de montar: una config, cuatro archivos de 1 línea.

## Seguridad incluida (no hay que acordarse de nada)

| Riesgo | Qué hace el módulo |
|---|---|
| Alguien edita el precio en el navegador | El monto lo calcula el servidor en `prepararPedido`. Lo que mande el navegador se ignora. |
| Un pago por menos plata se marca como pagado | Al iniciar se guarda el monto esperado; al confirmar se compara monto y moneda con lo que dice el proveedor. Si no calza → `en-revision` + alerta en el registro, **no se confirma**. |
| Webhook falso de Mercado Pago | Se valida la firma `x-signature` (HMAC-SHA256, comparación en tiempo constante). Firma inválida → 401. |
| Webhook falso de Flow | No se confía en lo que llega: con el token se consulta el pago a Flow (`getStatus`). |
| Aviso repetido (los proveedores reintentan) | Idempotente: un pedido `pagada` no se vuelve a confirmar. |
| Orden inventada | Si no existe el pedido esperado, no se confirma. |
| Abuso / bots | Mismo origen, tope de intentos por IP, cuerpo máximo 64 KB, monto máximo de cordura. |
| Redirección a un sitio falso | El cliente solo redirige a HTTPS de Flow / Mercado Pago. |
| Proveedor lento | Tiempo límite de 10 s hacia los proveedores. |
| Órdenes adivinables | Número de orden aleatorio (no correlativo ni por fecha). |
| Filtrar detalles internos | Al comprador, mensajes genéricos; el detalle va solo al registro. |
| Error del sitio al confirmar | Se responde 500 para que el proveedor reintente; no se pierde el pago. |

## Variables (Secrets en Cloudflare — cuentas DEL CLIENTE)

| Variable | Proveedor | Para qué |
|---|---|---|
| `FLOW_API_KEY`, `FLOW_SECRET_KEY` | Flow | Credenciales. |
| `FLOW_SANDBOX` | Flow | `"1"` = pruebas. Sin ella = producción. |
| `MP_ACCESS_TOKEN` | Mercado Pago | Token (de prueba o producción). |
| `MP_WEBHOOK_SECRET` | Mercado Pago | Valida la firma de los avisos. **Recomendada siempre.** |
| `REVIEWS_KV` | ambos | Guarda el monto esperado de cada pedido. |

Solo hace falta cargar las del proveedor que se use.

## Montaje (lo único que escribe el sitio)

```ts
// src/pago.ts
import { crearEndpointsPago, ErrorPedido, type ConfigPago } from "nucleo-web/pago";
import { validarCarrito } from "nucleo-web/carrito";
import { configCarrito } from "./config/carrito";

const config: ConfigPago = {
  proveedores: ["flow", "mercadopago"],

  async prepararPedido(cuerpo) {
    const carrito = await validarCarrito(cuerpo.items, configCarrito);
    if (!carrito.listoParaPagar) throw new ErrorPedido("Tu carrito cambió, revísalo.");
    return {
      descripcion: "Compra en Mi Tienda",
      monto: carrito.total,                 // ← del servidor, siempre
      email: String(cuerpo.email ?? ""),
      metadata: { lineas: carrito.lineas }, // vuelve en onConfirmado
    };
  },

  async onConfirmado({ orden, pedido }, env) {
    // Pago verificado: descontar stock, avisar por correo, etc.
  },
};

export const pago = crearEndpointsPago(config);
```

```ts
// functions/api/pago/iniciar.ts
export const { onRequestPost } = pago.iniciar;
// functions/api/pago/webhook-flow.ts
export const { onRequestPost } = pago.webhookFlow;
// functions/api/pago/webhook-mercadopago.ts
export const { onRequestPost } = pago.webhookMercadoPago;
// functions/api/pago/estado.ts        (para la página /pago/retorno)
export const { onRequestGet, onRequestPost } = pago.estado;
// functions/api/pago/retorno-flow.ts  (solo con Flow: vuelve con POST)
export const { onRequestGet, onRequestPost } = pago.retornoFlow;
```

En el navegador:

```ts
import { irAPagar } from "nucleo-web/pago";
await irAPagar({ proveedor: "mercadopago", items: carrito.items(), email });
```

Si hay un solo proveedor habilitado, `proveedor` se puede omitir.

## Página de retorno

**Flow vuelve con un POST** del navegador (con `token` en el cuerpo), y una
página estática no acepta POST. Por eso Flow vuelve a `/api/pago/retorno-flow`,
que solo redirige (303) a `/pago/retorno?proveedor=flow&token=…`. El aviso de
construcción deja pasar esa ruta, porque ese POST llega sin la cookie de
vista previa.

`/pago/retorno` llama a `/api/pago/estado` (con los parámetros que deja el
proveedor en la URL) para **mostrar** el resultado. Ojo: lo que confirma el
pedido es el **webhook**, no esta página — el comprador puede cerrar el navegador
antes de volver.

## Antes de cobrar de verdad (no saltarse)

1. Cuentas Flow / Mercado Pago **a nombre del cliente** (su RUT, su banco).
2. **Pruebas**: Flow con `FLOW_SANDBOX="1"`; Mercado Pago con credenciales y
   usuarios de prueba. Probar: aprobado, rechazado, y que llegue el webhook.
3. En Mercado Pago, configurar el webhook (evento *Pagos*) y copiar su clave
   secreta a `MP_WEBHOOK_SECRET`.
4. **Pentest** (skill `pentest-strix-sitios-dinamicos`).
5. Recién ahí, credenciales de producción.

## Revisión de pagos en el panel

`crearPanel({ …, revisionPagos: true })` + `<PanelAdmin … revisionPagos />` +
`functions/api/admin/revision-pagos.ts` (`export const { onRequestGet } = panel.revisionPagos;`).

En **Resumen → Revisión de pagos** compara lo que Flow cobró en los últimos 7
días (`payment/getPayments`, en hora de Chile) con los pedidos de la tienda:

| Alerta | Qué significa |
|---|---|
| Cobro que no salió de la tienda | Alguien usó las claves por fuera del sitio: cambiarlas en Flow. |
| Monto distinto | Flow cobró otro monto que el del pedido. |
| Pagado en Flow, pendiente en la tienda | No llegó el aviso de Flow; el cliente sí pagó. |
| Pagado en la tienda, Flow no lo reconoce | No despachar hasta confirmarlo en Flow. |

Antes de alarmar por un pedido que no está en la lista, se pregunta a Flow por
él (`getStatusByCommerceId`): pudo pagarse otro día. Solo lee; guarda el
resultado 30 minutos ("Revisar ahora", máximo una vez por minuto). Usa las
mismas `FLOW_*`: al cambiar las claves de prueba por las reales, revisa la
cuenta real sin tocar nada. **No ve devoluciones** (la API no las lista): se
revisan en Flow → Reembolsos y liquidaciones.

## Pruebas

`pruebas/pago.test.ts` intenta romperlo: precio manipulado, monto distinto,
firma falsa, aviso repetido, orden inventada, otro origen, proveedor no
habilitado, redirección a dominio falso.
