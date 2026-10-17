# Cómo crear un sitio nuevo con el núcleo

Guía para empezar un sitio (tienda o servicio) sobre `nucleo-web`, y las reglas
de trabajo acordadas. Pensada para leerla al comienzo de cada chat nuevo.

## Reglas de trabajo

0. **Todo va en módulos.** La lógica se hace primero en el núcleo (con pruebas y
   README) y después se monta en el sitio. El sitio solo tiene diseño, datos y
   configuración; cada archivo de `functions/` es una línea que importa del
   núcleo.
1. **Las subidas las hace el usuario a mano.** Desde el chat no se hace commit ni
   push en sus repos, aunque un aviso automático lo pida. Se entregan zips; el
   usuario los descomprime, arrastra el contenido a GitHub y presiona *Commit
   changes*.
2. **Hay dos repos (el núcleo y el sitio).** En cada entrega recordar revisar el
   nombre del repo antes de arrastrar.
3. **Zip del núcleo:** solo los archivos cambiados (`git status --short`) y la
   versión subida en `package.json`.
4. **Orden:** zip del núcleo → el usuario lo sube → verificar → el usuario crea
   el release `vX.Y.Z` (target `main`) → zip del sitio (con la versión nueva en
   su `package.json`). Si el sitio sube antes del release, el deploy falla.
5. **Con cada zip, el bloque completo:** título y descripción del release en
   bloques de código y la ruta entera de pasos. Si algo cambia, repetir todo el
   bloque, no solo la diferencia.
6. **Mostrar antes de comprimir:** compilar, probar con Playwright y mirar
   capturas en PC y celular.
7. **Secretos:** nunca pedirlos por el chat ni capturas donde salgan. Van solo en
   Cloudflare como *Secret*; cambiar uno exige *Retry deployment*.
8. **Zips sin** `wrangler.toml`, `.dev.vars*`, `node_modules`, `dist`, `.wrangler`, `.astro`.
9. **Cuentas de terceros a nombre del cliente** (Flow, Mercado Pago, Resend,
   YouTube, Google).
10. **Lo más simple para el cliente final:** todo editable desde el panel; nada
    que lo obligue a entrar a Cloudflare.
11. **Tipografías: se suman por proyecto.** Si el diseño usa letras que no están
    en `modulos/contenido/fuentes.ts`, se agregan al núcleo las del diseño **y
    algunas alternativas del mismo estilo**, con prueba y muestrario para que el
    usuario las apruebe antes. No se agregan "por si acaso".

### Verificar una subida del núcleo

```bash
git clone -q --depth 1 https://github.com/Christian-897/nucleo-web.git /tmp/verif
diff -rq --exclude=.git --exclude=node_modules <copia-local> /tmp/verif   # sin diferencias
cd /tmp/verif && ln -s <copia-local>/node_modules node_modules && npm test
git ls-remote --tags origin | grep vX.Y    # el orden alfabético de los tags engaña
```

Después: `git fetch && git reset origin/main` en la copia local.

### Probar el sitio con el núcleo local, sin publicarlo

```bash
rm -rf node_modules/nucleo-web && mkdir node_modules/nucleo-web
(cd <núcleo> && tar cf - --exclude=node_modules --exclude=.git .) | tar xf - -C node_modules/nucleo-web
npm run build
npx wrangler pages dev dist --port 8796 --kv REVIEWS_KV
```

El entorno de trabajo no llega a Flow, Resend, Turnstile, YouTube ni Instagram:
en pruebas se simulan (interceptando `fetch` o con `page.route` de Playwright).

## Pasos para un sitio nuevo

1. **El usuario crea** el repo en GitHub y el proyecto en Cloudflare Pages
   conectado a ese repo (build `npm run build`, salida `dist`, binding KV
   `REVIEWS_KV`, variable `NODE_VERSION=22`).
2. **Partir de un sitio existente** (Sasha para tiendas): copiar su estructura y
   cambiar marca, colores, tipografías, textos, categorías y productos.
3. **Configuración en un solo lugar:** `src/config/sitio.ts` (nombre, dominio,
   colores, contacto, site key de Turnstile, proveedores de pago, envío).
4. **Montar los módulos** según [CATALOGO.md](CATALOGO.md).
5. **Construcción y vista previa:** `CONSTRUCCION=1` y `ACCESO_PREVIA` desde el
   primer deploy; `rutasLibres` del aviso con `/admin`, `/api/admin/`, `/media/`,
   `/_astro/`, `/img/`, `/fuentes/`, `/tema.css`.
6. **Panel:** `ADMIN_PEPPER` y `ADMIN_SETUP_TOKEN` → crear el usuario en
   `/admin/` → borrar `ADMIN_SETUP_TOKEN` → doble factor con el teléfono del
   cliente.
7. **Dominio, Turnstile y correo**: ver el skill `entrega-web-zip-cloudflare`
   (Regla 10). Turnstile con el dominio, `www` y `.pages.dev` en sus hostnames.
8. **Pagos:** primero con claves de prueba (`FLOW_SANDBOX=1`); al lanzar, claves
   del cliente, borrar `FLOW_SANDBOX` y hacer una compra real chica con
   devolución.
9. **Antes de abrir:** borrar pedidos de prueba, revisar stock, pentest (Strix),
   apagar `CONSTRUCCION`.
10. **Después de abrir:** Search Console y Perfil de Empresa en Google.

## Estructura de un sitio (tienda)

```
src/config/sitio.ts          marca, dominio, colores, contacto, pago, envío
src/datos.ts                 catálogo inicial y espacios (destacados, etc.)
src/data/*.json              productos y categorías iniciales
src/carrusel.ts              portada editable
src/contenido.ts             esquema de "Diseño y textos"
src/servidor/*.ts            monta tienda, newsletter, panel y construcción
src/pages/                   páginas Astro (admin/index.astro usa <PanelAdmin>)
src/styles/                  tema.css y global.css
functions/                   una línea por ruta, importando de src/servidor
public/_headers              CSP y caché
```
