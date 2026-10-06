# Módulo: contenido

Diseño y textos del sitio editables desde el panel (pestaña **Diseño y
textos**), sin reconstruir el sitio:

- **Colores**: libres, con aviso en vivo si un texto se va a leer mal
  (contraste WCAG). El aviso no bloquea: se puede guardar igual.
- **Tipografías**: de una lista elegida (`fuentes.ts`), con vista previa y
  combinaciones de un clic. Se sirven desde el propio sitio.
- **Textos, enlaces de contacto y fotos**: los que el sitio declare en su
  esquema.

Nada escrito en el panel se vuelve HTML o CSS: los textos se insertan
como texto, los colores solo pasan con formato `#rrggbb`, las tipografías
solo de la lista y las fotos solo `/img/…` o `/media/…`.

## Montaje en un sitio

```ts
// src/contenido.ts
import { crearContenidoEditable, crearBordeContenido, crearTemaCss, type Esquema } from "nucleo-web/contenido";

const esquema: Esquema = {
  grupos: [{ id: "colores", titulo: "Colores" }, { id: "inicio", titulo: "Inicio" }],
  campos: [
    { clave: "colores.acento", grupo: "colores", etiqueta: "Botones", tipo: "color", variable: "--c-acento" },
    { clave: "fuentes.titulo", grupo: "tipografias", etiqueta: "Títulos", tipo: "fuente", rol: "titulo", variable: "--fuente-titulo" },
    { clave: "inicio.titulo", grupo: "inicio", etiqueta: "Título", tipo: "texto", max: 60 },
  ],
};
export const fuenteContenido = crearContenidoEditable(esquema, valoresIniciales, {
  derivar: (v) => ({ "--c-acento-oscuro": oscurecer(v["colores.acento"], 0.15) }),
  contraste: [{ texto: "#ffffff", fondo: "colores.acento", minimo: 4.5, descripcion: "Texto de los botones" }],
});
export const bordeContenido = crearBordeContenido(fuenteContenido);
export const temaCss = crearTemaCss(fuenteContenido);
```

- `functions/_middleware.ts`: agregar `bordeContenido.onRequest`.
- `functions/tema.css.ts`: `export const { onRequestGet } = temaCss;`
- Panel: `crearPanel({ …, contenido: fuenteContenido })`, `<PanelAdmin … contenido />`,
  `functions/api/admin/contenido.ts` (`panel.contenido`) y
  `functions/api/admin/contenido-foto.ts` (`panel.contenidoFoto`).

### Marcas en las páginas

| Marca | Hace |
|---|---|
| `data-c="clave"` | reemplaza el texto (el elemento no debe tener otras etiquetas adentro) |
| `data-c-alt` / `data-c-content` | atributo `alt` / `content` |
| `data-c-src` | foto (`src`) |
| `data-c-href` | enlace según el tipo: url, correo, teléfono o WhatsApp |
| `data-c-si` | vacío → se quita el elemento; con valor → se muestra (varias claves: si alguna tiene valor) |
| `data-c-faq="faq"` | en el `<script type="application/ld+json">` de preguntas frecuentes |

Para párrafos con saltos de línea, el sitio pone `white-space: pre-line`.

### Tipografías

Una vez por sitio se copian a `public/fuentes/` (solo letras latinas,
unos 760 KB en total; cada visitante descarga solo las elegidas):

```sh
# en una carpeta temporal
npm i @fontsource/caveat-brush @fontsource/pacifico … (los paquetes de fuentes.ts)
# desde el núcleo
npx tsx scripts/copiar-fuentes.ts <carpeta>/node_modules <sitio>/public/fuentes
```

Las tipografías iniciales del sitio siguen viniendo en su CSS; si se elige
otra, el borde agrega su hoja (`/fuentes/<id>/fuente.css`) y `/tema.css`.

## Cómo se guarda

En KV (`contenido:valores`) se guardan **solo los valores cambiados**; al
leer se mezclan con los del sitio. "Volver a lo original" borra los de esa
sección. Las fotos subidas que dejan de usarse se borran.

## Límites

- El aviso de construcción y los correos usan los colores y datos de la
  configuración del sitio (no los editados).
- Crear secciones nuevas no: el sitio define qué es editable.
