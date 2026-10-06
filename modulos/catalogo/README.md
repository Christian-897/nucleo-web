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
