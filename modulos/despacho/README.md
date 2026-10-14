# despacho

Cobro del despacho, editable desde el panel (Pedidos → Despacho), pensado
para que la dueña solo marque casillas:

- **Cobrar el despacho según la zona** (un interruptor). Encendido: el
  comprador SIEMPRE elige en el carrito si lo paga junto con la compra (se
  suma al total) o al recibir. Apagado: todo "por pagar".
- **Región Metropolitana:** valor de **zona centro** y de **zona alejada**, y
  las 52 comunas con casillas (marcadas = centro; el resto = alejada).
- **Regiones:** valor de **zona cercana** y de **zona extrema**, y las 15
  regiones con casillas (marcadas = cercana; el resto = extrema).
- Opcional: **gratis desde $X** en productos. `0` = gratis en esa zona.

De fábrica: Gran Santiago + Puente Alto + San Bernardo = centro; Arica y
Parinacota, Aysén y Magallanes = extremas; modo "por pagar".

Los cursos y patrones (productos digitales) nunca pagan despacho.

En el carrito, si la región es la RM la comuna se elige de la lista
(`COMUNAS_RM`, exportada en `despacho/cliente`): el servidor rechaza una
comuna de la RM que no esté en la lista.

## Seguridad

El monto lo calcula **siempre el servidor** al iniciar el pago: región y
comuna validadas + tarifas vigentes en KV. Del navegador solo cuenta la forma
elegida (`formaDespacho`), y solo si está permitida; montos, zona o "gratis"
se ignoran. Si llega `totalVisto` y no calza, no se cobra y se avisa. Flow cobra productos + despacho en un
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
