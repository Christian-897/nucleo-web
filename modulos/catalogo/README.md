# Módulo: catálogo

Productos desde una lista (el JSON del sitio) y **stock real** en KV.

- `crearCatalogo(productos, categorias)`: valida los datos al cargar. Un precio
  con decimales, un id con espacios o una categoría inexistente **rompen la
  construcción**, en vez de llegar a cobrarse mal.
- `fuenteCarrito(catalogo)`: fuente lista para el módulo `carrito`.
- `registrarVenta(catalogo, env, lineas)`: descuenta lo vendido (lo llama `compra`).
- `crearEndpointStock(catalogo)` + `consultarStock(ids)`: la página marca
  "Agotado" sin reconstruir el sitio.

Stock disponible = `stock` del JSON − vendidos (`catalogo:vendidos:<id>` en KV).
Sin `stock` = sin límite (productos digitales).

Para reponer: subir el número en el JSON, o borrar `catalogo:vendidos:<id>` en
KV para partir de cero. Limitación: KV no es transaccional; si dos personas
compran la última unidad en el mismo segundo, pasan ambas.

## Categorías editables

Desde el panel (pestaña **Categorías**) se **crean** y **borran** categorías
(solo vacías; hasta `MAXIMO_NUEVAS` = 12 nuevas) y se cambia el **nombre**, el
**nombre corto**, la **bajada** (línea chica bajo el nombre en las tarjetas,
opcional) y la **foto** de cada una.

Lo editado se guarda en KV (`catalogo:categorias`) como cambios encima de las
categorías del sitio. El borde (`crearBordeCatalogo`) pone al día todo
elemento marcado así:

```astro
<a href={`/tienda/${c.id}/`} data-categoria={c.id}>{c.nombre}</a>
<span data-categoria={c.id} data-categoria-campo="corto">{c.corto}</span>
<span class="bajada" data-categoria={c.id} data-categoria-campo="bajada">{c.bajada}</span>  <!-- vacía: esconder con .bajada:empty -->
<img src={c.imagen} alt="" data-categoria={c.id} data-categoria-campo="imagen" />
<title data-categoria={c.id} data-categoria-campo="texto" data-categoria-plantilla="{nombre} | Mi Tienda">…</title>
<meta name="description" content="…" data-categoria={c.id} data-categoria-campo="content" data-categoria-plantilla="{nombre} hechos a mano." />
```

Campos: `nombre` (por defecto), `corto`, `bajada`, `imagen` (src), `alt`, `texto` y
`content` (estos dos con la plantilla, `{nombre}` y `{corto}`). Todo texto va
escapado. Panel: `functions/api/admin/categorias.ts` (`panel.categorias`) y
`functions/api/admin/categoria-foto.ts` (`panel.categoriaFoto`).

### Categorías nuevas y borradas: qué pone el sitio

Lo creado/borrado va en KV (`catalogo:categorias-estructura`). Para que una
categoría nueva aparezca sin reconstruir:

1. **Cada lista de categorías** (menú, pie, filtros, tarjetas de portada) se
   marca así; los espacios (`data-cats-slot`, `MAXIMO_NUEVAS`) van ocultos:

   ```astro
   <ul data-cats-lista>
     {categorias.map((c) => <li data-cats-item={c.id}><a href={`/tienda/${c.id}/`} data-categoria={c.id}>{c.nombre}</a></li>)}
     {Array.from({ length: MAXIMO_NUEVAS }, () => <li data-cats-slot hidden><a href="/tienda/" data-cats="enlace nombre"></a></li>)}
   </ul>
   ```

   Campos de `data-cats`: `enlace` (href, y `aria-current="page"` en su
   página), `nombre`, `corto`, `bajada`, `imagen` (src), `alt`. Un
   `data-cats-item` de una categoría borrada se quita.
2. **Plantilla de página**: construir `/tienda/plantilla/` como una categoría
   más con id `plantilla` (nombre único, p. ej. "Plantilla de categoría"),
   con `<meta name="robots" content="noindex" data-plantilla>`.
3. **Función** `functions/tienda/[categoria].ts`:
   `export const { onRequestGet } = crearPaginaCategoria(fuenteCatalogo, opciones)`.
   Sirve la página estática de las categorías del sitio, arma la de las
   nuevas desde la plantilla y da 404 a las borradas.

## Galería de fotos (hasta 20 por producto)

Cada producto tiene `imagen` (la principal: listas, carrito, redes) y
`fotos` (las demás, en orden; máximo 19). En el panel se suben varias a la
vez, se ordenan con ◀ ▶ (la primera es la principal) y se quitan con ✕; al
quitar una o eliminar el producto, la foto se borra del almacén. Las fotos de
galería se reducen a 1200 px y ~400 KB para que quepan muchas en el KV gratis.

En la ficha:

