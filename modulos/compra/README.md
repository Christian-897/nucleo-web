# Módulo: compra

Tienda completa con un solo llamado: catálogo + carrito + pago + datos del
comprador + correos. El sitio solo aporta su config y su diseño.

```ts
// src/servidor/tienda.ts
import { crearEndpointsCompra } from "nucleo-web/compra";
export const tienda = crearEndpointsCompra({
  nombreSitio: "Mi Tienda",
  catalogo,                       // de nucleo-web/catalogo
  proveedores: ["mercadopago"],   // y/o "flow"
  envio: { modalidad: "Envío por pagar", detalle: "Se paga al recibir." },
});
// functions/api/carrito.ts → tienda.carrito, functions/api/stock.ts → tienda.stock,
// functions/api/pago/*.ts → tienda.pago.iniciar / webhookMercadoPago / webhookFlow / estado
```

En el navegador (`nucleo-web/compra/cliente`):

```ts
const r = await iniciarCompra({ items: carrito.items(), comprador, tipos });
if (!r.ok) mostrar(r.fieldErrors, r.message);   // si ok, ya redirigió al pago
```

## Qué resuelve

| Tema | Cómo |
|---|---|
| Precio manipulado | El monto sale del catálogo en el servidor. |
| Stock | Se valida al pagar y se descuenta **una vez** al confirmarse. |
| Datos personales | Dirección solo si hay productos físicos (Ley 19.628). Esquema compartido navegador/servidor; regiones de Chile cerradas; teléfono chileno. |
| Correos | Aviso de venta a `ADMIN_NOTIFY_EMAIL` y confirmación al comprador. Nunca hacen fallar la confirmación del pago. |
| Inyección en correos | Todo lo que escribió el comprador va escapado. |
| Abuso | Tope de 30 productos distintos por pedido (configurable). |

Hereda toda la seguridad del módulo `pago` (firma de webhooks, verificación
de monto, idempotencia). Datos del pedido en KV por 90 días.
