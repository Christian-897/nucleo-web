# Catálogo de módulos

Qué trae el núcleo y cómo se monta cada pieza en un sitio. El detalle de cada
módulo está en su `modulos/<nombre>/README.md`; este archivo es el mapa.

Sitio de referencia con casi todo montado: **Sasha Anette Tejidos** (tienda).
Para formularios de presupuesto: **Muebles Crea**.

## Tienda

| Módulo | Para qué | Se importa de | Monta en el sitio |
|---|---|---|---|
| `catalogo` | Productos (JSON inicial + lo editado en el panel), stock real en KV, categorías editables, ficha `/producto/<id>/` con **galería de hasta 20 fotos y un video de YouTube** (`catalogo/galeria` en el navegador), sitemap | `nucleo-web/catalogo` | `crearCatalogoEditable`, `crearBordeCatalogo`, `crearFichaProducto`, `crearSitemap` |
| `carrito` | Carrito en el navegador y validación de precio y stock en el servidor | `nucleo-web/carrito` (+ `Carrito.astro`, `BotonAgregar.astro`) | lo arma `compra` |
| `pago` | Flow y Mercado Pago bajo una interfaz; webhooks verificados contra el proveedor | `nucleo-web/pago` | lo arma `compra` |
| `despacho` | Cobro del despacho por comunas de la RM (centro/alejada) y regiones (cercana/extrema) con casillas; el comprador paga ahora o al recibir; "gratis desde $X"; avisos sin sorpresas | `nucleo-web/despacho` (+ `despacho/cliente`) | `crearDespachoEditable` → `crearEndpointsCompra({ despacho })`, `crearPanel({ despacho })`, `tienda.despacho`, `panel.despacho` |
| `compra` | Todo junto: catálogo + carrito + pago + datos del comprador + correos de venta | `nucleo-web/compra` | `crearEndpointsCompra({ catalogo, proveedores, envio, … })` → `tienda.carrito`, `tienda.stock`, `tienda.catalogo`, `tienda.pago.{iniciar,estado,retornoFlow,webhookFlow,webhookMercadoPago}` |

## Contenido editable

| Módulo | Para qué | Monta en el sitio |
|---|---|---|
| `carrusel` | Portada con diapositivas (hasta 8; texto hasta 220 caracteres) | `crearCarruselEditable` + `crearBordeCarrusel` + `<Carrusel>` |
| `contenido` | Colores (con aviso de contraste), 17 tipografías servidas desde el sitio, textos, enlaces y fotos | `crearContenidoEditable` + `crearBordeContenido` + `crearTemaCss` (`/tema.css`) |
| `contacto` | WhatsApp, teléfono, correo y redes, validados | `enlacesContacto({ ...contacto, redes })` |

## Clientes y correo

| Módulo | Para qué | Monta en el sitio |
|---|---|---|
| `newsletter` | Suscripción con doble confirmación, baja firmada (y RFC 8058), **pedir baja** por correo, exportación | `crearEndpointsNewsletter` → `/api/newsletter/{suscribir,confirmar,baja,pedir-baja,exportar}` + páginas `/newsletter/confirmar` y `/newsletter/baja` |
| `newsletter` (boletines) | Escribir y enviar boletines desde el panel; Resend por lotes; tope diario editable; List-Unsubscribe | `crearPanel({ boletines: {…} })` |
| `cotizacion` | Formulario de presupuesto **o de contacto** (`modo: "contacto"`) con anti-bots, aviso por correo (responder le llega al visitante) y respaldo; en el panel, pestaña **Mensajes** | `crearEndpointCotizacion` + `QuoteForm.astro`; panel: `crearPanel({ mensajes })` |
| `core/correo` | Envío por Resend (limpia variables pegadas a mano) | lo usan los demás |
| `core/turnstile` | Turnstile oculto (`interaction-only`) y `widget.esperar()` | en cada formulario público |

## Administración

| Módulo | Para qué | Monta en el sitio |
|---|---|---|
| `panel` | Panel propio en `/admin/`: login con doble factor e inactividad; Resumen, Productos, Categorías, Portada, Diseño y textos, Pedidos, Suscriptores, Seguridad (con **usuarios invitados** por enlace de un solo uso) | `crearPanel({...})` + `<PanelAdmin …>` + una función por ruta (lista en `modulos/panel/endpoint.ts`) |
| `metricas` | Ventas del Resumen (hoy, 7/30 días, rango, más vendidos, medios de pago, años) | dentro de `panel` |
| `visitas` | Cloudflare Web Analytics dentro del panel | `panel.visitas` + `ANALITICA_*` |
| `pago/revision` | Revisión de pagos: cruza lo cobrado en Flow con los pedidos y alerta | `crearPanel({ revisionPagos: true })` + `<PanelAdmin revisionPagos>` |
| `construccion` | Aviso "en construcción" con vista previa `?previa=CLAVE` | `crearAvisoConstruccion` (primero en `_middleware`) |

### Opciones de `crearPanel` y props de `<PanelAdmin>`

| `crearPanel({ … })` | `<PanelAdmin …>` | Activa |
|---|---|---|
| `catalogo` | — | Productos y Categorías |
| `carrusel` | `carrusel` | Portada |
| `contenido` | `contenido` | Diseño y textos |
| `boletines: { nombreSitio, coloresCorreo, urlPublica, maximoPorEnvio, limiteDiarioPlan }` | `boletines` | Boletines en Suscriptores |
| `despacho` (crearDespachoEditable) | `despacho` | Cuadro "Despacho" en Pedidos |
| `revisionPagos: true` | `revisionPagos` | Revisión de pagos en Resumen |
| `zonaHoraria` | — | Fechas del Resumen (por defecto America/Santiago) |

### Cadena de `functions/_middleware.ts` (orden)

1. aviso de construcción
2. borde del catálogo
3. borde del carrusel
4. borde del contenido

`functions/admin/_middleware.ts` y `functions/api/admin/_middleware.ts`:
`panel.cabeceras` (CSP propia del panel).

## Variables (Secrets en Cloudflare)

| Variable | Módulo |
|---|---|
| `ADMIN_PEPPER` (nunca cambiarla), `ADMIN_SETUP_TOKEN` (una vez) | panel |
| `CONSTRUCCION`, `ACCESO_PREVIA` | construccion |
| `FLOW_API_KEY`, `FLOW_SECRET_KEY`, `FLOW_SANDBOX` | pago |
| `MP_ACCESS_TOKEN`, `MP_WEBHOOK_SECRET` | pago |
| `NEWSLETTER_SECRET` (no cambiarla), `NEWSLETTER_EXPORT_TOKEN` | newsletter |
| `TURNSTILE_SECRET_KEY` | formularios públicos |
| `RESEND_API_KEY`, `RESEND_FROM`, `ADMIN_NOTIFY_EMAIL` | correo |
| `ANALITICA_TOKEN`, `ANALITICA_CUENTA`, `ANALITICA_SITIO` | visitas |
| `NODE_VERSION` = `22` (texto) | build |

Binding KV obligatorio: `REVIEWS_KV`.

## Lo que todavía no existe

Ver [HOJA-DE-RUTA.md](HOJA-DE-RUTA.md).
