# Módulo: construccion

Muestra un aviso de **"Sitio en construcción"** a todo el público mientras el
dueño sigue viendo y probando el sitio real.

## Desde el panel (v0.32, lo recomendado para la clienta)

Si el sitio monta `panel.construccion` y pasa `construccion` a `<PanelAdmin>`,
en **Resumen** aparece el cuadro **"Estado de la tienda"** con un botón
para mostrar u ocultar el aviso. Cualquier usuario del panel puede usarlo
(no borra nada y se deshace con el mismo botón). Queda guardado quién y cuándo.
Mientras está encendido, una banda amarilla lo recuerda en todas las pestañas.

- Quien tiene sesión en el panel ve la tienda real con **"Ver tienda"**: el
  panel le deja la cookie de vista previa, sin clave.
- La clave de esa cookie es `ACCESO_PREVIA` o, si no existe, una derivada de
  `ADMIN_PEPPER` (nunca se muestra).
- Tarda hasta ~1 minuto en verse en todos lados (caché de 10 s + KV).
- Si la variable `CONSTRUCCION=1` está en Cloudflare, **manda ella**: el panel
  lo muestra encendido y no lo puede apagar.
- El sitio debe tener `/admin` y `/api/admin/` en `rutasLibres` (si no, el
  panel queda detrás del aviso).

```ts
// functions/api/admin/construccion.ts
import { panel } from "../../../src/servidor/panel";
export const { onRequestGet, onRequestPost } = panel.construccion;
```

## Por variable (en Cloudflare, sin tocar código)

| Variable | Tipo | Valor |
|---|---|---|
| `CONSTRUCCION` | Text | `1` = aviso encendido. Borrarla o `0` = sitio abierto. |
| `ACCESO_PREVIA` | **Secret** | Clave larga al azar (16+ caracteres). |

Después de cambiarlas: **Deployments → Retry deployment**.

- Entrar a la vista previa: `https://sitio/?previa=CLAVE` (dura 30 días en ese navegador).
- Ver lo que ve el público: `https://sitio/?previa=salir`.
- Quitarle el acceso a todos: cambiar `ACCESO_PREVIA`.
- Desde v0.41, en el panel lo abre y cierra el dueño sin clave; una persona invitada, solo con su propia clave, que crea con un código de un solo uso que le da el dueño (ver `panel/clave-construccion.ts`).
- Mientras `CONSTRUCCION=1` está puesta, nadie puede abrir la tienda desde el panel. Al entregar el sitio, bórrala y maneja el aviso desde el panel.

## Montaje

```ts
// functions/_middleware.ts
import { crearAvisoConstruccion } from "nucleo-web/construccion";
export const { onRequest } = crearAvisoConstruccion({
  nombreSitio: "Mi Tienda",
  logo: "/img/logo.png",
  contactos: [{ etiqueta: "Instagram", url: "https://instagram.com/mitienda" }],
});
```

## Qué resuelve

| Tema | Cómo |
|---|---|
| Google | Responde **503 + Retry-After**: "temporal". No penaliza ni indexa el aviso. |
| La clave en el navegador | La cookie guarda una **firma** HMAC, nunca la clave. HttpOnly + Secure + `__Host-`. |
| Adivinar la clave | Comparación en tiempo constante; clave equivocada = mismo aviso, sin pistas. |
| Configuración incompleta | Sin `ACCESO_PREVIA` ni `ADMIN_PEPPER` válidas nadie entra (falla cerrado). |
| Interruptor del panel | Solo con sesión; POST exige mismo origen. Si KV falla o tiene basura, cuenta como apagado (la tienda sigue vendiendo). Las rutas libres no leen KV. |
| Pagos de prueba | Los webhooks de pago y el retorno de Flow (`/api/pago/retorno-`) pasan siempre: llegan sin la cookie de vista previa. |
| Correo del newsletter | Confirmar, darse de baja y pedir el enlace de baja (`/newsletter/confirmar`, `/newsletter/baja`, sus `/api/newsletter/…` y `/api/newsletter/pedir-baja`) pasan siempre: se abren desde el correo, sin la cookie. Suscribirse sigue bloqueado. Para que esas páginas se vean con estilos, el sitio debe dejar pasar también sus estilos (`/_astro/`). |
| Vista previa indexada | Las páginas vistas con acceso llevan `noindex` y `no-store`. |
| Inyección | Textos escapados, colores validados, enlaces solo `https:`/`mailto:`/`tel:`, CSP propia. |
