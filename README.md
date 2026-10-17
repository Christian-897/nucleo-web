# nucleo-web

Núcleo reutilizable de módulos para sitios **Astro + Cloudflare Pages/Functions**.
La idea: la **lógica** vive acá una vez; cada **sitio** la importa y le pone su
propio diseño (`theme/`) y su config. Un sitio nuevo con otro diseño reusa el
motor tal cual.

## Documentación para empezar

- [docs/CATALOGO.md](docs/CATALOGO.md) — qué módulos hay y cómo se monta cada uno.
- [docs/SITIO-NUEVO.md](docs/SITIO-NUEVO.md) — cómo crear un sitio nuevo y las reglas de trabajo.
- [docs/HOJA-DE-RUTA.md](docs/HOJA-DE-RUTA.md) — lo que todavía no existe.

Leer estos tres al comenzar cualquier trabajo nuevo.

## Principios

1. **Lógica separada del diseño (headless).** El motor no conoce colores ni markup.
2. **Un módulo = una carpeta autocontenida** (`modulos/<nombre>/`).
3. **Configuración por variables, nunca en el código.** Las llaves de cada cliente
   van como Secrets en Cloudflare.
4. **Seguridad por módulo.** Lo que mueve plata/datos pasa el pentest antes de
   publicar en cada sitio.

## Estructura

```
nucleo-web/
  core/              # compartido entre módulos
    tipos.ts         # AlmacenKV, EnvBase (sin depender de tipos de Cloudflare)
    validar.ts       # honeypot, escapeHtml, normalizeInput, helpers de zod
    seguridad.ts     # Turnstile, rate limit, same-origin, jsonResponse
    correo.ts        # envío por Resend: aviso interno y a cualquier destinatario
    cripto.ts        # HMAC-SHA256, comparación en tiempo constante, ids aleatorios
    red.ts           # fetch con tiempo límite
    turnstile-cliente.ts  # Turnstile en el navegador, cargado solo al usarse
  modulos/
    cotizacion/      # 1er módulo — ver su README
      servidor.ts  endpoint.ts  cliente.ts  esquema.ts
      plantilla-correo.ts  config.ts  index.ts
      ui-defecto/QuoteForm.astro
  pruebas/           # pruebas que se ejecutan (no solo se leen)
  index.ts  package.json  tsconfig.json
```

## Cómo lo consume un sitio

En el `package.json` del sitio:

```json
{ "dependencies": { "nucleo-web": "github:Christian-897/nucleo-web#vX.Y.Z" } }
```

Cloudflare Pages instala el núcleo al construir cada sitio. El zip del sitio sigue
sin `node_modules`.

Importar por módulo:

```ts
import { crearEndpointCotizacion, enviarCotizacion } from "nucleo-web/cotizacion";
```

## Desarrollo

```bash
npm install
npm run typecheck   # revisa el código del núcleo
npm test            # corre las pruebas del módulo
```

## Módulos

- **cotizacion** — formulario de presupuesto. (listo)
- **carrito** — carrito de compra con validación de precio/stock en servidor. (listo)
- **pago** — cobro con Flow y Mercado Pago, verificación de monto, firma de webhooks e idempotencia. (listo)
- **catalogo** — productos desde JSON con validación y stock real en KV; nombre, nombre corto y foto de las categorías editables desde el panel. (listo)
- **compra** — tienda completa: carrito + pago + datos del comprador + correos, en un llamado. (listo)
- **construccion** — aviso de "sitio en construcción" con vista previa para el dueño, encendido por variable. (listo)
- **contacto** — enlaces de WhatsApp, teléfono, correo y redes, validados (número en cualquier formato, redes con enlace o @usuario). (listo)
- **mapa** — mapa de Google gratis y sin clave, que se carga recién al tocarlo; la dirección se edita desde el panel (campo de tipo "mapa") y trae "Cómo llegar". (listo)
- **secciones** — bloques de portada editables desde el panel: rutina en pasos (fotos numeradas con flechas) y mosaico de fotos con frase. (listo)
- **carrusel** — portada con varias diapositivas (foto, textos y botón) que avanzan solas con transición suave, pausa, flechas, puntos y deslizar con el dedo; respeta "reducir movimiento" y se edita desde el panel (pestaña Portada). (listo)
- **contenido** — diseño y textos editables desde el panel: paleta de colores (libre, con aviso de contraste), tipografías de una lista elegida (servidas desde el propio sitio), textos, enlaces de contacto y fotos. (listo)
- **metricas** — resumen de ventas para el panel: hoy, 7 y 30 días, venta promedio, gráfico por día, más vendidos, medios de pago, rango de fechas a elección (por día, semana o mes), gráficos de barras, línea o torta y comparación por años. (listo)
- **visitas** — las visitas de Cloudflare Web Analytics dentro del panel (7 o 30 días, páginas, países, dispositivos, de dónde llegan y cuántos compran), con una clave de solo lectura. (listo)
- **panel** — administración propia: login + doble factor, productos con fotos, categorías, portada (carrusel), diseño y textos, pedidos, suscriptores con boletines y revisión de pagos con Flow. (listo)
- **newsletter** — suscripción con doble confirmación, baja con un clic, pedir el enlace de baja por correo, boletines desde el panel y exportación protegida. (listo)
- _por venir:_ ver [docs/HOJA-DE-RUTA.md](docs/HOJA-DE-RUTA.md).

## Entradas solo para el navegador

`nucleo-web/compra/cliente`, `nucleo-web/newsletter/cliente`,
`nucleo-web/catalogo/cliente`, `nucleo-web/carrusel/cliente`, `nucleo-web/mapa/cliente` y `nucleo-web/core/turnstile` no arrastran código
del servidor. Usarlas en los `<script>` de las páginas: el formulario del
newsletter pesa 2 KB en vez de 58 KB.
