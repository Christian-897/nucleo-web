/**
 * AYUDA DEL PANEL: respuestas cortas y un buscador que corre en el navegador
 * (sin servicios externos). La pantalla está en ui-defecto/ayuda-vista.ts.
 *
 * Reglas del contenido:
 *  - Español neutro, de "tú", con los nombres EXACTOS de los botones.
 *  - Genérico: sirve a cualquier sitio del núcleo. Los temas de secciones
 *    opcionales llevan `requiere` (un selector del panel): si esa parte está
 *    oculta en el sitio, el tema no se muestra.
 *  - Solo texto. `**así**` se muestra en negrita; no se interpreta HTML.
 *  - Al cambiar un botón o una función del panel, actualizar aquí también.
 */

export type SeccionAyuda =
  | "general"
  | "resumen"
  | "productos"
  | "categorias"
  | "portada"
  | "sitio"
  | "pedidos"
  | "despacho"
  | "mensajes"
  | "suscriptores"
  | "seguridad";

/** Nombre visible de cada sección y la pestaña a la que lleva "Ir a…". */
export const SECCIONES_AYUDA: Record<SeccionAyuda, { nombre: string; pestana?: string }> = {
  general: { nombre: "Lo básico" },
  resumen: { nombre: "Resumen y estado de la tienda", pestana: "resumen" },
  productos: { nombre: "Productos", pestana: "productos" },
  categorias: { nombre: "Categorías", pestana: "categorias" },
  portada: { nombre: "Portada", pestana: "portada" },
  sitio: { nombre: "Diseño y textos", pestana: "sitio" },
  pedidos: { nombre: "Pedidos", pestana: "pedidos" },
  despacho: { nombre: "Despacho y retiro", pestana: "pedidos" },
  mensajes: { nombre: "Mensajes", pestana: "mensajes" },
  suscriptores: { nombre: "Suscriptores y boletines", pestana: "suscriptores" },
  seguridad: { nombre: "Seguridad y usuarios", pestana: "seguridad" },
};

export type BloqueAyuda = string | { pasos: string[] } | { nota: string };

export interface TemaAyuda {
  id: string;
  seccion: SeccionAyuda;
  titulo: string;
  /** Otras formas de decirlo (sinónimos, palabras de la calle). Solo para buscar. */
  palabras: string[];
  contenido: BloqueAyuda[];
  /** Selector del panel que debe estar visible para mostrar el tema. */
  requiere?: string;
  /** Solo lo hace la persona dueña del panel. */
  soloDueno?: boolean;
}

