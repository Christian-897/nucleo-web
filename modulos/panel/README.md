# Módulo: panel

Panel de administración propio (sin cuentas externas): login con doble
factor, productos con fotos, pedidos y suscriptores. Trasladado desde el panel
de Muebles Crea, que ya estaba probado en producción, y extendido para tiendas.

## Qué incluye

| Sección | Qué hace |
|---|---|
| Acceso | Instalación con clave de un solo uso, login, sesión con cierre por inactividad (15/30/60 min), salida. |
| Seguridad | Doble factor (app autenticadora + 8 códigos de respaldo), cambiar contraseña, plazo de inactividad. |
| Resumen | Ventas de hoy, 7 y 30 días, venta promedio, gráfico por día, más vendidos, medios de pago, pedidos por despachar, rango de fechas a elección, gráficos de barras/línea/torta y comparación por años (módulo `metricas`). |
| Categorías | Crear (hasta 12 nuevas), editar nombre, corto, bajada y foto, y borrar (solo sin productos; avisa cuántos tiene). Las nuevas aparecen en menús y portada en los espacios del sitio, con su página desde la plantilla. |
| Productos | Crear, editar, eliminar; precio, stock disponible y unidades vendidas (desde el último ajuste), categoría, físico/digital, destacado; foto. |
| Pedidos | Ventas pagadas con datos de despacho; marcar como enviado. **Anular pedido** (el dueño, o un invitado al que el dueño le marcó "Puede anular y borrar pedidos" en Seguridad → Usuarios, v0.31): deja de contar en el Resumen, devuelve los productos al stock y queda marcado "Anulado" con fecha y quién; NO devuelve el dinero (eso se hace en Flow/Mercado Pago). **Borrar**: solo pedidos anulados (para los de prueba). |
| Mensajes | Lo que llega por el formulario de contacto (`mensajes: configContacto`, la misma config del endpoint del formulario): ver, responder por correo, marcar como respondido, borrar. Burbuja con los pendientes en la pestaña. Avisa si el correo de aviso no salió. |
| Sitio en construcción | Cuadro en Resumen (v0.32, `construccion` en `<PanelAdmin>` + `panel.construccion`): mostrar u ocultar el aviso, con quién y cuándo, y banda en todas las pestañas mientras está encendido. Quien tiene sesión ve la tienda con "Ver tienda". Ver el README de `construccion`. |
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

## Usuarios e invitaciones

El que instala el panel es el **dueño**. Para darle acceso a otra persona sin
pasarle una contraseña, el dueño va a **Seguridad → Usuarios del panel → Invitar
a alguien**, elige cuánto dura el enlace (1 hora, 1 día o 3 días), confirma con
su contraseña (y su código, si tiene doble factor) y copia el enlace.

- El enlace es `/admin/#invitacion=…`: va después del `#`, así que no llega a
  los registros del servidor, y la pantalla lo borra de la barra al leerlo.
- Sirve **una sola vez** y vence solo. En la base queda solo su resumen
  SHA-256: quien lea la base no puede armar el enlace.
- Quien lo abre elige su usuario y contraseña. Cada uno tiene su propio doble
  factor, su plazo de inactividad y sus sesiones.
- Los invitados usan toda la tienda, pero no ven ni manejan usuarios. El dueño
  puede anular enlaces sin usar y **quitar el acceso**: la sesión abierta del
  invitado deja de servir al instante.
- Permiso por invitado (v0.31): casilla **"Puede anular y borrar pedidos"**
  en la lista de usuarios (solo la ve y la cambia el dueño). Sirve para que la
  clienta anule pedidos mientras el desarrollador sigue siendo el dueño.
- **Restablecer doble factor** (v0.33): si un invitado pierde el celular y sus
  códigos de respaldo, el dueño toca **Restablecer doble factor** en su fila
  (Seguridad → Usuarios). Se le quita el doble factor y se le cierran las
  sesiones; vuelve a entrar solo con su contraseña y lo puede activar de nuevo.
  No borra su usuario ni sus permisos. Solo el dueño, solo a invitados, con
  sesión y mismo origen. El doble factor del dueño no se restablece desde aquí:
  el dueño debe guardar sus códigos de respaldo.
- No usa `ADMIN_SETUP_TOKEN` ni archivos nuevos en `functions/`: la invitación
  entra por `/api/admin/instalar` y se maneja desde `/api/admin/seguridad`.

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

## Colores de los gráficos

La pantalla (`PanelAdmin.astro`) recibe `coloresGraficos`: hasta 5 colores en
orden. Se usan en la torta y las barras de "Más vendidos" y "Medios de pago";
el segundo es además el año comparado. Lo ideal es sacarlos de la paleta de
la marca, más intensos, y **validarlos** (que se distingan con daltonismo y
tengan contraste sobre blanco) antes de usarlos. Sin ellos se usa una paleta
neutra ya validada.

```astro
<PanelAdmin nombre="Mi Tienda" colores={{ acento: "#D81B72" }}
  coloresGraficos={["#D81B72", "#7B46B0", "#1A9A86", "#D9772F", "#4A7BD0"]} />
```
