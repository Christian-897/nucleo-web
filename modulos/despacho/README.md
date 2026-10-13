# despacho

Cobro del despacho por zona, editable desde el panel (Pedidos → Despacho).

- **Por pagar**: el comprador lo paga al recibir (como antes). No suma nada.
- **Tarifa por zona**: Región Metropolitana, regiones y zonas extremas (por
  defecto Arica y Parinacota, Aysén y Magallanes), cada una con su valor.
  `0` = gratis en esa zona. Opcional: **gratis desde $X** en productos.

Los cursos y patrones (productos digitales) nunca pagan despacho.

## Seguridad

El monto lo calcula **siempre el servidor** al iniciar el pago: región ya
validada (una de las 16) + tarifas vigentes en KV. Lo que mande el navegador
(montos, zona, "gratis") se ignora. Flow cobra productos + despacho en un
solo pago, y la verificación de monto del módulo `pago` lo cubre igual que
antes.

## Avisos sin sorpresas

`textosDespacho` arma los avisos desde la configuración: nunca dicen "gratis"
si hay cobro. El sitio pone `data-despacho-aviso="corto|ficha|detalle"` en la
franja, la ficha y el carrito, y `pintarAvisosDespacho()` los llena con
`GET /api/despacho`. Si esa petición falla, queda el texto del HTML.

## Montaje

```ts
// src/servidor/despacho.ts
import { crearDespachoEditable } from "nucleo-web/despacho";
export const despacho = crearDespachoEditable({ detallePorPagar: sitio.envio.detalle });

// src/servidor/tienda.ts
crearEndpointsCompra({ ..., despacho });
// src/servidor/panel.ts
crearPanel({ ..., despacho });
```

```
functions/api/despacho.ts         export const { onRequestGet } = tienda.despacho;
functions/api/admin/despacho.ts   export const { onRequestGet, onRequestPost } = panel.despacho;
```

`<PanelAdmin despacho>` muestra el cuadro. En el Resumen del panel, las
ventas incluyen el despacho cobrado (es lo que entró por Flow).
