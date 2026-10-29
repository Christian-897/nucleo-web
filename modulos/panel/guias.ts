/**
 * GUÍAS «MUÉSTRAME CÓMO» DE LA AYUDA (v0.43).
 *
 * Cada guía recorre el panel REAL: abre la pestaña, encierra en rojo el botón
 * o campo de cada paso y explica qué hacer, con «Siguiente» y «Anterior».
 * No hace nada por la persona salvo abrir pestañas y, si hace falta para
 * mostrar el paso, abrir un editor (`clic`), que se puede cerrar con Cancelar.
 * Nunca guarda, borra ni envía.
 *
 * Reglas:
 *  - `selector` y `clic` son selectores CSS del panel (data-* o name=). Si el
 *    sitio no tiene esa parte, el paso lo dice y se puede seguir.
 *  - Textos de "tú", con los nombres EXACTOS de los botones y `**negritas**`.
 *  - Al cambiar un botón del panel, revisar sus guías (la prueba de ayuda
 *    comprueba que cada selector exista en PanelAdmin.astro o panel-app.ts).
 */

export interface PasoGuia {
  /** Lo que se encierra en rojo (el primero visible que calce). */
  selector: string;
  /** Qué hacer en este paso. */
  texto: string;
  /** Pestaña que se abre antes de mostrar el paso. */
  pestana?: string;
  /** Si `selector` no está a la vista, se toca esto primero (por ejemplo, «Editar» para abrir el editor). */
  clic?: string;
}

const P = '[data-form="producto"]';
const EDITAR = '[data-guia="editar-producto"]';
const GUARDAR = `${P} button[type="submit"]`;
const abrirEditor = (texto = "Toca **Editar** en el producto que quieres cambiar."): PasoGuia[] => [
  { pestana: "productos", selector: EDITAR, texto },
];