export const TEMAS_AYUDA: TemaAyuda[] = [
  // ───────────── lo básico ─────────────
  {
    id: "entrar",
    seccion: "general",
    titulo: "Cómo entrar al panel",
    palabras: ["ingresar", "login", "iniciar sesión", "acceder", "dirección del panel", "admin"],
    contenido: [
      { pasos: ["Escribe en el navegador la dirección de tu tienda seguida de **/admin** (por ejemplo, tutienda.cl/admin).", "Escribe tu **usuario** y tu **contraseña**.", "Si activaste el doble factor, escribe el código de 6 dígitos de tu app y toca **Verificar**."] },
      "Funciona igual desde el computador y desde el celular.",
    ],
  },
  {
    id: "sesion-cerrada",
    seccion: "general",
    titulo: "El panel me sacó solo",
    palabras: ["se cerró", "me echó", "me deslogueó", "sesión", "inactividad", "tiempo", "volver a entrar", "se cierra"],
    contenido: [
      "Por seguridad, si no usas el panel durante un rato la sesión se cierra sola. Vuelve a entrar con tu usuario y contraseña.",
      "Puedes elegir cuánto espera (15, 30 o 60 minutos) en **Seguridad → Cierre por inactividad**.",
    ],
  },
  {
    id: "no-veo-cambio",
    seccion: "general",
    titulo: "Hice un cambio y no lo veo en la tienda",
    palabras: ["no se actualiza", "no aparece", "no cambia", "sigue igual", "recargar", "actualizar", "demora"],
    contenido: [
      "Los cambios se ven en unos segundos. Si no los ves:",
      { pasos: ["Revisa que hayas tocado **Guardar cambios**.", "Recarga la página de la tienda (tecla **F5**, o desliza hacia abajo en el celular).", "Si sigue igual, ábrela en una ventana de incógnito."] },
      "Para ver la tienda desde el panel, toca **Ver tienda** (arriba).",
    ],
  },
  {
    id: "no-se-hace-en-panel",
    seccion: "general",
    titulo: "Qué cosas no se hacen desde el panel",
    palabras: ["claves de pago", "dominio", "correo del sitio", "flow", "mercado pago", "api", "administrador", "soporte"],
    contenido: [
      "Desde el panel manejas productos, pedidos, textos, fotos y despacho. Estas otras cosas las hace quien administra tu sitio:",
      { pasos: ["Las claves de tus medios de pago (por ejemplo, Flow o Mercado Pago).", "El correo desde el que salen los avisos de la tienda.", "El dominio (la dirección de la web).", "Cambios de diseño más grandes que los de **Diseño y textos**."] },
      { nota: "Nunca envíes contraseñas ni claves por WhatsApp o correo." },
    ],
  },

  {
    id: "boletas",
    seccion: "general",
    titulo: "Boletas: cómo queda cada venta con su boleta",
    palabras: ["boleta", "boleta electrónica", "factura", "sii", "impuestos", "voucher", "comprobante de pago", "modelo de emisión", "e-boleta", "documento tributario", "transferencia", "proveedor de boletas", "automatizar boletas"],
    contenido: [
      "La boleta se maneja con el **SII** (el panel no la emite). Depende de cómo pagó el cliente:",
      "**Con tarjeta de débito o crédito** (también en ventas por internet, como las que pasan por Flow o Mercado Pago): según el SII, el comprobante de pago vale como boleta electrónica. Para eso declaras tu modelo de emisión una sola vez:",
      { pasos: ["Entra a **sii.cl → Servicios Online → Boleta de Ventas y Servicios Electrónica**.", "Toca **Declaración de Modelo de Emisión** e ingresa con tu RUT y Clave Tributaria.", "Elige **«No emito Boleta de Ventas y Servicios cuando recibo un pago electrónico»**.", "Toca **Enviar declaración**, luego **Confirmar**, y descarga el comprobante."] },
      { nota: "El modelo rige desde el momento en que lo declaras y solo se puede cambiar una vez al día; el SII recomienda hacerlo el día 1 del mes. Después de declararlo, no emitas otra boleta por esos pagos: quedaría duplicada." },
      "**Por transferencia o en efectivo:** el SII exige siempre boleta electrónica. Emítela gratis en la app **e-Boleta** del SII o en sii.cl cuando confirmes el pago. El monto y los datos del comprador están en **Pedidos**.",
      "**Otros medios dentro de Flow o Mercado Pago** (por ejemplo, pagar con saldo de la cuenta o con transferencia): pregúntale a tu contador si esa venta necesita boleta.",
      "**Factura:** si un cliente la pide para su empresa, se emite en el sistema de facturación del SII. El comprobante de pago no reemplaza una factura.",
      "Antes de declarar el modelo, confírmalo con tu contador (depende de tu situación tributaria) y pregúntales a Flow y a Mercado Pago si informan esos pagos al SII.",
      { nota: "Si no te confirman que su comprobante vale como boleta, debes emitir una boleta electrónica por cada venta: gratis y a mano en el sistema del SII (app e-Boleta o sii.cl), o de forma automática contratando un proveedor autorizado por el SII (con costo mensual)." },
    ],
  },

  // ───────────── resumen ─────────────
  {
    id: "resumen",
    seccion: "resumen",
    titulo: "Qué muestra el Resumen",
    palabras: ["ventas", "cuánto vendí", "estadísticas", "métricas", "gráficos", "más vendidos", "inicio del panel", "venta promedio"],
    contenido: [
      "Es lo primero que ves al entrar: ventas de hoy, de los últimos 7 y 30 días, la venta promedio por pedido y, más abajo, gráficos por día, los productos más vendidos y los medios de pago.",
      "Si tienes pedidos por despachar, aparece un aviso amarillo con el botón **Ver pedidos**.",
      "Los pedidos anulados no se cuentan en las ventas.",
    ],
  },
  {
    id: "revision-pagos",
    seccion: "resumen",
    titulo: "«Hay cosas que revisar» en la Revisión de pagos",
    palabras: ["flow no reconoce", "pago no reconocido", "alerta", "cuadra", "cobro", "revisar pago", "pago dudoso"],
    requiere: "[data-revision]",
    contenido: [
      "La **Revisión de pagos** compara lo que cobró Flow con los pedidos de la tienda. Si algo no cuadra, te muestra el pedido y por qué.",
      { nota: "No despaches un pedido marcado aquí hasta confirmar el pago en tu cuenta de Flow." },
      "Si era una compra de prueba, anúlala en **Pedidos**. Las devoluciones no aparecen aquí: revísalas en tu cuenta de Flow → Reembolsos.",
    ],
  },
  {
    id: "visitas",
    seccion: "resumen",
    titulo: "Cuántas personas visitan la tienda",
    palabras: ["visitas", "visitantes", "tráfico", "páginas vistas", "gente que entra", "conversión", "compran"],
    contenido: [
      "En **Resumen → Visitas** ves cuántas personas entraron, qué páginas miraron y qué porcentaje terminó comprando. Puedes ver los últimos 7 o 30 días.",
      "Si dice que no están conectadas, quien administra tu sitio puede activarlas.",
    ],
  },
  {
    id: "cerrar-tienda",
    seccion: "resumen",
    titulo: "Cerrar la tienda un tiempo (vacaciones)",
    palabras: ["vacaciones", "cerrar", "pausar", "en construcción", "mantención", "ocultar tienda", "aviso", "suspender ventas"],
    requiere: "[data-construccion]",
    contenido: [
      { pasos: ["Ve a **Resumen**.", "En el cuadro **Estado de la tienda**, toca **Mostrar aviso de construcción** y confirma."] },
      "Los clientes verán el aviso «Sitio en construcción» y no podrán ver productos ni comprar. No se borra nada: productos, pedidos y textos quedan igual.",
      "Mientras está cerrada, una banda amarilla arriba te lo recuerda. Tú sí puedes ver la tienda con **Ver tienda**.",
      "El cambio tarda hasta un minuto en verse para todos.",
    ],
  },
  {
    id: "abrir-tienda",
    seccion: "resumen",
    titulo: "Abrir la tienda al público",
    palabras: ["abrir", "lanzar", "publicar", "quitar aviso", "reabrir", "volver a vender", "construcción"],
    requiere: "[data-construccion]",
    contenido: [
      { pasos: ["Ve a **Resumen**.", "En **Estado de la tienda**, toca **Abrir la tienda al público** y confirma."] },
      "Si no aparece el botón y dice que está encendido desde Cloudflare, pídele a quien administra tu sitio que lo abra.",
    ],
  },

  // ───────────── productos ─────────────
  {
    id: "producto-nuevo",
    seccion: "productos",
    titulo: "Subir un producto nuevo",
    palabras: ["agregar producto", "crear producto", "publicar producto", "nuevo artículo", "cargar producto"],
    contenido: [
      { pasos: ["Ve a **Productos** y toca **+ Nuevo producto**.", "Toca **Agregar fotos** y elige una o varias.", "Completa **Nombre**, **Precio (CLP)** y **Disponible** (cuántas unidades tienes).", "Elige la **Categoría** y el **Tipo**: Físico si se despacha, Digital si es un curso o patrón que se envía por correo.", "Escribe la **Descripción**.", "Toca **Guardar cambios**."] },
      "En unos segundos aparece en la tienda.",
    ],
  },
  {
    id: "cambiar-precio",
    seccion: "productos",
    titulo: "Cambiar el precio de un producto",
    palabras: ["precio", "valor", "subir precio", "bajar precio", "oferta", "descuento", "rebaja", "cuánto cuesta", "cupón", "código de descuento", "liquidación"],
    contenido: [
      { pasos: ["Ve a **Productos** y toca **Editar** en el producto.", "Cambia el número en **Precio (CLP)**: solo números, sin puntos ni $ (por ejemplo 9990).", "Toca **Guardar cambios**."] },
      "Quien ya tenga el producto en el carrito paga el precio nuevo al pagar.",
      "La tienda no tiene cupones de descuento: para una oferta, baja el precio del producto y después vuelve a subirlo.",
    ],
  },
  {
    id: "stock",
    seccion: "productos",
    titulo: "Stock: unidades disponibles y productos agotados",
    palabras: ["stock", "inventario", "agotado", "sin stock", "disponible", "unidades", "cantidad", "reponer", "vendidos", "quedan"],
    contenido: [
      "**Disponible** es cuántas unidades puedes vender. Baja solo cada vez que alguien compra; cuando llega a 0, el producto aparece agotado y no se puede comprar.",
      { pasos: ["Para reponer: **Productos → Editar**.", "Cambia **Disponible** por las unidades que tienes ahora.", "Toca **Guardar cambios**."] },
      "**Vendidos** cuenta lo vendido desde la última vez que cambiaste «Disponible» (al cambiarlo vuelve a 0).",
      "Si anulas un pedido, sus unidades vuelven solas al stock.",
    ],
  },
  {
    id: "fotos-producto",
    seccion: "productos",
    titulo: "Cambiar, agregar u ordenar las fotos de un producto",
    palabras: ["foto", "imagen", "fotos", "cambiar foto", "foto principal", "ordenar fotos", "borrar foto"],
    contenido: [
      "En **Productos → Editar**, en el recuadro **Fotos** (hasta 20 por producto):",
      { pasos: ["**Agregar fotos**: puedes elegir varias a la vez. Se recortan cuadradas y se achican solas.", "La primera es la **Principal**: la que se ve en la tienda y en el carrito.", "Con las flechas ◀ ▶ cambias el orden y con ✕ quitas la foto que está seleccionada.", "Toca **Guardar cambios**."] },
      "Consejo: fotos con buena luz natural y fondo simple se ven mejor.",
    ],
  },
  {
    id: "destacados",
    seccion: "productos",
    titulo: "Mostrar un producto en «Productos destacados» del inicio",
    palabras: ["destacado", "inicio", "portada", "home", "resaltar", "principal"],
    contenido: [
      "En **Productos → Editar**, marca **Mostrar en «Productos destacados» del inicio** y toca **Guardar cambios**.",
      "Si marcas más de los que caben, en el inicio se ven los más recientes. Arriba de la lista de productos dice cuántos destacados tienes.",
    ],
  },
  {
    id: "video-producto",
    seccion: "productos",
    titulo: "Agregar un video de YouTube a un producto",
    palabras: ["video", "youtube", "short", "reel", "grabación"],
    contenido: [
      { pasos: ["Sube el video a YouTube (puede ser un Short o «no listado»).", "En YouTube toca **Compartir → Copiar enlace**.", "En **Productos → Editar**, pégalo en **Video (opcional)** y toca **Guardar cambios**."] },
      "Para quitarlo, deja el campo vacío y guarda.",
    ],
  },
  {
    id: "colores-producto",
    seccion: "productos",
    titulo: "Agregar colores (o modelos) a un producto",
    palabras: ["colores", "color", "variantes", "modelos", "tonos", "miniaturas", "ovillos", "lanas de colores", "agregar color", "cuántas fotos", "nuevo producto por color"],
    contenido: [
      "Un mismo producto puede venir en varios colores. En vez de crear un producto por cada color, tienes **un solo producto** y adentro sus colores, cada uno con **su foto y sus unidades**. En la tienda, el cliente toca la miniatura del color y la foto grande cambia. Sirve para cualquier categoría.",
      { pasos: ["Ve a **Productos** y toca **Editar** en el producto que ya existe (o crea uno con **+ Nuevo producto**).", "Abajo, en **Colores**, toca **+ Agregar colores** y elige las fotos (puedes elegir varias a la vez; **una foto por color**).", "Escribe el **nombre** de cada color (por ejemplo «Naranjo» o «Gris y blanco»).", "Escribe las **unidades** de cada color (vacío = sin límite).", "Ordénalos con ↑ ↓: el primero es el que aparece elegido al abrir la ficha.", "Toca **Guardar cambios** y espera a que suban las fotos."] },
      { nota: "Para ahorrar tiempo: si antes de subir las fotos le pones al archivo el nombre del color (por ejemplo «Azul rey.jpg»), el nombre ya aparece escrito." },
      "**Cambiar foto** reemplaza la foto de ese color sin perder sus unidades. **Quitar** lo saca de la tienda al guardar (los pedidos que ya lo tenían no se pierden).",
      "En **Se llama en la tienda** eliges si la ficha dice «Color» o «Modelo» (por ejemplo, para un peluche que cambia de diseño).",
      "Puedes agregar **hasta 100 colores por producto**. Si el producto viene en un solo color, no agregues ninguno: se vende como siempre.",
    ],
  },
  {
    id: "colores-stock",
    seccion: "productos",
    titulo: "Unidades y agotados por color",
    palabras: ["stock por color", "agotado un color", "se acabó un color", "reponer color", "unidades por color", "quitar color", "quedan pocos", "color tachado"],
    contenido: [
      "Con colores, las unidades se escriben **en cada color**. En la lista de productos, «disponibles» muestra la suma de todos.",
      { pasos: ["**Vacío**: «Disponible», sin límite.", "**Un número**: «Disponible»; cuando quedan 3 o menos dice «¡Quedan 3!», «¡Quedan 2!» o «¡Queda 1!».", "**0**: el color aparece **tachado**, dice «Agotado» y no se puede elegir. Los demás colores se siguen vendiendo."] },
      "Cada venta descuenta **solo del color vendido** y, si anulas el pedido, las unidades vuelven a ese mismo color. Para reponer, cambia sus unidades y toca **Guardar cambios**.",
      "En el carrito, el pago, el correo y los **Pedidos** aparece el producto con su color (por ejemplo «Gatito · Naranjo»), para que sepas cuál enviar.",
    ],
  },
  {
    id: "colores-tienda",
    seccion: "productos",
    titulo: "Cómo ve los colores el cliente",
    palabras: ["ver los colores", "ver más colores", "muchos colores", "cuántos colores se ven", "elige tu color", "ficha con colores", "color 1"],
    contenido: [
      "En la tienda, un producto con colores se ve como **una sola tarjeta con circulitos de colores** o como **una tarjeta por color**, según lo que elijas en **Productos → Cómo se ven en la tienda los productos con colores**. En la ficha aparece **Elige tu color**.",
      "Al tocar una miniatura cambian la foto grande, el nombre del color y la disponibilidad. Con la **lupa** (o tocando la foto) se ve en pantalla completa y se puede acercar.",
      "Si hay muchos colores, se muestran los primeros **24 en computador** y **15 en celular**; el resto aparece con el botón **Ver los N colores**. El número es el total de colores cargados: si ves más de los que esperabas, revisa en **Editar → Colores** si hay fotos repetidas.",
      "No se puede agregar al carrito sin un color elegido.",
    ],
  },
  {
    id: "colores-vista-tienda",
    seccion: "productos",
    titulo: "Elegir cómo se ven los colores en la tienda (una tarjeta o una por color)",
    palabras: ["tarjeta por color", "una tarjeta por color", "circulitos", "muestras de color", "se ve vacío", "se ve solo", "categoría vacía", "pocos productos", "cómo se ven los colores", "vista de la tienda"],
    requiere: '[data-tab="productos"]:not([hidden])',
    contenido: [
      "Los productos con colores se pueden mostrar de dos formas en la tienda:",
      { pasos: ["**Una tarjeta por producto**: bajo la foto aparecen circulitos con los colores (y «+N» si hay más). Al pasar el mouse o tocar un circulito, la foto cambia a ese color.", "**Una tarjeta por color**: cada color es su propia tarjeta («Producto · Color»), se puede agregar al carrito directo y abre la ficha con ese color elegido. Sirve para que una categoría con pocos productos no se vea vacía."] },
      "Para cambiarlo:",
      { pasos: ["Ve a **Productos**.", "Abre **Cómo se ven en la tienda los productos con colores**.", "Elige una opción para **la página de cada categoría** y otra para **toda la tienda, el inicio y «También te puede gustar»**.", "Toca **Guardar**. La tienda se actualiza en menos de un minuto."] },
      "Los productos sin colores se ven siempre igual, con una sola tarjeta.",
      { nota: "En toda la tienda conviene «Una tarjeta por producto»: con muchos colores, «Una tarjeta por color» hace la lista muy larga." },
    ],
  },
  {
    id: "colores-consejos",
    seccion: "productos",
    titulo: "Consejos para las fotos y nombres de los colores",
    palabras: ["fotos de colores", "foto con letras", "texto del proveedor", "etiqueta del proveedor", "nombre del color", "productos repetidos por color", "unir productos"],
    contenido: [
      { pasos: ["Saca las fotos de un producto con **la misma luz, el mismo fondo y el mismo encuadre**, así los colores se comparan fácil.", "Usa fotos **sin textos ni etiquetas del proveedor**. Si una foto los trae, recórtala antes de subirla.", "Escribe los nombres con **mayúscula inicial** y sin faltas: se muestran tal cual.", "Evita nombres que se confundan (por ejemplo «Blanco y gris» y «Gris y blanco»); mejor usa el color que predomina."] },
      { nota: "Si antes tenías **un producto por cada color**, pasa todos los colores a uno solo y después elimina los productos que sobran, para que no se vean repetidos en la tienda." },
    ],
  },
  {
    id: "ficha-ajustes",
    seccion: "productos",
    titulo: "Cómo se ve la ficha del producto (miniaturas y partes opcionales)",
    palabras: ["ficha", "miniatura", "acercamiento", "foto completa", "textura", "lupa", "zoom", "disponible", "ocultar", "quitar etiqueta", "recuadros"],
    contenido: [
      "En **Productos**, abre **Cómo se ve la ficha del producto**:",
      { pasos: ["**Miniaturas de los colores**: **Foto completa** (se ve el producto entero) o **Acercamiento** (de cerca, para ver la textura).", "**Mostrar en la ficha**: marca o desmarca la categoría, «Disponible», cuántos colores hay, la lupa y los recuadros de envío y pago.", "Toca **Guardar**."] },
      "Vale para toda la tienda. Con **Acercamiento**, en cada producto puedes elegir el punto que se ve de cerca: **Editar → Colores → Ajustar el acercamiento de las miniaturas** y toca en la foto (al lado ves cómo queda; vale para todos los colores de ese producto).",
      "Con **Foto completa**, el ajuste de acercamiento no cambia nada.",
    ],
  },
  {
    id: "producto-digital",
    seccion: "productos",
    titulo: "Cursos y patrones (productos digitales)",
    palabras: ["curso", "patrón", "pdf", "digital", "descargable", "online"],
    contenido: [
      "Al crear o editar el producto, en **Tipo** elige **Digital (curso o patrón por correo)**.",
      "Los productos digitales no pagan despacho y no piden dirección.",
    ],
  },
  {
    id: "eliminar-producto",
    seccion: "productos",
    titulo: "Quitar un producto de la tienda",
    palabras: ["eliminar", "borrar producto", "sacar producto", "saco producto", "quitar producto", "ocultar producto", "descontinuar"],
    contenido: [
      "En **Productos**, toca **Eliminar** en el producto y confirma. Deja de verse en la tienda y se borran sus fotos. Los pedidos que ya se hicieron no se pierden.",
      { nota: "No se puede deshacer. Si solo se te acabó, mejor deja «Disponible» en 0: queda como agotado y no pierdes las fotos." },
    ],
  },
  {
    id: "buscar-producto",
    seccion: "productos",
    titulo: "Encontrar un producto en la lista",
    palabras: ["buscar", "filtrar", "encontrar", "lista de productos"],
    contenido: ["En **Productos**, escribe parte del nombre en **Buscar** o elige una **Categoría** para ver solo esa."],
  },

  // ───────────── categorías ─────────────
  {
    id: "editar-categoria",
    seccion: "categorias",
    titulo: "Cambiar el nombre o la foto de una categoría",
    palabras: ["categoría", "renombrar", "foto categoría", "menú", "nombre corto"],
    contenido: [
      { pasos: ["Ve a **Categorías** y toca **Editar**.", "Cambia el nombre, el nombre corto del menú, la bajada o la foto.", "Guarda."] },
      "Se actualiza en el menú, el inicio y la tienda en unos segundos.",
    ],
  },
  {
    id: "nueva-categoria",
    seccion: "categorias",
    titulo: "Crear o borrar una categoría",
    palabras: ["nueva categoría", "agregar categoría", "borrar categoría", "eliminar categoría"],
    contenido: [
      "En **Categorías**, toca **Nueva categoría** (puedes crear hasta 12 nuevas). Después asígnale productos desde **Productos → Editar → Categoría**.",
      "**Borrar** solo funciona si la categoría no tiene productos. Si tiene, el panel te dice cuántos: muévelos a otra categoría primero.",
    ],
  },

  // ───────────── portada ─────────────
  {
    id: "portada",
    seccion: "portada",
    titulo: "Cambiar las fotos grandes del inicio (portada)",
    palabras: ["carrusel", "banner", "slider", "diapositiva", "foto inicio", "portada"],
    requiere: '[data-tab="portada"]:not([hidden])',
    contenido: [
      { pasos: ["Ve a **Portada**.", "**+ Nueva diapositiva** agrega una foto con su título y botón; **Editar** la cambia; **Eliminar** la quita.", "Con **↑ ↓** cambias el orden."] },
      "Arriba eliges cada cuántos segundos avanzan solas y cómo se ven los botones. **Ver portada** muestra el resultado.",
    ],
  },
  {
    id: "portada-celular",
    seccion: "portada",
    titulo: "Usar otra foto de portada en el celular",
    palabras: ["celular", "teléfono", "móvil", "foto vertical", "portada celular", "banner celular", "se corta en el celular"],
    requiere: '[data-tab="portada"]:not([hidden])',
    contenido: [
      "Cada diapositiva puede tener una **foto para celular**: vertical o cuadrada, para que en el teléfono no se corte la persona o el producto.",
      { pasos: ["Ve a **Portada** y toca **Editar** en la diapositiva.", "Abajo de la foto, toca **Elegir foto para celular**.", "Toca **Guardar cambios**."] },
      "Si no eliges una, en el celular se usa la foto normal. **Quitar la foto para celular** vuelve a eso.",
      { nota: "Deja espacio libre donde van los textos (en la mayoría de los diseños, a la izquierda o arriba)." },
    ],
  },

  // ───────────── diseño y textos ─────────────
  {
    id: "colores",
    seccion: "sitio",
    titulo: "Cambiar colores y tipos de letra",
    palabras: ["color", "colores", "letra", "tipografía", "fuente", "diseño", "estilo"],
    requiere: '[data-tab="sitio"]:not([hidden])',
    contenido: [
      { pasos: ["Ve a **Diseño y textos**.", "Elige **Colores** o **Tipografías**.", "Cambia lo que quieras y toca **Guardar cambios**."] },
      "Si un texto va a quedar difícil de leer con esos colores, aparece un aviso (puedes guardar igual).",
    ],
  },
  {
    id: "textos",
    seccion: "sitio",
    titulo: "Cambiar los textos de la web",
    palabras: ["texto", "escribir", "nosotros", "preguntas frecuentes", "faq", "franja", "mensaje de arriba", "títulos", "redacción"],
    requiere: '[data-tab="sitio"]:not([hidden])',
    contenido: [
      { pasos: ["Ve a **Diseño y textos**.", "Elige la sección: franja superior, inicio, nosotros, preguntas frecuentes, etc.", "Cambia el texto y toca **Guardar cambios**."] },
      "Mientras editas ves una vista previa de cómo va quedando.",
    ],
  },
  {
    id: "contacto-redes",
    seccion: "sitio",
    titulo: "Cambiar el WhatsApp, el correo o las redes sociales",
    palabras: ["whatsapp", "teléfono", "celular", "número", "instagram", "facebook", "tiktok", "redes", "correo de contacto", "horario"],
    requiere: '[data-tab="sitio"]:not([hidden])',
    contenido: [
      { pasos: ["Ve a **Diseño y textos → Contacto y redes**.", "Cambia el número, el correo, el horario o los enlaces de tus redes.", "Toca **Guardar cambios**."] },
      "Si dejas vacío el WhatsApp o una red, ese botón deja de mostrarse.",
    ],
  },
  {
    id: "deshacer-diseno",
    seccion: "sitio",
    titulo: "Me equivoqué en Diseño y textos: volver atrás",
    palabras: ["deshacer", "volver atrás", "original", "restaurar", "me equivoqué", "resetear"],
    requiere: '[data-tab="sitio"]:not([hidden])',
    contenido: ["En **Diseño y textos**, dentro de la sección que cambiaste, toca **Volver a lo original en esta sección**. Solo afecta a esa sección."],
  },

  // ───────────── pedidos ─────────────
  {
    id: "ver-pedidos",
    seccion: "pedidos",
    titulo: "Ver los pedidos y los datos del comprador",
    palabras: ["pedidos", "órdenes", "compras", "ventas", "quién compró", "dirección del cliente", "datos del cliente"],
    contenido: [
      "En **Pedidos** están las compras pagadas. Cada una muestra qué compró la persona, sus datos de contacto, la dirección o el retiro, y cómo pagó.",
      "Además te llega un correo con cada venta.",
    ],
  },
  {
    id: "marcar-enviado",
    seccion: "pedidos",
    titulo: "Marcar un pedido como enviado o entregado",
    palabras: ["enviado", "despachado", "entregado", "listo", "retirado", "envié", "courier"],
    contenido: [
      "Cuando despaches un pedido, toca **Marcar como enviado**. Si el cliente retira, toca **Marcar como entregado** cuando lo reciba.",
      "Así sabes qué falta, y el aviso «pedidos por despachar» del Resumen se actualiza.",
    ],
  },
  {
    id: "anular-pedido",
    seccion: "pedidos",
    titulo: "Anular un pedido",
    palabras: ["anular", "cancelar pedido", "pedido de prueba", "compra cancelada", "arrepentido"],
    contenido: [
      "Toca **Anular pedido** y confirma. El pedido deja de contar en las ventas, sus productos **vuelven al stock** y queda marcado «Anulado», con la fecha y quién lo anuló.",
      { nota: "Anular NO devuelve el dinero. Si el cliente pagó, el reembolso se hace aparte en tu cuenta del medio de pago." },
      "Si no te aparece el botón, tu usuario no tiene ese permiso: pídeselo a la persona dueña del panel (Seguridad → Usuarios).",
    ],
  },
  {
    id: "borrar-pedido",
    seccion: "pedidos",
    titulo: "Borrar un pedido",
    palabras: ["borrar pedido", "eliminar pedido", "limpiar pruebas", "quitar pedido"],
    contenido: [
      "Solo se pueden borrar pedidos **anulados**: primero **Anular pedido** y después **Borrar**. Sirve para limpiar compras de prueba.",
      { nota: "Borrar no se puede deshacer: el pedido desaparece de la lista." },
    ],
  },
  {
    id: "reembolso",
    seccion: "pedidos",
    titulo: "Devolverle el dinero a un cliente (reembolso)",
    palabras: ["devolver plata", "devolución", "reembolso", "reembolsar", "devolver dinero", "reintegro"],
    contenido: [
      "El reembolso no se hace desde el panel: se hace en tu cuenta del medio con que pagó el cliente (por ejemplo, Flow o Mercado Pago), buscando el pago y eligiendo devolverlo.",
      "Después, en **Pedidos**, anula el pedido para que no cuente en las ventas y los productos vuelvan al stock.",
    ],
  },
  {
    id: "no-pagados",
    seccion: "pedidos",
    titulo: "Pedidos que no aparecen o que no se pagaron",
    palabras: ["no pagado", "pendiente", "no aparece", "carrito abandonado", "intento de compra", "falló el pago"],
    contenido: [
      "La lista muestra solo los pedidos pagados. Marca **Ver también los no pagados** (arriba) para ver los intentos de compra que no terminaron de pagarse.",
      "Un pedido no pagado no se despacha: la persona no completó el pago.",
    ],
  },

  // ───────────── despacho ─────────────
  {
    id: "despacho-valores",
    seccion: "despacho",
    titulo: "Cambiar lo que cuesta el despacho",
    palabras: ["despacho", "envío", "costo de envío", "tarifa", "zona", "regiones", "santiago", "courier", "flete"],
    requiere: "[data-despacho-caja]",
    contenido: [
      { pasos: ["Ve a **Pedidos** y abre la caja **Despacho** (toca su título).", "Con **Cobrar el despacho según la zona** encendido, escribe el valor de cada zona.", "Abajo eliges qué comunas o regiones van en cada zona.", "Toca **Guardar cambios** al final de la caja."] },
      "Si lo apagas, todo el despacho queda «por pagar» al recibir. Los productos digitales nunca pagan despacho.",
    ],
  },
  {
    id: "despacho-gratis",
    seccion: "despacho",
    titulo: "Despacho gratis",
    palabras: ["gratis", "envío gratis", "sin costo", "promoción", "desde cierto monto"],
    requiere: "[data-despacho-caja]",
    contenido: ["En **Pedidos → Despacho**, en **Despacho gratis en compras desde**, escribe el monto mínimo. Para que una zona sea siempre gratis, pon 0 en su valor. Toca **Guardar cambios**."],
  },
  {
    id: "pagar-al-recibir",
    seccion: "despacho",
    titulo: "Pagar el despacho al recibir",
    palabras: ["al recibir", "por pagar", "contra entrega", "paga el cliente al courier", "pagar despacho después"],
    requiere: "[data-despacho-caja]",
    contenido: [
      "En **Pedidos → Despacho → Pagar el despacho al recibir**, marca las zonas donde el comprador puede elegir pagar el envío al recibirlo.",
      "En las zonas que no marques, el despacho se paga junto con la compra (por ejemplo, si el courier de esa zona lo exige pagado).",
    ],
  },
  {
    id: "retiro",
    seccion: "despacho",
    titulo: "Ofrecer retiro sin costo",
    palabras: ["retiro", "retirar", "punto de encuentro", "pasar a buscar", "entrega en persona", "dirección de retiro"],
    requiere: "[data-despacho-caja]",
    contenido: [
      { pasos: ["En **Pedidos → Despacho**, marca **Ofrecer retiro sin costo**.", "Elige el nombre que verá el cliente (por ejemplo «Retiro coordinado»).", "Escribe la comuna, la dirección o punto exacto y, si quieres, instrucciones.", "Toca **Guardar cambios**."] },
      "Con la casilla de mostrar la dirección solo en el correo marcada, en la tienda solo se ve la comuna y la dirección exacta le llega al comprador después de pagar.",
    ],
  },

  // ───────────── mensajes ─────────────
  {
    id: "mensajes",
    seccion: "mensajes",
    titulo: "Leer y responder los mensajes de contacto",
    palabras: ["mensaje", "consulta", "formulario", "contacto", "pregunta de cliente", "responder"],
    requiere: '[data-tab="mensajes"]:not([hidden])',
    contenido: [
      "En **Mensajes** está lo que te escriben desde el formulario de contacto. La burbuja con número en la pestaña indica los que faltan por responder.",
      { pasos: ["**Responder por correo** abre tu correo con la respuesta lista.", "Cuando contestes, toca **Marcar como respondido**.", "**Borrar** elimina el mensaje (no se puede deshacer)."] },
    ],
  },

  // ───────────── suscriptores ─────────────
  {
    id: "suscriptores",
    seccion: "suscriptores",
    titulo: "Ver, descargar o quitar suscriptores",
    palabras: ["suscriptores", "newsletter", "lista de correos", "csv", "excel", "darse de baja", "quitar de la lista"],
    contenido: [
      "En **Suscriptores** ves cuántas personas confirmaron su suscripción. **Descargar lista (CSV)** guarda un respaldo que se abre en Excel.",
      "Si alguien te pide no recibir más correos, búscalo en **Lista** y toca **Quitar**.",
    ],
  },
  {
    id: "boletin",
    seccion: "suscriptores",
    titulo: "Enviar un boletín (correo) a los suscriptores",
    palabras: ["boletín", "newsletter", "correo masivo", "mail", "novedades", "promoción por correo", "email"],
    requiere: "[data-boletines]:not([hidden])",
    contenido: [
      { pasos: ["En **Suscriptores → Boletines**, toca **Nuevo boletín**.", "Escribe el asunto y el texto; puedes agregar una foto.", "Toca **Enviarme una prueba** y revisa cómo te llega.", "Si está bien, toca **Enviar a …** (el número de suscriptores)."] },
      "Hay un máximo de correos de boletín por día. Si la lista es más grande, se envía hasta el máximo y al día siguiente aparece **Seguir enviando** para continuar.",
    ],
  },

  // ───────────── seguridad ─────────────
  {
    id: "doble-factor",
    seccion: "seguridad",
    titulo: "Activar el doble factor (código del celular)",
    palabras: ["doble factor", "2fa", "dos pasos", "autenticador", "google authenticator", "código", "qr", "verificación", "seguridad"],
    contenido: [
      { pasos: ["Instala en tu celular **Google Authenticator** o **Microsoft Authenticator** (gratis).", "En el panel ve a **Seguridad** y toca **Activar doble factor**.", "En la app toca **+** → **Escanear código QR** y apunta al QR de la pantalla (o escribe la clave que aparece bajo el QR).", "Escribe el número de 6 dígitos que muestra la app y toca **Confirmar y activar**.", "Guarda los **8 códigos de respaldo** que aparecen (anótalos en papel) y toca **Ya los guardé**."] },
      "Desde ahí, al entrar el panel te pide el código de la app además de tu contraseña.",
    ],
  },
  {
    id: "perdi-celular",
    seccion: "seguridad",
    titulo: "Perdí o cambié el celular (doble factor)",
    palabras: ["perdí el celular", "cambié de teléfono", "no tengo el código", "códigos de respaldo", "no puedo entrar", "robo", "app borrada"],
    contenido: [
      "**Si tienes tus códigos de respaldo:** al entrar, escribe uno en lugar del código de la app (cada uno sirve una vez). Ya dentro, en **Seguridad** desactiva el doble factor y vuelve a activarlo con el celular nuevo.",
      "**Si no tienes ni el celular ni los códigos:** pídele a la persona dueña del panel que te lo restablezca. Entrarás con tu misma contraseña y lo activas de nuevo. No pierdes nada.",
      { nota: "Antes de borrar la app o cambiar de celular, genera códigos nuevos o desactiva el doble factor mientras aún puedes entrar." },
    ],
  },
  {
    id: "cambiar-contrasena",
    seccion: "seguridad",
    titulo: "Cambiar mi contraseña",
    palabras: ["contraseña", "clave", "password", "cambiar clave", "nueva contraseña"],
    contenido: [
      { pasos: ["Ve a **Seguridad → Cambiar contraseña**.", "Escribe la actual, la nueva (mínimo 10 caracteres) y repítela.", "Toca **Cambiar contraseña**."] },
      "Usa una contraseña que no uses en otro lado.",
    ],
  },
  {
    id: "olvide-contrasena",
    seccion: "seguridad",
    titulo: "Olvidé mi contraseña",
    palabras: ["olvidé la clave", "no recuerdo la contraseña", "recuperar contraseña", "no puedo entrar", "bloqueado"],
    contenido: [
      "Por seguridad, el panel no envía la contraseña por correo. Pídele a la persona dueña del panel que te cree un acceso nuevo con un enlace de invitación. No pierdes nada de la tienda.",
      "Si se equivoca la contraseña muchas veces seguidas, el panel bloquea los intentos por un rato: espera unos minutos.",
    ],
  },
  {
    id: "invitar",
    seccion: "seguridad",
    titulo: "Darle acceso al panel a otra persona",
    palabras: ["invitar", "nuevo usuario", "dar acceso", "ayudante", "empleado", "compartir panel", "enlace de invitación"],
    soloDueno: true,
    contenido: [
      { pasos: ["En **Seguridad → Usuarios del panel → Invitar a alguien**, elige cuánto dura el enlace.", "Escribe tu contraseña y toca **Crear enlace**.", "Copia el enlace y mándaselo. Esa persona elige su propio usuario y contraseña."] },
      "El enlace sirve una sola vez y vence solo. Nunca compartas tu propia contraseña.",
    ],
  },
  {
    id: "permisos",
    seccion: "seguridad",
    titulo: "Permitir que otra persona anule y borre pedidos",
    palabras: ["permiso", "anular pedidos", "autorizar", "permisos de usuario"],
    soloDueno: true,
    contenido: ["En **Seguridad → Usuarios del panel**, marca **Puede anular y borrar pedidos** en la fila de esa persona. Se guarda solo."],
  },
  {
    id: "restablecer-2fa",
    seccion: "seguridad",
    titulo: "Restablecer el doble factor de otra persona",
    palabras: ["restablecer", "resetear doble factor", "perdió el celular", "no puede entrar", "quitar doble factor"],
    soloDueno: true,
    contenido: [
      "Si alguien de tu equipo perdió el celular y sus códigos de respaldo: en **Seguridad → Usuarios del panel**, toca **Restablecer doble factor** en su fila y confirma.",
      "Se le cierra la sesión; vuelve a entrar con su misma contraseña y activa el doble factor de nuevo. Su usuario y permisos quedan igual.",
    ],
  },
  {
    id: "quitar-acceso",
    seccion: "seguridad",
    titulo: "Quitarle el acceso al panel a alguien",
    palabras: ["quitar acceso", "eliminar usuario", "sacar usuario", "revocar", "despedir"],
    soloDueno: true,
    contenido: ["En **Seguridad → Usuarios del panel**, toca **Quitar acceso** en su fila. Su sesión se cierra en el acto. Lo que hizo en la tienda no se borra."],
  },
];

