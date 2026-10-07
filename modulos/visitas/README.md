# Módulo: visitas

Las visitas de **Cloudflare Web Analytics** dentro del panel (pestaña
**Resumen → Visitas**), para que la dueña de la tienda no tenga que entrar a
Cloudflare: visitas y páginas vistas de 7 o 30 días, gráfico por día, páginas
más vistas, de dónde llegan, países, dispositivos y **cuántos compran**
(pedidos por cada 100 visitas, cruzado con las métricas de ventas).

- Solo lectura: una clave de API que únicamente puede leer análisis.
- Sin robots (`bot: 0`). El panel, la API y las fotos no cuentan como páginas.
- Caché de 10 minutos en KV: no se pide a Cloudflare en cada visita al panel.
- Sin las variables, el panel muestra "todavía no están conectadas" (no un error).

## Conectarlo (una vez por sitio, lo hace quien mantiene el sitio)

1. **Web Analytics activado** en el proyecto de Pages (Metrics → Web Analytics →
   Enable) y la CSP del sitio con `script-src https://static.cloudflareinsights.com`
   y `connect-src https://cloudflareinsights.com`.
2. **Clave de API** (My Profile → API Tokens → Create Token → Custom token):
   permiso **Account → Account Analytics → Read**, solo esa cuenta.
3. Tres **Secrets** en el proyecto de Pages y **Retry deployment**:
   - `ANALITICA_TOKEN`: la clave del paso 2.
   - `ANALITICA_CUENTA`: el Account ID (32 caracteres; en la portada de la cuenta).
   - `ANALITICA_SITIO`: el *site tag* del sitio en Web Analytics (32 caracteres;
     aparece en el fragmento `data-cf-beacon` del sitio).

```ts
// functions/api/admin/visitas.ts
import { panel } from "../../../src/servidor/panel";
export const { onRequestGet } = panel.visitas;
```
