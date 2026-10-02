# Módulo: carrito

Carrito de compra genérico y reutilizable para sitios de e-commerce. Estado en el
navegador + **validación de precios y stock en el servidor** (nunca se confía en
el precio que manda el cliente). La fuente de productos es enchufable, así que
sirve a cualquier rubro. Deja un enganche limpio hacia el módulo `pago`.

> No aplica a negocios a medida (sin precio fijo), como una mueblería a pedido.

## Las 4 capas

| Capa | Archivo | Qué hace |
|---|---|---|
| Lógica (servidor) | `servidor.ts` | `validarCarrito`: recalcula precio y stock desde la fuente real. Rechaza inexistentes/sin stock, ajusta cantidades. |
| Endpoint | `endpoint.ts` | `crearEndpointCarrito(config)` → `onRequestPost` que valida el carrito. |
| API de cliente | `cliente.ts` | `crearCarrito` / `obtenerCarrito`: estado en localStorage, agregar/quitar/total/suscribir y `validar()`. **Headless**. |
| UI por defecto | `ui-defecto/` | `BotonAgregar.astro` y `Carrito.astro`, mínimos y opcionales. Para un diseño propio, se ignoran. |

Un **rediseño** reescribe solo la capa 4. El motor (1–3) no se toca.

## La regla de seguridad (lo más importante)

El navegador manda **solo `productoId` y `cantidad`**. El servidor reconstruye
cada línea con `obtenerProducto` y calcula el total desde ahí. Si el cliente
edita el precio en las herramientas del navegador, no pasa nada: ese precio nunca
se usa.

## Fuente de productos (enchufable)

El módulo no trae catálogo. El sitio provee `obtenerProducto`:

```ts
import type { ConfigCarritoServidor } from "nucleo-web/carrito";

export const configCarrito: ConfigCarritoServidor = {
  obtenerProducto: (id) => CATALOGO[id] ?? null, // lista/JSON hoy, D1 mañana
  maxPorLinea: 99,
};
```

Puede ser async (KV, D1, fetch). Si vive en KV/D1, usa la forma función del
endpoint para recibir `env`:

```ts
// functions/api/carrito.ts
import { crearEndpointCarrito } from "nucleo-web/carrito";
export const { onRequestPost } = crearEndpointCarrito((env) => ({
  obtenerProducto: async (id) => {
    const crudo = await env.PRODUCTOS_KV.get(id);
    return crudo ? JSON.parse(crudo) : null;
  },
}));
```

## En el navegador

```ts
import { obtenerCarrito } from "nucleo-web/carrito";

const carrito = obtenerCarrito();            // compartido por página
carrito.agregar({ productoId: "silla", nombre: "Silla", precio: 19990 });
carrito.cantidadTotal();                     // para el ícono del carrito
const validado = await carrito.validar();    // precios/stock reales
if (validado.listoParaPagar) { /* → módulo pago */ }
```

`validar()` devuelve `CarritoValidado` con `lineas`, `total`, `cantidadTotal`,
`problemas` (producto sin stock, cantidad ajustada, etc.) y `listoParaPagar`.

## Seguridad

Este módulo mueve datos de compra y conecta con pago. Antes de publicar en cada
sitio, pasa el pentest (ver skill `pentest-strix-sitios-dinamicos`).

## Pendiente (otros módulos)

- `pago` — cobro real con Flow a partir del carrito validado.
- `catalogo` — productos/stock en D1 (hoy la fuente la provee el sitio).
