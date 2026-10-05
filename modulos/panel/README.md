# Módulo: panel

Panel de administración propio (sin cuentas externas): login con doble
factor, productos con fotos, pedidos y suscriptores. Trasladado desde el panel
de Muebles Crea, que ya estaba probado en producción, y extendido para tiendas.

## Qué incluye

| Sección | Qué hace |
|---|---|
| Acceso | Instalación con clave de un solo uso, login, sesión con cierre por inactividad (15/30/60 min), salida. |
| Seguridad | Doble factor (app autenticadora + 8 códigos de respaldo), cambiar contraseña, plazo de inactividad. |
| Productos | Crear, editar, eliminar; precio, stock disponible y unidades vendidas (desde el último ajuste), categoría, físico/digital, destacado; foto. |
| Pedidos | Ventas pagadas con datos de despacho; marcar como enviado. |
| Suscriptores | Total y descarga CSV del newsletter. |
| Fotos | Guardadas en KV, servidas en `/media/<id>` con caché de un año. |

## Seguridad (lo importante)

| Riesgo | Cómo se cubre |
|---|---|
| Robo de la base de datos | La contraseña se guarda como HMAC(`ADMIN_PEPPER`, PBKDF2 600.000). Sin el pepper (que vive en Cloudflare) no se puede ni empezar a adivinar. |
| Fuerza bruta | Tope por IP en login (8/10 min), doble factor (5/10 min) e instalación. |
| Saber qué usuarios existen | Mismo mensaje y mismo cálculo, exista o no el usuario. |
| Robo de sesión | Cookie con id al azar, HttpOnly + Secure + SameSite=Strict; la sesión vive en KV y se puede cerrar de verdad. |
| CSRF | Toda escritura exige mismo origen, además de SameSite=Strict. |
| Saltarse el doble factor | El paso intermedio usa otra cookie, de 5 min, que no da acceso a nada. Un código no sirve dos veces; un respaldo, una sola vez. |
| Archivos maliciosos | Solo JPEG/PNG/WebP comprobados por sus bytes; medidas leídas de la cabecera; tope de peso; `/media` con `nosniff` y CSP `sandbox`. |
| Inyección en el panel | CSP sin scripts en línea ni externos; las cabeceras se REEMPLAZAN (no se suman con `_headers`). |
| Precio manipulado | El precio que se cobra sale del catálogo guardado por el panel, validado en el servidor. |

## Variables (Secrets en Cloudflare)

| Variable | Para qué |
|---|---|
| `ADMIN_PEPPER` | 32+ caracteres al azar. **Nunca cambiarla ni borrarla**: obliga a reinstalar el panel. |
| `ADMIN_SETUP_TOKEN` | Clave de instalación, se usa una vez. Después conviene borrarla. |
| `REVIEWS_KV` | Almacén. |

## Montaje

```ts
// src/servidor/panel.ts
import { crearPanel } from "nucleo-web/panel";
import { catalogo } from "../datos"; // crearCatalogoEditable(...)
export const panel = crearPanel({ nombreSitio: "Mi Tienda", catalogo });
```

Los archivos de `functions/` (una línea cada uno) están listados en `endpoint.ts`.
La pantalla la pone cada sitio, usando `nucleo-web/panel/cliente`
(`derivarClave`, `reducirFoto`, `subirFotoProducto`, `enviar`, `obtener`).

## Compatibilidad con Muebles Crea

Mismas claves de KV (`admin:*`, `foto:*`), mismas cookies y mismo cifrado del
doble factor: Muebles Crea puede pasarse a este módulo sin reinstalar el panel.
