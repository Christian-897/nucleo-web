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
