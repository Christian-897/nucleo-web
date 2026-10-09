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

## Baja sin depender de nadie

Además del enlace de cada correo, la persona puede pedir su enlace de baja
escribiendo su correo (por si borró los correos). Usa Turnstile, la
respuesta es siempre la misma (no revela quién está suscrito) y hay topes
por IP y por correo (máximo 3 al día).

```ts
// functions/api/newsletter/pedir-baja.ts
export const { onRequestPost } = newsletter.pedirBaja;
```

En el navegador: `pedirBajaNewsletter({ email, turnstileToken })`. Lo cómodo
es que la página de baja muestre ese formulario cuando se abre sin `e` y `t`.

## Baja desde el panel

En **Suscriptores** del panel se ve la lista (más nuevos primero), con
buscador y un botón **Quitar** por correo, para quien lo pida por WhatsApp o
correo. El sitio debe exportar también `onRequestPost`:

```ts
// functions/api/admin/suscriptores.ts
export const { onRequestGet, onRequestPost } = panel.suscriptores;
```

## Descargar la lista

```bash
curl -H "Authorization: Bearer $NEWSLETTER_EXPORT_TOKEN" https://dominio.cl/api/newsletter/exportar -o suscriptores.csv
```

El CSV se importa en la herramienta con que se envíen las campañas. Lee hasta
1.000 suscriptores por llamada.

## Boletines desde el panel

En **Suscriptores → Boletines** la dueña escribe un correo (asunto, título,
mensaje, foto y botón opcionales), se envía una **prueba** a
`ADMIN_NOTIFY_EMAIL` y después lo **envía a todos** los confirmados.

- Cada correo va a una sola persona, con **su** enlace "Darme de baja" y las
  cabeceras `List-Unsubscribe` / `List-Unsubscribe-Post` (Gmail y Outlook
  muestran su botón "Cancelar suscripción"). No se puede enviar sin ellos.
- Usa la API de lotes de Resend (100 por llamada). El plan gratis permite
  **100 correos al día en total** (también cuentan confirmaciones y compras).
  Por eso la dueña elige en el panel **cuántos correos de boletín por día**
  (por defecto 80, `maximoPorEnvio`): ve cuántos lleva hoy, a qué hora se
  reinicia el cupo (medianoche UTC, 21:00 en Chile en verano) y un aviso si
  deja menos de 15 libres. Al llegar al tope, el envío queda a medias y se
  retoma con **Seguir enviando**, sin repetirle a nadie.
- `limiteDiarioPlan` (por defecto 100; `null` en un plan sin tope diario)
  solo cambia los textos de ayuda.
- Las respuestas llegan a `ADMIN_NOTIFY_EMAIL` (reply-to).
- La foto se guarda en JPG (WebP no se ve en todos los programas de correo).

```ts
// src/servidor/panel.ts
crearPanel({ …, boletines: { nombreSitio, coloresCorreo, urlPublica: "https://mitienda.cl" } });
// functions/api/admin/boletines.ts
export const { onRequestGet, onRequestPost } = panel.boletines;
// functions/api/admin/boletin-foto.ts
export const { onRequestPost } = panel.boletinFoto;
```

Y en la página del panel: `<PanelAdmin … boletines />`. `urlPublica` hace
que los enlaces y fotos del correo usen el dominio oficial aunque el panel se
abra desde otra dirección. Las fotos (`/media/`) deben pasar también con el
sitio en construcción (`rutasLibres`).
