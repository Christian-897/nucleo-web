# Reseñas de compradores verificados (v0.45)

Solo opina quien compró. Nada se publica sin aprobación de la tienda.

1. En el panel, **Pedidos → Marcar como enviado** le manda al comprador un
   correo «¿Qué te pareció tu compra?» con un enlace propio (un código por
   pedido, guardado en KV, vence a los 180 días). Se manda una sola vez; el
   botón **Pedir reseña** lo vuelve a mandar.
2. El enlace abre `/resena/?o=<pedido>&t=<código>`: muestra lo que compró
   (un producto por producto base, con sus colores/tamaños) y pide de 1 a 5
   estrellas y un texto. Una reseña por producto y pedido.
3. La reseña queda **pendiente** y a la tienda le llega un aviso por correo.
4. En la pestaña **Reseñas** se aprueba, rechaza, despublica, responde o
   elimina. Cada cambio rearma `resena:publicas:<producto>`, el resumen que
   lee la ficha (una lectura por visita).
5. La ficha (borde) muestra las estrellas junto al precio, la lista de
   aprobadas y agrega `aggregateRating` + `review` al JSON-LD del producto.

Se publica solo el nombre elegido («Ana P.»), nunca el correo ni el pedido.
Todo texto se escapa (el borde y el panel lo ponen como texto).

## En el sitio

```ts
// src/servidor/resenas.ts
import { crearResenas } from "nucleo-web/resenas";
export const resenas = crearResenas({ nombreSitio, urlPublica: sitio.dominio, catalogo: fuenteCatalogo, coloresCorreo, remitentePorDefecto });

// src/servidor/panel.ts → crearPanel({ ..., resenas })
// src/servidor/tienda.ts → opciones del borde: { ..., resenas: true }
```

```
functions/api/resenas.ts        export const { onRequestGet, onRequestPost } = resenas.formulario;
functions/api/admin/resenas.ts  export const { onRequestGet, onRequestPost } = panel.resenas;
src/pages/resena.astro          <Base noIndexar><FormularioResena /></Base>
src/pages/admin/index.astro     <PanelAdmin … resenas />
```

Marcas en la plantilla de la ficha:

```astro
<a href="#opiniones" class="ficha__estrellas" data-ficha="estrellas" hidden></a>   <!-- junto al precio -->
<section id="opiniones" data-ficha="resenas-bloque" hidden>
  <h2>Opiniones</h2>
  <p data-ficha="resenas-resumen"></p>
  <ul class="resenas__lista" data-ficha="resenas"></ul>
</section>
```

Clases que arma el núcleo (estilo en el sitio, con `:global`): `.estrellas`
(`style="--valor:90%"`, dibujar "★★★★★" con `::before` y un degradado),
`.estrellas__texto`, `.resena`, `.resena__cabeza`, `.resena__nombre`,
`.resena__verificada`, `.resena__fecha`, `.resena__variante`,
`.resena__texto`, `.resena__respuesta`.

KV: `resena:r:<producto>:<pedido>`, `resena:token:<pedido>`,
`resena:invitado:<pedido>`, `resena:publicas:<producto>`, `resena:limite:<ip>`.
