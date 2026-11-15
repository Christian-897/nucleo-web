# Módulo: pago-libre (v0.49)

Para negocios de **servicios que se cotizan caso a caso**: la persona entra a
la página *Pagar*, escribe el monto que acordó (anticipo, saldo final o un
extra), elige **Flow o Mercado Pago** y paga, en cuotas si su tarjeta lo
permite. Al negocio le llega el total.

Usa por dentro el módulo `pago`, así que hereda todo lo delicado: orden
aleatoria, monto esperado guardado en KV, verificación del monto al confirmar,
firma de los webhooks, idempotencia y tope de intentos.

## Lo que suma este módulo

| Riesgo de un monto libre | Qué hace |
|---|---|
| Pruebas de tarjetas robadas con cobros chicos | **Turnstile** obligatorio, monto mínimo ($5.000 por defecto) y un tope propio de 5 intentos por IP cada 10 minutos. |
| Montos raros ("154,70", "1e6", negativos) | `leerMonto` acepta solo pesos enteros: "154.700", "$154.700", "154 700" o "154700". |
| Montos enormes por error | Máximo configurable ($5.000.000 por defecto). |
| Bots | Campo trampa (`sitio_web`). |
| Texto malicioso en el nombre o detalle | Los correos lo escapan; el panel lo muestra como texto. |
| Un aviso repetido del proveedor | Se registra una sola vez (doble barrera con `pago`). |

**Importante:** el monto lo escribe quien paga. El panel y el correo de aviso
muestran cuánto pagó: antes de empezar o entregar, revisar que calce con lo
acordado.

## Montaje

```ts
// src/servidor/pago-libre.ts
import { crearEndpointsPagoLibre, type ConfigPagoLibre } from "nucleo-web/pago-libre";
export const configPagoLibre: ConfigPagoLibre = {
  nombreSitio: "Novalis",
  proveedores: ["flow", "mercadopago"],
  // conceptos, montoMinimo, montoMaximo, coloresCorreo: opcionales
};
export const pagoLibre = crearEndpointsPagoLibre(configPagoLibre);
```

```ts
// functions/api/pago/iniciar.ts
export const { onRequestPost } = pagoLibre.iniciar;
// functions/api/pago/webhook-flow.ts
export const { onRequestPost } = pagoLibre.webhookFlow;
// functions/api/pago/webhook-mercadopago.ts
export const { onRequestPost } = pagoLibre.webhookMercadoPago;
// functions/api/pago/estado.ts
export const { onRequestGet, onRequestPost } = pagoLibre.estado;
// functions/api/pago/retorno-flow.ts
export const { onRequestGet, onRequestPost } = pagoLibre.retornoFlow;
```

Panel: `crearPanel({ …, pagos: true })`, `functions/api/admin/pagos.ts`
(`export const { onRequestGet } = panel.pagos;`) y `<PanelAdmin … pagos />`.
Aparece **Resumen → Pagos recibidos** con los 100 más recientes.

En el navegador (no arrastra código del servidor):

```ts
import { pagarLibre, leerMonto, formatearMonto } from "nucleo-web/pago-libre/cliente";
const r = await pagarLibre({ proveedor: "flow", nombre, email, concepto: "anticipo", monto: "154.700",
  detalle, aceptaTerminos: true, turnstileToken });
// Si sale bien, el navegador ya se fue a Flow / Mercado Pago.
// Si no: r.message y r.fieldErrors (por campo: nombre, email, concepto, monto, detalle, aceptaTerminos).
```

La página `/pago/retorno` es la misma del módulo `pago` (llama a
`/api/pago/estado`). Lo que confirma el pago es el **webhook**, no esa página.

## Variables (Secrets en Cloudflare, cuentas DEL NEGOCIO)

Las de `pago` (`FLOW_API_KEY`, `FLOW_SECRET_KEY`, `FLOW_SANDBOX`,
`MP_ACCESS_TOKEN`, `MP_WEBHOOK_SECRET`), `TURNSTILE_SECRET_KEY` y las del
correo (`RESEND_API_KEY`, `RESEND_FROM`, `ADMIN_NOTIFY_EMAIL`). KV:
`REVIEWS_KV`.

## Pruebas

`pruebas/pago-libre.test.ts`: montos raros, mínimo y máximo, Turnstile,
campo trampa, tope por IP, monto exacto hacia Flow, registro solo al
confirmar, monto distinto o pago rechazado sin registro, aviso repetido sin
duplicar, correos escapados y el panel con sesión.
