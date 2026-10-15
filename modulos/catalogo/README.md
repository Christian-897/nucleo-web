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

Desde el panel (pestaña **Categorías**) se cambia el **nombre**, el **nombre
corto** y la **foto** de cada categoría. Crear o borrar categorías no: cada una
tiene su página `/tienda/<id>/`, que se arma en el código del sitio.

Lo editado se guarda en KV (`catalogo:categorias`) como cambios encima de las
categorías del sitio. El borde (`crearBordeCatalogo`) pone al día todo
elemento marcado así:

```astro
<a href={`/tienda/${c.id}/`} data-categoria={c.id}>{c.nombre}</a>
<span data-categoria={c.id} data-categoria-campo="corto">{c.corto}</span>
<img src={c.imagen} alt="" data-categoria={c.id} data-categoria-campo="imagen" />
<title data-categoria={c.id} data-categoria-campo="texto" data-categoria-plantilla="{nombre} | Mi Tienda">…</title>
<meta name="description" content="…" data-categoria={c.id} data-categoria-campo="content" data-categoria-plantilla="{nombre} hechos a mano." />
```

Campos: `nombre` (por defecto), `corto`, `imagen` (src), `alt`, `texto` y
`content` (estos dos con la plantilla, `{nombre}` y `{corto}`). Todo texto va
escapado. Panel: `functions/api/admin/categorias.ts` (`panel.categorias`) y
`functions/api/admin/categoria-foto.ts` (`panel.categoriaFoto`).

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
