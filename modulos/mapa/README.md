# Módulo: mapa

Muestra la tienda o el punto de retiro en un mapa de Google. **Gratis y sin
clave de API.** Primer uso: Isatin.

- El mapa **no se carga al abrir la página**: se ve un recuadro con la
  dirección y el botón "Ver mapa"; al tocarlo se inserta el mapa de Google.
  La página carga rápido y Google no recibe nada de quien no lo pidió.
- Trae el enlace **"Cómo llegar"**, que abre Google Maps con la ruta.
- La dirección se edita desde el panel (**Diseño y textos**) como cualquier
  otro dato, con un campo de tipo `"mapa"`.

## Qué acepta como ubicación

| Escrito en el panel | Se guarda |
|---|---|
| `Av. Providencia 1234, Providencia` | igual, sin espacios de más |
| `-33.4372, -70.6506` | `-33.4372,-70.6506` |
| enlace largo de Google Maps (`/maps/place/…`, `?q=…`, `/@lat,lng`) | la dirección o coordenadas que trae |
| enlace corto (`maps.app.goo.gl/…`) | **rechazado**, con un mensaje que pide escribir la dirección |
| enlace de otro sitio | rechazado |

Lo guardado es siempre un **texto de búsqueda**, nunca un enlace: la
dirección del mapa la arma el núcleo (`https://www.google.com/maps?q=…&output=embed`)
y el navegador revisa ese formato (`insercionPermitida`) antes de crear el
`<iframe>`.

## Montaje en un sitio

1. **Campo editable** en `src/contenido.ts`:

   ```ts
   { clave: "contacto.direccion", grupo: "contacto", etiqueta: "Dirección de la tienda", tipo: "mapa", opcional: true,
     ayuda: "Escribe la dirección como la buscarías en Google Maps. Vacía = sin mapa." },
   ```

2. **Componente** donde vaya el mapa:

   ```astro
   ---
   import Mapa from "nucleo-web/mapa/Mapa.astro";
   ---
   <section data-c-si="contacto.direccion">
     <Mapa ubicacion={valoresIniciales["contacto.direccion"]} clave="contacto.direccion" titulo="Mapa de la tienda" />
   </section>
   ```

   Con `clave`, el borde del contenido pone lo editado en el mapa
   (`data-c-mapa`), en el texto de la dirección (`data-c`) y en "Cómo
   llegar" (`data-c-href`). Con `data-c-si` la sección desaparece si la
   dirección queda vacía.

3. **CSP** (`public/_headers`): agregar `https://www.google.com` a `frame-src`.

   ```
   frame-src https://challenges.cloudflare.com https://www.youtube-nocookie.com https://www.google.com;
   ```

Para usar la dirección en otros lugares (el pie, la página de contacto) basta
con `data-c="contacto.direccion"` y, para un enlace, `data-c-href="contacto.direccion"`
(abre "Cómo llegar").

## Diseño

Variables CSS: `--mapa-alto` (320px), `--mapa-radio`, `--mapa-fondo`,
`--mapa-linea`, `--mapa-tinta`, `--mapa-acento`; o pisar las clases `.mapa__*`.
El recuadro previo es una cuadrícula hecha con CSS: no descarga nada.

## Funciones

| Función | Para qué |
|---|---|
| `normalizarUbicacion(texto)` | valida y deja el texto de búsqueda (o un error en español) |
| `urlInsercion(ubicacion, { zoom })` | dirección del mapa insertado (zoom 3–20, por defecto 16) |
| `urlComoLlegar(ubicacion)` / `urlVerEnMaps(ubicacion)` | enlaces para abrir Google Maps |
| `insercionPermitida(src)` | ¿es un mapa insertado armado por el núcleo? |
| `ORIGEN_MAPA` | `https://www.google.com`, para la CSP |
| `activarMapas()` (`nucleo-web/mapa/cliente`) | conecta los botones "Ver mapa" (el componente ya lo llama) |
