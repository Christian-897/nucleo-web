# Módulo: metricas

Métricas de ventas para el panel, al estilo del "inicio" de Shopify:

- Ventas y pedidos de **hoy**, **últimos 7 días** (con variación contra los 7
  anteriores) y **últimos 30 días**.
- **Venta promedio** por pedido.
- **Gráfico de ventas por día** (30 días), con tabla para quien no ve el gráfico.
- **Productos más vendidos** y **medios de pago** (30 días).
- **Pedidos por despachar**.
- **Comparación por años**: el año en curso "a la fecha" contra el anterior
  cortado en el mismo día; ventas por mes de dos años a elección (barras
  lado a lado, con tabla); e **historial por año** con ventas, pedidos y
  promedio.
- **Rango de fechas a elección** (desde / hasta) con atajos (7 y 30 días,
  este mes, mes pasado, este año, año pasado), agrupado por **día, semana
  (lunes a domingo) o mes**, y comparado con el **período anterior** del mismo
  largo.
- **Tipo de gráfico a elección** en el panel: barras o línea para el tiempo;
  lista, barras o torta para más vendidos y medios de pago (más de 5 partes se
  juntan en "Otros"). Se recuerda en ese navegador.

Los días se cuentan en hora de Chile (`America/Santiago`), configurable con
`zonaHoraria` en `compra` y en el `panel`.

## Cómo funciona

- `compra` llama a `registrarPedido` cuando un pago queda **confirmado y
  verificado**. Suma el pedido al total de su día, **una sola vez** (marca por
  orden). Si falla, la venta igual queda pagada.
- El panel (pestaña **Resumen**, `GET /api/admin/resumen`) primero "se pone al
  día" con los pedidos pagados que aún no estén contados, y luego calcula.
- Totales por **día** (`metricas:dia:AAAA-MM-DD`): duran 400 días. Sirven
  para el gráfico de 30 días y para cortar el año anterior en el mismo día.
- Totales por **mes** (`metricas:mes:AAAA-MM`): **no vencen nunca**. Son 12
  claves por año, así que caben décadas de historial para comparar.
- Los pedidos completos duran menos (90 días), por eso los totales van aparte.
- El mes en curso no se compara en % con el del año anterior (estaría a medias).

## Rango de fechas

`GET /api/admin/resumen?desde=AAAA-MM-DD&hasta=AAAA-MM-DD&agrupar=dia|semana|mes`

- Hasta 10 años. La fecha final no pasa de hoy.
- Si el rango cae dentro de los últimos 400 días, el cálculo es **exacto**,
  día por día. Si empieza antes, se usan los totales por mes y el rango se
  ajusta a **meses completos** (`exacto: false`; el panel lo avisa).
- Para no pasar el límite de operaciones de Cloudflare por petición, primero
  se **lista** qué días tienen ventas y solo se leen esos.

## Montaje en un sitio

```ts
// functions/api/admin/resumen.ts
import { panel } from "../../../src/servidor/panel";
export const { onRequestGet } = panel.resumen;
```

No hay variables nuevas en Cloudflare.

## Visitas

Este módulo **no** mide visitas. Para eso: Cloudflare → **Web Analytics**
(gratis, sin cookies, sin aviso de privacidad).

## Límite conocido

KV no es transaccional: dos pagos confirmados en el mismo instante podrían
pisarse un total del día. Para una tienda chica es aceptable; si crece, el
almacenamiento pasa a D1 sin cambiar la pantalla.
