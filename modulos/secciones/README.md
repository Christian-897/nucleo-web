# Módulo: secciones

Bloques de portada armados con el **contenido editable** (no tienen lógica
propia en el servidor). Primer uso: Isatin.

- **Rutina en pasos** (`camposRutina` + `Rutina.astro`): texto chico, título,
  texto, botón, una frase escrita a mano con flecha y de 1 a 6 pasos con número,
  título y foto vertical, con flechas entre ellos. En el teléfono los pasos se
  deslizan con el dedo.
- **Mosaico con frase** (`camposMosaico` + `Mosaico.astro`): de 1 a 8 fotos en
  fila y un recuadro con una frase destacada y un corazón. En el teléfono, las
  fotos van de a dos y la frase abajo.

Todo se edita en el panel (**Diseño y textos**), en los grupos que el sitio
elija. Lo vacío y opcional se oculta solo.

## Montaje en un sitio

```ts
// src/contenido.ts
import { camposRutina, camposMosaico } from "nucleo-web/secciones";

const esquema = {
  grupos: [ …, { id: "rutina", titulo: "Rutina en pasos" }, { id: "mosaico", titulo: "Mosaico con frase" } ],
  campos: [ …, ...camposRutina({ grupo: "rutina" }), ...camposMosaico({ grupo: "mosaico" }) ],
};
// y en los valores iniciales, una entrada por clave:
// "rutina.titulo", "rutina.paso.1.titulo", "rutina.paso.1.imagen", "mosaico.frase", "mosaico.foto.1.imagen", …
```

```astro
---
import Rutina from "nucleo-web/secciones/Rutina.astro";
import Mosaico from "nucleo-web/secciones/Mosaico.astro";
import { valoresIniciales } from "../contenido";
---
<Rutina valores={valoresIniciales} enlace="/tienda/kit-ondas/" />
<Mosaico valores={valoresIniciales} />
```

El número de pasos o de fotos y el prefijo (`prefijo`, `pasos`, `fotos`) deben
ser los mismos en los campos y en el componente. `clavesRutina()` y
`clavesMosaico()` devuelven las claves, por si el sitio arma su propio marcado.

## Diseño

- Rutina: `--rutina-fondo`, `--rutina-tinta`, `--rutina-texto`,
  `--rutina-acento`, `--rutina-numero-fondo`, `--rutina-fuente-titulo`,
  `--rutina-fuente-nota` (toman por defecto las variables del tema del sitio).
- Mosaico: `--mosaico-alto`, `--mosaico-espacio`, `--mosaico-fondo-frase`,
  `--mosaico-tinta-frase`, `--mosaico-fuente-frase`.
- O pisar las clases `.rutina__*` y `.mosaico__*`.

## Seguridad

Los textos van con `data-c` (texto plano, nunca HTML) y las fotos solo pueden
ser `/img/…` o `/media/…`: lo valida el módulo contenido al guardar.
