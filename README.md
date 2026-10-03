# nucleo-web

Núcleo reutilizable de módulos para sitios **Astro + Cloudflare Pages/Functions**.
La idea: la **lógica** vive acá una vez; cada **sitio** la importa y le pone su
propio diseño (`theme/`) y su config. Un sitio nuevo con otro diseño reusa el
motor tal cual.

Ver el plano completo en el documento de arquitectura del proyecto.

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
{ "dependencies": { "nucleo-web": "github:TU_USUARIO/nucleo-web#v0.5.0" } }
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
- **catalogo** — productos desde JSON con validación y stock real en KV. (listo)
- **compra** — tienda completa: carrito + pago + datos del comprador + correos, en un llamado. (listo)
- **construccion** — aviso de "sitio en construcción" con vista previa para el dueño, encendido por variable. (listo)
- **panel** — administración propia: login + doble factor, productos con fotos, pedidos y suscriptores. (listo)
- **newsletter** — suscripción con doble confirmación, baja con un clic y exportación protegida. (listo)
- _por venir:_ resenas, auth (cursos con login), textos editables del sitio (como en Muebles Crea).

## Entradas solo para el navegador

`nucleo-web/compra/cliente`, `nucleo-web/newsletter/cliente`,
`nucleo-web/catalogo/cliente` y `nucleo-web/core/turnstile` no arrastran código
del servidor. Usarlas en los `<script>` de las páginas: el formulario del
newsletter pesa 2 KB en vez de 58 KB.