```astro
<div class="ficha__foto" data-galeria>
  <img data-ficha="imagen-alt" data-galeria-principal … />
  <button type="button" data-galeria-anterior hidden aria-label="Foto anterior">‹</button>
  <button type="button" data-galeria-siguiente hidden aria-label="Foto siguiente">›</button>
  <span data-galeria-contador hidden></span>
</div>
<ul data-ficha="galeria" hidden></ul>
<script>
  import { iniciarGaleria } from "nucleo-web/catalogo/galeria";
  iniciarGaleria();
</script>
```

El borde llena la `<ul>` con las miniaturas (solo direcciones propias) y la
oculta si hay una sola foto y no hay video. El JSON-LD lleva todas las fotos.

## Video del producto (opcional, uno por producto)

En el editor del panel, campo **Video**: la dueña pega el enlace de YouTube
tal como lo copia (`youtu.be/…`, `youtube.com/watch?v=…`, `youtube.com/shorts/…`).
Se guarda **solo el código** del video (`video`, 11 caracteres); cualquier
otro sitio se rechaza. Vacío = sin video.

En la ficha aparece como la última miniatura (clase `galeria__mini--video`):
la portada del video que pone YouTube con un ▶ encima (`.galeria__play`). Al tocarla, `iniciarGaleria()` pone un `<iframe
class="galeria__video">` de **youtube-nocookie.com** en el lugar de la foto
grande; al volver a una foto se quita (deja de sonar). Antes de tocarlo solo
se carga la imagen de portada (sin cookies); el reproductor, recién al tocar.

El sitio debe permitirlo en su CSP (`public/_headers`):

```
frame-src https://challenges.cloudflare.com https://www.youtube-nocookie.com
img-src 'self' data: https://i.ytimg.com
```

`idVideoYoutube(texto)`, `urlInsercionVideo(id)`, `miniaturaVideo(id)` y `ID_VIDEO` están en
`nucleo-web/catalogo`.

## Colores o modelos por producto (v0.35)

Un producto puede tener hasta **100 colores** (o "modelos"), cada uno con su
foto, su miniatura y su **stock propio**. Se cargan en el panel
(Productos → Editar → Colores). Funciona en cualquier categoría.

**Cómo viaja un color:** el id de la línea del carrito es `producto~color`
(`lana-peluche-wenzo~azul-rey`). El servidor arma ese "producto" desde el
catálogo (nombre "Producto · Color", su foto, su stock), así que carrito,
pago, pedidos, correos, anular y métricas usan el mismo camino validado.
Un color inventado o agotado se rechaza como un producto inexistente o
agotado. Un producto con colores **no** se vende sin color.

- Stock: `catalogo:vendidos:<producto>~<color>` en KV. El "stock" del
  producto es la suma de sus colores (sin límite si algún color no tiene).
- `/api/stock?producto=<id>` → stock de todos sus colores (la ficha lo usa).
- Fotos: el panel sube una grande (sin recortar) y una miniatura cuadrada
  (320 px). Las recién subidas solo se aceptan para SU producto (prefijo
  `color-<id>-` + 12 caracteres al azar).
- Si el producto no tiene foto propia, se usa la del primer color
  (`imagenPrincipal`).

**Ajustes de la ficha** (`catalogo:ficha`, panel → Productos → "Cómo se ve
la ficha"): miniaturas `completa` o `acercamiento` (con el punto de
`enfoqueColores` de cada producto) y partes opcionales que el borde **quita
del HTML** si están apagadas: `categoria`, `disponible`, `cuenta`, `lupa`,
`confianza`.

### Qué pone el sitio en la plantilla de la ficha

```html
<span data-ficha-opcional="cuenta" data-ficha="colores-cuenta" hidden></span>     <!-- "18 colores" -->
<button data-lupa data-ficha-opcional="lupa">…</button>                            <!-- pantalla completa -->
<a data-ficha="categoria-enlace categoria-nombre" data-ficha-opcional="categoria"></a>
<span data-disponible data-ficha-opcional="disponible" hidden></span>              <!-- Disponible / ¡Quedan 2! / Agotado -->
<div data-ficha="colores-bloque" hidden>                                           <!-- data-miniatura + --enfoque-x/y -->
  <span data-ficha="colores-titulo"></span>                                        <!-- Elige tu color -->
  <span data-ficha="colores-etiqueta"></span> <span data-color-elegido data-ficha="colores-elegido"></span>
  <ul data-ficha="colores" data-colores-lista data-visibles="24" data-visibles-movil="15"></ul>
  <button data-colores-mas hidden><span data-colores-mas-texto></span></button>
</div>
<button data-agregar data-ficha="agregar">…</button>                              <!-- recibe data-producto-base y el id del color -->
<ul data-ficha-opcional="confianza">…</ul>
```

Y en el navegador: `iniciarColores()` de `nucleo-web/catalogo/colores-ficha`
(elige color, cambia la foto y el botón, `?color=` en la dirección, agotados,
"Ver los N", lupa). En las **listas**, el botón de agregar de un producto con
colores recibe `data-elegir="/producto/<id>/"`: el sitio debe llevar ahí en
vez de agregar. Para el despacho, `necesitaDespacho` ya mira el producto base.

### Opciones: tamaños u otras (v0.40)

