# Módulo: newsletter

Suscripción a novedades con **doble confirmación** y **baja con un clic**.
Pensado para cumplir la Ley 19.628 (consentimiento explícito) y para que los
correos no terminen en spam.

## Flujo

1. El visitante deja su correo, acepta la política y pasa Turnstile.
2. Le llega un correo con un enlace **firmado que vence** (48 h).
3. El enlace abre una página con el botón **Confirmar**. Recién ahí queda activo.
4. Cada correo del newsletter lleva un enlace de baja firmado (`enlaceBaja`).

## Seguridad incluida

| Riesgo | Qué hace el módulo |
|---|---|
| Suscribir a otra persona sin permiso | Solo queda activo quien abre el enlace de su propio correo. |
| Averiguar si alguien está suscrito | `suscribir` responde siempre lo mismo. |
| Usar el formulario para bombardear un buzón | Máximo 3 correos de confirmación al día por dirección, y tope por IP. |
| Antivirus que abren los enlaces solos | Confirmar y dar de baja son POST desde una página con botón. |
| Enlaces falsificados | HMAC-SHA256 con `NEWSLETTER_SECRET`, comparado en tiempo constante. |
| Correos a la vista en KV | La clave es un HMAC del correo. |
| Fórmulas al abrir el CSV en Excel | `celdaCsv` las neutraliza. |
| Falta de configuración | Sin `NEWSLETTER_SECRET` (mín. 32) no funciona: falla cerrado. |

## Variables (Secrets en Cloudflare)

| Variable | Para qué |
|---|---|
| `NEWSLETTER_SECRET` | Firma los enlaces. 32+ caracteres al azar. **No cambiarla**: invalida los enlaces de baja ya enviados. |
| `NEWSLETTER_EXPORT_TOKEN` | Para descargar el CSV de suscriptores. 32+ caracteres. |
| `TURNSTILE_SECRET_KEY` | Verificación anti-bot. |
| `RESEND_API_KEY`, `RESEND_FROM` | Envío del correo. Sin clave: modo demo (el enlace queda en el registro). |
| `REVIEWS_KV` | Almacén. |

## Montaje

```ts
// src/newsletter.ts
import { crearEndpointsNewsletter } from "nucleo-web/newsletter";
export const newsletter = crearEndpointsNewsletter({ nombreSitio: "Mi Tienda" });

// functions/api/newsletter/suscribir.ts
export const { onRequestPost } = newsletter.suscribir;
// functions/api/newsletter/confirmar.ts
export const { onRequestPost } = newsletter.confirmar;
// functions/api/newsletter/baja.ts
export const { onRequestPost } = newsletter.baja;
// functions/api/newsletter/exportar.ts
export const { onRequestGet } = newsletter.exportar;
```

Páginas del sitio: `/newsletter/confirmar` y `/newsletter/baja`, cada una con
un botón que llama a `confirmarNewsletter` / `bajaNewsletter`.

## Descargar la lista

```bash
curl -H "Authorization: Bearer $NEWSLETTER_EXPORT_TOKEN" https://dominio.cl/api/newsletter/exportar -o suscriptores.csv
```

El CSV se importa en la herramienta con que se envíen las campañas. Lee hasta
1.000 suscriptores por llamada.

## Pendiente

Envío de campañas desde el sitio (hoy se exporta la lista). Cada campaña debe
incluir el enlace de `enlaceBaja` y las cabeceras `List-Unsubscribe`.
