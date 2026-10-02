# Módulo: pago (Flow)

Cobro con **Flow** (link de pago) a partir de un pedido validado en el servidor.
Crea el pago, redirige al comprador a Flow, y confirma por webhook consultando el
estado real. Reutilizable en cualquier sitio de e-commerce del núcleo.

## Las capas

| Capa | Archivo | Qué hace |
|---|---|---|
| Cliente Flow | `flow.ts` | Firma HMAC-SHA256, `crearPagoFlow`, `obtenerEstadoFlow`, estados. Puro. |
| Motor | `servidor.ts` | `iniciarPago`, `confirmarPago` (webhook), `consultarEstado`. |
| Endpoints | `endpoint.ts` | `crearEndpointIniciarPago` / `Confirmacion` / `Estado`. |
| Cliente web | `cliente.ts` | `irAPagar()`: pide iniciar y redirige a Flow. **Headless**. |

## Las dos reglas de seguridad

1. **El monto lo calcula el SERVIDOR, nunca el cliente.** El sitio implementa
   `prepararPedido`, donde valida el carrito (módulo `carrito`) y saca el monto
   real. El navegador no manda precios.
2. **La verdad del pago se consulta a Flow.** El webhook no confía en el cuerpo
   que llega: toma el `token` y pregunta el estado con `getStatus`.

## Variables de entorno (Secrets en Cloudflare, de la cuenta Flow del CLIENTE)

| Variable | Para qué |
|---|---|
| `FLOW_API_KEY` | API key de Flow. |
| `FLOW_SECRET_KEY` | Secret key para firmar. **Nunca en el código ni en el chat.** |
| `FLOW_SANDBOX` | `"1"` para sandbox (pruebas), ausente/otra cosa = producción. |

## Montaje en el sitio

```ts
// src/config/pago.ts
import type { ConfigPago } from "nucleo-web/pago";
import { validarCarrito } from "nucleo-web/carrito";
import { configCarrito } from "./carrito";

export const configPago: ConfigPago = {
  async prepararPedido(request, env) {
    const { items, email } = await request.json();
    const carrito = await validarCarrito(items, configCarrito); // monto REAL
    if (!carrito.listoParaPagar) throw new Error("carrito inválido");
    return {
      commerceOrder: "ORD-" + Date.now(),
      subject: "Compra en tu sitio",
      amount: carrito.total,
      email,
    };
  },
  urlConfirmation: (origin) => `${origin}/api/pago/confirmacion`,
  urlReturn: (origin) => `${origin}/pago/retorno`,
  async onConfirmado(estado, env) {
    // marcar el pedido como pagado, descontar stock, avisar por correo…
  },
};
```

Endpoints (tres archivos en `functions/api/pago/`):

```ts
// iniciar.ts
export const { onRequestPost } = crearEndpointIniciarPago(configPago);
// confirmacion.ts  (esta URL va en urlConfirmation)
export const { onRequestPost } = crearEndpointConfirmacion(configPago);
// estado.ts        (la página de retorno la consulta)
export const { onRequestPost, onRequestGet } = crearEndpointEstado(configPago);
```

En el navegador:

```ts
import { irAPagar } from "nucleo-web/pago";
await irAPagar({ items: carrito.items(), email }); // redirige a Flow
```

## Antes de producción (no saltarse)

1. **Cuenta de comercio Flow del cliente** con sus llaves (su RUT, su banco).
2. **Probar primero en sandbox** (`FLOW_SANDBOX="1"`) con las llaves de prueba de
   Flow: pago aprobado, rechazado y el webhook de confirmación.
3. **Pentest** (ver skill `pentest-strix-sitios-dinamicos`): este módulo mueve
   dinero. Revisar que el monto no se pueda manipular y que el webhook valide con
   getStatus.
4. Recién ahí, cambiar a producción con las llaves reales.
