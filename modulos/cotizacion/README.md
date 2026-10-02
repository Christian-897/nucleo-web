# Módulo: cotización

Formulario de presupuesto para un negocio a medida: valida, verifica anti-bot
(Turnstile), avisa por correo (Resend) y guarda un respaldo en KV. Pensado para
reusarse en cualquier rubro cambiando solo la **config**.

## Las 4 capas

| Capa | Archivo | Qué hace |
|---|---|---|
| Lógica (servidor) | `servidor.ts` | Procesa el envío y gestiona los respaldos (listar/marcar/eliminar). No conoce colores ni markup. |
| Endpoint | `endpoint.ts` | Envuelve la lógica como `onRequestPost` de Cloudflare Pages. |
| API de cliente | `cliente.ts` | `enviarCotizacion()` para el navegador: envía y devuelve `{ ok, message, fieldErrors }`. **Headless**. |
| UI por defecto | `ui-defecto/QuoteForm.astro` | Formulario mínimo opcional. Para un diseño propio, se ignora y se escribe uno nuevo llamando a `enviarCotizacion`. |

Un **rediseño** reescribe solo la capa 4. El motor (1–3) no se toca.

## Config (lo específico del rubro/sitio)

```ts
import type { ConfigCotizacion } from "nucleo-web/cotizacion";

export const configCotizacion: ConfigCotizacion = {
  nombreSitio: "Muebles Taller Crea",
  categorias: [
    { id: "cocinas", label: "Cocinas" },
    { id: "closets", label: "Closets" },
    { id: "dormitorios", label: "Dormitorios" },
    { id: "otros", label: "Otros muebles" },
  ],
  // opcionales:
  rutaPanel: "/admin/",
  retencionDias: 180,
  coloresCorreo: { acento: "#8B5E3C", fondo: "#FAF5EF" },
};
```

## Variables de entorno (Secrets en Cloudflare, nunca en el código)

| Variable | Para qué |
|---|---|
| `TURNSTILE_SECRET_KEY` | Verificar el anti-bot en el servidor. |
| `RESEND_API_KEY` | Enviar el aviso por correo. Sin ella: modo demo (no envía, no rompe). |
| `RESEND_FROM` | Remitente. Sin dominio propio, usa el de Resend. |
| `ADMIN_NOTIFY_EMAIL` | A dónde llega el aviso. |
| `RATE_LIMIT_MAX`, `RATE_LIMIT_WINDOW_SECONDS` | Tope de envíos por IP (opcional). |
| `REVIEWS_KV` | Almacén para el respaldo de solicitudes. |

## Montar el endpoint (en el sitio)

`functions/api/quote.ts`:

```ts
import { crearEndpointCotizacion } from "nucleo-web/cotizacion";
import { configCotizacion } from "../../src/config/cotizacion";

export const { onRequestPost } = crearEndpointCotizacion(configCotizacion);
```

## Usar desde el panel (lado lectura)

```ts
import {
  listarCotizaciones,
  marcarCotizacion,
  eliminarCotizacion,
  claveValida,
} from "nucleo-web/cotizacion";
```

`claveValida(clave)` protege contra borrar/marcar algo fuera de las cotizaciones.

## Seguridad

Este módulo mueve datos personales (nombre, correo, teléfono). Antes de publicar
en cada sitio, pasa el pentest (ver skill `pentest-strix-sitios-dinamicos`).