export const GUIAS_AYUDA: Record<string, PasoGuia[]> = {
  "producto-nuevo": [
    { pestana: "productos", selector: "[data-nuevo-producto]", texto: "Toca **+ Nuevo producto**." },
    { clic: "[data-nuevo-producto]", selector: "label:has([data-editor-archivo])", texto: "Toca **Agregar fotos** y elige una o varias. La primera queda como principal." },
    { selector: `${P} [name="nombre"]`, texto: "Escribe el **Nombre** del producto." },
    { selector: `${P} [name="precio"]`, texto: "Escribe el **Precio** en pesos, sin puntos (por ejemplo 12990)." },
    { selector: `${P} [name="disponible"]`, texto: "En **Disponible** escribe cuántas unidades tienes. Vacío = sin límite." },
    { selector: `${P} [name="categoria"]`, texto: "Elige la **Categoría** donde se va a mostrar." },
    { selector: `${P} label:has([name="tipo"][value="fisico"])`, texto: "Deja **Físico** si se despacha. **Digital** es solo para cursos o patrones que se envían por correo." },
    { selector: `${P} [name="descripcion"]`, texto: "Escribe la **Descripción**." },
    { selector: GUARDAR, texto: "Toca **Guardar cambios**. En unos segundos aparece en la tienda." },
  ],
  "cambiar-precio": [
    ...abrirEditor(),
    { clic: EDITAR, selector: `${P} [name="precio"]`, texto: "Cambia el **Precio** (en pesos, sin puntos)." },
    { selector: GUARDAR, texto: "Toca **Guardar cambios**." },
  ],
  stock: [
    ...abrirEditor(),
    { clic: EDITAR, selector: `${P} [name="disponible"]`, texto: "Escribe las unidades en **Disponible**. Vacío = sin límite; 0 = agotado. Si el producto tiene colores, las unidades van en cada color (más abajo)." },
    { selector: GUARDAR, texto: "Toca **Guardar cambios**." },
  ],
  "fotos-producto": [
    ...abrirEditor(),
    { clic: EDITAR, selector: "[data-editor-fotos]", texto: "Estas son las fotos del producto. La primera es la **Principal**. Con ◀ ▶ cambias el orden y con **✕** quitas una. Las fotos de cada color están más abajo, en **Colores**, y no cambian aquí." },
    { selector: "label:has([data-editor-archivo])", texto: "Con **Agregar fotos** sumas fotos nuevas." },
    { selector: GUARDAR, texto: "Toca **Guardar cambios**." },
  ],
  destacados: [
    ...abrirEditor(),
    { clic: EDITAR, selector: `${P} label:has([name="destacado"])`, texto: "Marca **Mostrar en \"Productos destacados\" del inicio**." },
    { selector: GUARDAR, texto: "Toca **Guardar cambios**." },
  ],
  "video-producto": [
    ...abrirEditor(),
    { clic: EDITAR, selector: `${P} [name="video"]`, texto: "Pega aquí el enlace del video de YouTube." },
    { selector: GUARDAR, texto: "Toca **Guardar cambios**." },
  ],
  "colores-producto": [
    ...abrirEditor(),
    { clic: EDITAR, selector: "[data-editor-colores]", texto: "En **Colores** está cada color con su foto y su nombre." },
    { selector: "label:has([data-colores-archivo])", texto: "Toca **Agregar colores** y elige una foto por color. Después escribe el nombre de cada uno." },
    { selector: "label:has([data-color-mini])", texto: "Con **Cambiar foto** cambias la foto grande de un color, y con **Cambiar cuadrito** solo el cuadrito que se toca en la tienda (por ejemplo, la tela de cerca)." },
    { selector: GUARDAR, texto: "Toca **Guardar cambios**." },
  ],
  "colores-stock": [
    ...abrirEditor(),
    { clic: EDITAR, selector: "[data-colores-lista]", texto: "Junto a cada color escribe sus unidades. Vacío = sin límite; 0 = agotado." },
    { selector: GUARDAR, texto: "Toca **Guardar cambios**." },
  ],
  "opciones-producto": [
    ...abrirEditor(),
    { clic: EDITAR, selector: "[data-opciones-agregar]", texto: "En **Tamaños u otras opciones**, toca **+ Agregar opción** y escribe su nombre (por ejemplo Mini) y, si cambia, su precio." },
    { selector: "[data-opciones-lista]", texto: "Con **Unidades por color** escribes las unidades de cada tamaño en cada color, y desmarcas los colores en que no viene." },
    { selector: GUARDAR, texto: "Toca **Guardar cambios**." },
  ],
  "fotos-preparadas": [
    { pestana: "productos", selector: "[data-fotos-sitio-todos-usar]", texto: "Toca **Usar las fotos preparadas**. Pone las fotos de colores que te preparamos, sin tocar tus precios ni unidades." },
  ],
  "productos-preparados": [
    { pestana: "productos", selector: "[data-productos-sitio-agregar]", texto: "Toca **Agregar a la tienda** para sumar los productos nuevos que te preparamos." },
    ...abrirEditor("Después revisa cada producto nuevo con **Editar**: su **precio**, sus **unidades** y su **categoría**."),
  ],
  "colores-vista-tienda": [
    { pestana: "productos", selector: "[data-vista-listas]", texto: "Abre **Cómo se ven en la tienda** y elige si cada producto se ve en una tarjeta o una tarjeta por color." },
  ],
  "eliminar-producto": [
    { pestana: "productos", selector: '[data-guia="eliminar-producto"]', texto: "Toca **Eliminar** en el producto y confirma. No se puede deshacer." },
  ],
  "buscar-producto": [
    { pestana: "productos", selector: "[data-buscar-producto]", texto: "Escribe parte del nombre para encontrarlo." },
    { selector: "[data-filtro-categoria]", texto: "O elige una **Categoría** para ver solo sus productos." },
  ],
  "editar-categoria": [
    { pestana: "categorias", selector: '[data-guia="editar-categoria"]', texto: "Toca **Editar** en la categoría." },
    { clic: '[data-guia="editar-categoria"]', selector: '[data-form="categoria"] [name="nombre"]', texto: "Cambia el **nombre** si quieres." },
    { selector: "label:has([data-categoria-archivo])", texto: "Con este botón cambias la **foto** de la categoría." },
    { selector: '[data-form="categoria"] button[type="submit"]', texto: "Toca **Guardar cambios**." },
  ],
  "texto-categoria": [
    { pestana: "categorias", selector: '[data-guia="editar-categoria"]', texto: "Toca **Editar** en la categoría." },
    { clic: '[data-guia="editar-categoria"]', selector: '[data-form="categoria"] [name="descripcion"]', texto: "Escribe aquí el **Texto de la categoría**. Parte con qué es y para qué sirve: Google usa ese comienzo para describirla." },
    { selector: '[data-form="categoria"] button[type="submit"]', texto: "Toca **Guardar cambios**." },
  ],
  "nueva-categoria": [
    { pestana: "categorias", selector: "[data-nueva-categoria]", texto: "Toca **+ Nueva categoría**, escribe el nombre, elige la foto y guarda." },
  ],
  subcategorias: [
    { pestana: "categorias", selector: '[data-guia="editar-categoria"]', texto: "Toca **Editar** en la categoría." },
    { clic: '[data-guia="editar-categoria"]', selector: "[data-subcats-agregar]", texto: "Toca **+ Agregar subcategoría** y escribe su nombre." },
    { selector: '[data-form="categoria"] button[type="submit"]', texto: "Toca **Guardar cambios**. Después, en cada producto eliges su subcategoría." },
  ],
  portada: [
    { pestana: "portada", selector: "[data-lista-diapos]", texto: "Estas son las fotos grandes del inicio. Toca **Editar** en la que quieras cambiar." },
    { selector: "[data-nueva-diapo]", texto: "O toca este botón para agregar una foto nueva." },
  ],
  "ver-pedidos": [
    { pestana: "pedidos", selector: "[data-lista-pedidos]", texto: "Aquí están tus pedidos pagados, el más nuevo primero, con lo que compraron y a dónde se despacha." },
  ],
  "marcar-enviado": [
    { pestana: "pedidos", selector: '[data-guia="marcar-enviado"]', texto: "Cuando despaches un pedido, toca **Marcar como enviado** en ese pedido." },
  ],
  "anular-pedido": [
    { pestana: "pedidos", selector: '[data-guia="anular-pedido"]', texto: "Toca **Anular pedido** en ese pedido y confirma. Sus productos vuelven al stock. No devuelve el dinero: eso se hace en tu medio de pago." },
  ],
  "no-pagados": [
    { pestana: "pedidos", selector: "label:has([data-pedidos-todos])", texto: "Marca **Ver también los no pagados** para ver los intentos de compra que no terminaron de pagarse." },
  ],
  "despacho-valores": [
    { pestana: "pedidos", selector: "[data-despacho-caja]", texto: "Abre **Despacho** para ver y cambiar las zonas y valores de envío." },
  ],
  "cerrar-tienda": [
    { pestana: "resumen", selector: "[data-construccion]", texto: "En **Estado de la tienda** ves si está abierta o cerrada." },
    { selector: "[data-construccion-boton]", texto: "Toca **Mostrar aviso de construcción** y confirma. Si te pide tu clave, escríbela antes." },
  ],
  "abrir-tienda": [
    { pestana: "resumen", selector: "[data-construccion-boton]", texto: "Toca **Abrir la tienda al público** y confirma. Si te pide tu clave, escríbela antes." },
  ],
  "activar-construccion": [
    { pestana: "resumen", selector: "[data-construccion-activar]", texto: "Abre **¿El dueño del panel te dio un código…?**, escribe el código y crea tu clave." },
  ],
  mensajes: [
    { pestana: "mensajes", selector: "[data-lista-mensajes]", texto: "Aquí llegan los mensajes del formulario de contacto. Para responder, usa el correo o el teléfono que dejó la persona." },
  ],
  boletin: [
    { pestana: "suscriptores", selector: "[data-nuevo-boletin]", texto: "Toca **Nuevo boletín**, escribe el asunto y el texto, y envíalo a tus suscriptores." },
  ],
  "doble-factor": [
    { pestana: "seguridad", selector: "[data-2fa-proponer]", texto: "Toca **Activar doble factor** y sigue los pasos con la app de tu celular." },
  ],
  "cambiar-contrasena": [
    { pestana: "seguridad", selector: '[data-form="clave"]', texto: "Escribe tu contraseña actual, la nueva dos veces y toca **Cambiar contraseña**." },
  ],
  invitar: [
    { pestana: "seguridad", selector: '[data-form="invitar"]', texto: "Elige cuánto dura el enlace, escribe tu contraseña y toca **Crear enlace**. Mándaselo a la persona." },
  ],
  "clave-construccion": [
    { pestana: "seguridad", selector: '[data-form="codigo-construccion"]', texto: "Elige cuánto dura el código, escribe tu contraseña y toca **Crear código**. Dáselo en persona: sirve una sola vez." },
  ],
};