Un producto puede tener hasta 12 `opciones` (p. ej. *Mini · Mediano · XL*) y
`tituloOpciones` («Tamaño» por defecto). Pensado para el peor caso:

- `precio` por opción (sin él, el del producto). Las listas muestran
  «Desde $X» si hay precios distintos; el JSON-LD usa `AggregateOffer`.
- `colores`: ids de color en que viene (sin la lista = todos).
- Unidades por **combinación**: `stockColores: { <color>: n }` (con colores) o
  `stock` (sin colores). Sin número = sin límite.
- Id de la línea: `prod~color~opcion` o `prod~~opcion`. Stock en
  `catalogo:vendidos:<id de la línea>`. Sin elegir opción (o color, si tiene)
  no se vende. `/api/stock?producto=<id>` devuelve todas las combinaciones.
- Al borrar un color, las opciones dejan de nombrarlo; una opción que solo
  venía en colores borrados se quita.

Qué pone el sitio en la ficha (además de lo de colores):

```html
<div data-ficha="opciones-bloque" hidden>
  <span data-ficha="opciones-titulo"></span>                         <!-- Elige tu tamaño -->
  <span data-ficha="opciones-etiqueta"></span> <span data-opcion-elegida data-ficha="opciones-elegido"></span>
  <ul data-ficha="opciones" data-opciones-lista></ul>                <!-- botones [data-opcion] -->
</div>
```

`iniciarColores()` maneja las dos elecciones: cambia precio, foto, botón de
compra (`data-id`), marca los colores que no vienen en la opción
(`.colores__mini--no-viene`) y las combinaciones agotadas, y escribe
`?opcion=&color=` en la dirección. Panel: Productos → Editar → **Tamaños u
otras opciones** (`POST /api/admin/productos { accion: "opciones" }`).

### Subcategorías (v0.39)

Cada categoría puede tener hasta `MAXIMO_SUBCATEGORIAS` (12) subcategorías
`{ id, nombre }` (en `categorias.json` o desde el panel, en
**Categorías → Editar → Subcategorías**; se guardan con los cambios de la
categoría). Cada producto puede tener `subcategoria: "<id>"` de SU categoría
(una desconocida = sin subcategoría).

- Filtro de lista: `categoria:<id>:<sub>`.
- Dirección propia: `/tienda/<categoria>/<sub>/` la arma `crearPaginaCategoria`
  (la misma función, montada también en `functions/tienda/[categoria]/[sub].ts`)
  desde la página de la categoría: título «Sub · Categoría», canónica propia,
  lista filtrada y botón elegido. Una subcategoría que no existe da 404.
- Botones: `<ul data-subcats="<categoria>" data-subcats-clase="chip">` con
  `set:html={htmlSubcategorias(categoria)}` al construir; el borde los pone al
  día (lo editado y el elegido según la dirección) y los oculta si no hay.
- Opcionales: `[data-subcat-miga]` (se muestra en la página de una
  subcategoría), `[data-subcat-nombre]` (su nombre) y
  `[data-subcat-enlace-categoria]` (href a la categoría).
- El sitemap incluye cada subcategoría.

### Cómo se ven en las listas los productos con colores (v0.37)

En el panel (Productos → **Cómo se ven en la tienda los productos con
colores**) se elige, por separado para **las páginas de cada categoría** y
para **las listas generales** (toda la tienda, destacados, relacionados):

- `producto`: una tarjeta por producto, con **muestras** de sus colores bajo
  la foto (hasta `coloresEnTarjeta`, 6 por defecto, y «+N»). Al pasar el
  mouse o tocar una muestra, la foto de la tarjeta cambia y sus enlaces
  abren la ficha con `?color=`.
- `color`: **una tarjeta por color** («Producto · Color»), con su foto, su
  stock (`data-producto="prod~color"`) y el botón de agregar directo.

Lo guardado va en `catalogo:vista-listas` (KV). Mientras no se cambie, rige
`OpcionesBorde.vistaListas` del sitio (de fábrica, `producto` en todo). El
sitio pasa **el mismo valor** a `crearPanel({ vistaListas })` para que el
panel muestre lo que rige. Si el catálogo inicial tiene colores, el borde
de listas corre siempre (lo estático es la vista `producto`).

Qué pone el sitio en la tarjeta (`[data-cat-slot]`):

```html
<div class="muestras" data-cat="colores" hidden></div>       <!-- muestras (botones [data-muestra]) -->
<span data-cat="colores-cuenta" hidden></span>               <!-- "17 colores" -->
```

Y en el navegador `iniciarColoresLista()` de `nucleo-web/catalogo/colores-lista`.
La lista recibe `data-vista="producto|color"` (para el CSS). Con `color`,
la página necesita espacios suficientes (`data-cat-slot`) para todos los
colores: los que no caben no se muestran.

**Relacionados (arreglo v0.35):** la ficha deja escrito el filtro concreto
(`relacionados:<cat>:<id>`) en `data-cat-lista`; antes, con el catálogo
editado, el borde de listas (middleware) volvía a pasar y vaciaba la sección.
