# despacho

Cobro del despacho, editable desde el panel (Pedidos → Despacho), pensado
para que la dueña solo marque casillas:

- **Cobrar el despacho según la zona** (un interruptor). Encendido: se
  cobra con la compra (se suma al total) y, en las zonas marcadas en
  **Pagar el despacho al recibir** (4 casillas, v0.30), el comprador también
  puede elegir pagarlo al recibir. Apagado: todo "por pagar".
- **Región Metropolitana:** valor de **zona centro** y de **zona alejada**, y
  las 52 comunas con casillas (marcadas = centro; el resto = alejada).
- **Regiones:** valor de **zona cercana** y de **zona extrema**, y las 15
  regiones con casillas (marcadas = cercana; el resto = extrema).
- Opcional: **gratis desde $X** en productos. `0` = gratis en esa zona.
- **Mostrar los valores del despacho en la tienda** (casilla, marcada de
  fábrica). Desmarcada: la ficha, Términos y la nota del carrito no publican
  montos por zona ("el valor se calcula en el carrito según tu comuna"); el
  comprador ve SU valor recién en el carrito al elegir región y comuna,
  sumado al total antes de pagar (Ley 19.496). La promo "gratis desde $X" se
  sigue mostrando. Lo guardado antes de esta opción sigue mostrando valores.

- **Retiro sin costo** (v0.30, opcional): otra opción de entrega en el
  carrito. No cobra despacho ni pide la dirección del comprador. La dueña
  elige el **nombre** de una lista (`NOMBRES_RETIRO`: "Retiro coordinado",
  "Retiro en punto de encuentro", "Punto de retiro", "Retiro presencial",
  "Retiro en domicilio"), la **comuna** (se ve en la tienda), la
  **dirección** y unas **instrucciones**. Casilla **"Mostrar la dirección
  solo en el correo de confirmación"** (marcada de fábrica): `GET
  /api/despacho` la entrega vacía (`tarifasPublicas`) y solo va en el correo
  al comprador, ya pagado. Desmarcada, también se ve en el carrito.

Lo guardado antes de v0.30 sigue igual: pagar al recibir en todas las zonas y
sin retiro.

De fábrica: Gran Santiago + Puente Alto + San Bernardo = centro; Arica y
Parinacota, Aysén y Magallanes = extremas; modo "por pagar".

Los cursos y patrones (productos digitales) nunca pagan despacho.

En el carrito, si la región es la RM la comuna se elige de la lista
(`COMUNAS_RM`, exportada en `despacho/cliente`): el servidor rechaza una
comuna de la RM que no esté en la lista.

## Seguridad

El monto lo calcula **siempre el servidor** al iniciar el pago: región y
comuna validadas + tarifas vigentes en KV. Del navegador solo cuenta la forma
elegida (`formaDespacho`: `ahora`, `al-recibir` o `retiro`), y solo si está
permitida en esa zona / si el retiro está ofrecido; montos, zona o "gratis"
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

## Carrito con retiro (sitio)

El sitio agrega un grupo "¿Cómo quieres recibir tu pedido?" (despacho /
retiro) visible solo si `tarifas.retiro.activo`. Con retiro: oculta y
deshabilita la dirección, manda `formaDespacho: "retiro"` a `iniciarCompra`
(que entonces no pide dirección) y muestra `textoRetiro(retiro)`, las
instrucciones y la dirección solo si viene (no viene si va solo en el
correo). El bloque "¿Cómo quieres pagar el despacho?" se muestra solo si
`calcularEnNavegador(...).puedeAlRecibir`.

`<PanelAdmin despacho>` muestra el cuadro. En el Resumen del panel, las
ventas incluyen el despacho cobrado (es lo que entró por Flow).
