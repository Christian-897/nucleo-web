# Módulo: construccion

Muestra un aviso de **"Sitio en construcción"** a todo el público mientras el
dueño sigue viendo y probando el sitio real.

## Cómo se usa (en Cloudflare, sin tocar código)

| Variable | Tipo | Valor |
|---|---|---|
| `CONSTRUCCION` | Text | `1` = aviso encendido. Borrarla o `0` = sitio abierto. |
| `ACCESO_PREVIA` | **Secret** | Clave larga al azar (16+ caracteres). |

Después de cambiarlas: **Deployments → Retry deployment**.

- Entrar a la vista previa: `https://sitio/?previa=CLAVE` (dura 30 días en ese navegador).
- Ver lo que ve el público: `https://sitio/?previa=salir`.
- Quitarle el acceso a todos: cambiar `ACCESO_PREVIA`.

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
| Configuración incompleta | Sin `ACCESO_PREVIA` válida nadie entra (falla cerrado). |
| Pagos de prueba | Los webhooks de pago pasan siempre (los proveedores no tienen cookie). |
| Vista previa indexada | Las páginas vistas con acceso llevan `noindex` y `no-store`. |
| Inyección | Textos escapados, colores validados, enlaces solo `https:`/`mailto:`/`tel:`, CSP propia. |