// ─────────────────────────── buscador ───────────────────────────

const VACIAS = new Set(
  "a al con como cual de del el en es esta este hacer hago la las lo los me mi mis no o para por puedo que quiero se si su sus te tengo tu un una uno y ya donde cuando".split(" ")
);

/** Minúsculas, sin tildes ni signos. "¿Cómo cambio el PRECIO?" → "como cambio el precio". */
export function normalizarAyuda(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9ñ]+/g, " ")
    .trim();
}

/** Raíz simple: quita plurales y algunas terminaciones para que "pedidos" = "pedido", "fotos" = "foto". */
function raiz(p: string): string {
  if (p.length > 4 && p.endsWith("es")) return p.slice(0, -2);
  if (p.length > 3 && p.endsWith("s")) return p.slice(0, -1);
  return p;
}

function distancia(a: string, b: string, tope: number): number {
  if (Math.abs(a.length - b.length) > tope) return tope + 1;
  let previa = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const fila = [i];
    let minimo = i;
    for (let j = 1; j <= b.length; j++) {
      fila[j] = Math.min(previa[j] + 1, fila[j - 1] + 1, previa[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      minimo = Math.min(minimo, fila[j]);
    }
    if (minimo > tope) return tope + 1;
    previa = fila;
  }
  return previa[b.length];
}

function textoPlano(b: BloqueAyuda): string {
  if (typeof b === "string") return b;
  if ("pasos" in b) return b.pasos.join(" ");
  return b.nota;
}

interface Indice {
  tema: TemaAyuda;
  campos: { palabras: string[]; peso: number }[];
}

const cacheIndices = new WeakMap<TemaAyuda[], Indice[]>();

function indexar(temas: TemaAyuda[]): Indice[] {
  const hecho = cacheIndices.get(temas);
  if (hecho) return hecho;
  const partir = (t: string) => normalizarAyuda(t).split(" ").filter(Boolean).map(raiz);
  const indices = temas.map((tema) => ({
    tema,
    campos: [
      { palabras: partir(tema.titulo), peso: 6 },
      { palabras: partir(tema.palabras.join(" ")), peso: 5 },
      { palabras: partir(SECCIONES_AYUDA[tema.seccion].nombre), peso: 2 },
      { palabras: partir(tema.contenido.map(textoPlano).join(" ").replace(/\*\*/g, "")), peso: 1 },
    ],
  }));
  cacheIndices.set(temas, indices);
  return indices;
}

function puntajePalabra(q: string, campo: string[]): number {
  let mejor = 0;
  for (const p of campo) {
    if (p === q) return 1;
    if (q.length >= 3 && p.startsWith(q)) mejor = Math.max(mejor, 0.85);
    else if (q.length >= 4) {
      const tope = q.length >= 9 ? 2 : 1;
      if (distancia(q, p, tope) <= tope) mejor = Math.max(mejor, 0.6);
    }
  }
  return mejor;
}

/**
 * Temas que responden la consulta, del más al menos parecido. Tolera tildes,
 * plurales y errores de tipeo ("stok", "contrasena"). Una consulta vacía
 * devuelve todos, en su orden.
 */
export function buscarAyuda(temas: TemaAyuda[], consulta: string): TemaAyuda[] {
  const todas = normalizarAyuda(consulta).split(" ").filter(Boolean);
  const palabras = todas.filter((p) => !VACIAS.has(p)).map(raiz);
  if (!palabras.length) return todas.length ? [] : temas.slice();
  const resultados: { tema: TemaAyuda; puntaje: number; orden: number }[] = [];
  indexar(temas).forEach(({ tema, campos }, orden) => {
    let puntaje = 0;
    let encontradas = 0;
    for (const q of palabras) {
      let mejor = 0;
      for (const c of campos) mejor = Math.max(mejor, puntajePalabra(q, c.palabras) * c.peso);
      if (mejor > 0) encontradas++;
      puntaje += mejor;
    }
    // Deben aparecer al menos la mitad de las palabras (redondeando hacia arriba).
    if (encontradas >= Math.ceil(palabras.length / 2) && puntaje > 0) {
      resultados.push({ tema, puntaje: puntaje * (encontradas / palabras.length), orden });
    }
  });
  resultados.sort((a, b) => b.puntaje - a.puntaje || a.orden - b.orden);
  // Fuera lo que queda muy lejos de la mejor respuesta (ruido de palabras comunes como "cambiar").
  const corte = (resultados[0]?.puntaje ?? 0) * 0.4;
  return resultados.filter((r) => r.puntaje >= corte).map((r) => r.tema);
}
