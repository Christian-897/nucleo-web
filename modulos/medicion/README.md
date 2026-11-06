# Módulo: medicion

Aviso de cookies y herramientas de medición **opcionales**. Cada sitio activa
solo las que usa; un sitio sin medición no carga nada ni muestra aviso.

- **Hoy:** Google Analytics 4 (`<GoogleAnalytics />`).
- El aviso (`<AvisoCookies />`) es uno solo para todas las herramientas que se
  sumen después (por ejemplo, el píxel de Meta irá aparte, en su propia versión).

## Reglas que cumple

- **Nada se carga antes de "Aceptar".** Ni el script de Google ni cookies. Con
  "Rechazar" no se carga nada y la persona compra igual.
- "Aceptar" y "Rechazar" tienen **el mismo tamaño y peso**.
- La decisión dura **180 días** en ese navegador (`localStorage`,
  `nucleo:cookies`). Cualquier botón `[data-cookies-preferencias]` vuelve a
  abrir el aviso; si la persona rechaza después de aceptar, Analytics se apaga
  (`ga-disable-<ID>`) y se borran sus cookies `_ga*`.
- **Nunca se envían datos del comprador** (nombre, correo, teléfono,
  dirección). Solo producto (id, nombre, precio, cantidad), número de orden y
  monto.
- No necesita script en línea: funciona con una CSP estricta.

## Qué mide

| En la tienda | Evento en Google | Quién lo emite |
|---|---|---|
| Cada página | `page_view` (lo hace Google solo) | — |
| Agregar al carrito | `add_to_cart` | `carrito/cliente` (`agregar`) |
| Ir a pagar (datos OK) | `begin_checkout` | `compra/cliente` (`iniciarCompra`) |
| Compra pagada | `purchase` (con `transaction_id`) | la página `/pago/retorno` del sitio |

El carrito y la compra emiten eventos en `window` (`nucleo:carrito-agregado`,
`nucleo:compra-iniciada`, `nucleo:compra-confirmada`) y además los dejan en una
cola de la página, así una herramienta que arranca después (al aceptar) igual
se entera. Las herramientas los leen con `escucharEventos()`.

## Montaje en un sitio

1. **Layout** (una vez, en todas las páginas públicas; NO en `/admin`):

   ```astro
   ---
   import AvisoCookies from "nucleo-web/medicion/AvisoCookies.astro";
   import GoogleAnalytics from "nucleo-web/medicion/GoogleAnalytics.astro";
   ---
   <GoogleAnalytics id={sitio.googleAnalytics} />   {/* sin id: no hace nada */}
   <AvisoCookies privacidad="/privacidad/" />
   ```

   Colores: variables `--cookies-fondo`, `--cookies-tinta`, `--cookies-acento`,
   `--cookies-acento-tinta`.

2. **Pie**: un botón para cambiar la decisión (se muestra solo):

   ```html
   <button type="button" data-cookies-preferencias hidden>Preferencias de cookies</button>
   ```

3. **Página de retorno del pago**, cuando `/api/pago/estado` responde
   `estado: "pagada"`:

   ```ts
   import { avisarCompraConfirmada } from "nucleo-web/medicion";
   avisarCompraConfirmada(r.orden, r.monto); // una vez por orden, aunque recargue
   ```

4. **Panel**: `<PanelAdmin … googleAnalytics={sitio.googleAnalytics} />`. Muestra
   en Resumen el acceso a Analytics y activa los temas de Ayuda «Ver las
   estadísticas en Google Analytics» y «El aviso de cookies de la tienda».

5. **CSP** (`public/_headers`), sumar:

   ```
   script-src  https://www.googletagmanager.com
   connect-src https://*.google-analytics.com https://*.analytics.google.com https://*.googletagmanager.com
   img-src     https://*.google-analytics.com https://*.googletagmanager.com
   ```

6. **Política de privacidad**: agregar que el sitio usa cookies de medición de
   Google Analytics, solo si la persona acepta, y que puede cambiar su decisión
   en «Preferencias de cookies».

No hay variables nuevas en Cloudflare: el ID de medición no es secreto.

## Conseguir el ID y el acceso

La cuenta de Analytics la crea **el cliente, con su propia cuenta de Google**, e
invita a quien mantiene el sitio como **Administrador** (Administrar → Gestión
de accesos a la cuenta). El ID está en **Administrar → Flujos de datos → (el
flujo web) → ID de medición** y se ve como `G-ABC123XYZ9`.

## Comprobar que funciona

1. Abrir el sitio publicado en una ventana privada → aparece el aviso.
2. "Rechazar" → en la pestaña Red del navegador **no** debe aparecer
   `googletagmanager.com`.
3. "Preferencias de cookies" → "Aceptar" → aparece `gtag/js?id=G-…` y en
   Analytics → **Informes → Tiempo real** se ve la visita.
4. Agregar un producto: en Tiempo real aparece `add_to_cart`.
