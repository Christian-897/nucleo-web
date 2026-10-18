# Hoja de ruta

Módulos que todavía no existen, pensados para ampliar lo que se ofrece a cada
cliente. Todos van primero en el núcleo.

| Idea | Para qué | Notas |
|---|---|---|
| **Videos cortos en la portada** | Tutoriales verticales (YouTube Shorts o reels de Instagram) | Portada con ▶ y el reproductor se carga al tocar; editable desde el panel (enlace, título, orden). Instagram se ve con su marco blanco y pesa más. El video **por producto** ya existe (v0.22.0, YouTube): reutilizar `catalogo/video`. |
| **Antes y después** | Dos fotos con barra deslizable | Mouse, dedo y teclado; editable desde el panel. Las fotos deben tener el mismo encuadre. |
| **Redirigir `.pages.dev`** | No duplicar el sitio en Google | 301 hacia el dominio propio. |
| **Geolocalización** | Punto de retiro más cercano, despacho según comuna o distancia | El mapa ya existe (v0.24.0, `nucleo-web/mapa`). |
| **Cuentas de clientes** | Registro, pedidos y datos de despacho guardados | Opcional por sitio; 2–3 sesiones. |
| **Entrega digital automática** | Mandar el enlace del curso o patrón en el correo de confirmación, sin intervención | Campo oculto por producto digital (nunca en APIs públicas); solo tras pago confirmado. Gratis. Primer uso: Sasha. |
| **Cursos con videos largos protegidos** | Vender cursos online | Video con acceso protegido (Cloudflare Stream con enlaces firmados, Vimeo u otro, de pago) y probablemente cuentas de clientes. |
| **Reseñas** | Opiniones de compradores | — |
