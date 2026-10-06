# Módulo: carrusel

Portada con varias diapositivas (foto + textos + botón) que avanzan solas,
editable desde el panel (pestaña **Portada**) sin reconstruir el sitio.

- Transición suave (fundido), la foto activa se acerca de a poco y el texto
  sube al entrar.
- Botón de **pausa** siempre visible, flechas, puntos con barra de progreso,
  flechas del teclado y **deslizar con el dedo**.
- Se detiene solo con el mouse encima, con el foco del teclado adentro y con
  la pestaña oculta; sigue donde quedó.
- Con **"reducir movimiento"** activado en el sistema no avanza solo y no hay
  animaciones.
- Sin JavaScript se ve la primera diapositiva, completa.
- La primera foto carga con prioridad (buena nota en Core Web Vitals); las
  demás, después.
- Con una sola diapositiva no hay controles: queda como portada fija.

## Montaje en un sitio

```ts
// src/carrusel.ts
import { crearCarruselEditable, crearBordeCarrusel, type OpcionesCarrusel } from "nucleo-web/carrusel";

export const fuenteCarrusel = crearCarruselEditable({
  segundos: 6,
  automatico: true,
  diapositivas: [
    {
      id: "bienvenida",
      imagen: "/img/portada/portada.webp",
      imagenAlt: "Gatito tejido a crochet",
      antetitulo: "Bienvenida a",
      titulo: "Mi Tienda",
      subtitulo: "Tejidos",
      texto: "Hecho a mano, con mucho amor.",
      boton: { texto: "Ver productos", enlace: "/tienda/" },
    },
    // … hasta 8
  ],
});

export const opcionesCarrusel: OpcionesCarrusel = {
  etiqueta: "Novedades",
  claseContenedor: "contenedor", // el ancho máximo del sitio
  claseBoton: "boton",           // el botón del sitio
  iconoBoton: '<svg …>…</svg>',   // opcional, código del sitio
  medidas: { ancho: 1600, alto: 1000 },
};

/** Pone la portada editada en el panel. */
export const bordeCarrusel = crearBordeCarrusel(fuenteCarrusel, opcionesCarrusel);
```

```astro
---
// src/pages/index.astro
import Carrusel from "nucleo-web/carrusel/Carrusel.astro";
import { fuenteCarrusel, opcionesCarrusel } from "../carrusel";
---
<Carrusel fuente={fuenteCarrusel} opciones={opcionesCarrusel} />
```

```ts
// functions/_middleware.ts (después del aviso de construcción)
export const onRequest = [aviso.onRequest, borde.onRequest, bordeCarrusel.onRequest];
```

Para editarlo desde el panel: `crearPanel({ …, carrusel: fuenteCarrusel })`,
`<PanelAdmin … carrusel />` y dos funciones:

```ts
// functions/api/admin/carrusel.ts
export const { onRequestGet, onRequestPost } = panel.carrusel;
// functions/api/admin/carrusel-foto.ts
export const { onRequestPost } = panel.carruselFoto;
```

No hay variables nuevas en Cloudflare (usa el mismo KV).

## Diseño

El componente trae un diseño base: texto a la izquierda y foto a la derecha
que se funde con el fondo; en el teléfono, texto arriba y foto abajo. Se
ajusta con variables CSS (`--carrusel-fondo`, `--carrusel-alto`,
`--carrusel-ancho-imagen`, `--carrusel-tinta`, `--carrusel-acento`,
`--carrusel-control-fondo`) o pisando las clases `.carrusel__*` en el sitio.

## Cómo se guarda

- Mientras nadie edite, rige el carrusel del sitio (el de `src/carrusel.ts`).
- Al guardar desde el panel, todo el carrusel pasa a KV (`carrusel:portada`)
  y el middleware lo pone en la página al vuelo (HTMLRewriter).
- **Restablecer** en el panel borra esa clave y vuelve el del sitio.
- Las fotos subidas se guardan como las de productos (`/media/…`, reducidas
  en el navegador, sin recorte cuadrado). Al quitar o cambiar una foto, la
  vieja se borra.

## Seguridad

- Todo texto del panel se escapa al armar el HTML.
- Fotos: solo `/img/…` (del sitio) o `/media/…` (subidas al panel).
- Botón: solo páginas del sitio (`/tienda/`) o direcciones `https://`
  (se abren en otra pestaña). Nada de `javascript:` ni `//otro-sitio`.
- Límites: 8 diapositivas, textos cortos, entre 4 y 15 segundos.
