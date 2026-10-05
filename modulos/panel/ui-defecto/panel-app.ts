/**
 * Lógica de la pantalla del panel (PanelAdmin.astro). Sin dependencias.
 * REGLA: lo que llega del servidor se escribe SIEMPRE con textContent o
 * atributos; nunca con innerHTML.
 */
import { derivarClave, enviar, obtener, reducirFoto, subirFotoProducto } from "../cliente";
import { formatearPrecio } from "../../carrito/formato";
import { ayudaVendidos, textoStock } from "../texto-stock";
import {
  diaCorto,
  dibujarAdaptable,
  graficoComparacion,
  graficoPartes,
  graficoTiempo,
  guardarPreferencia,
  NOMBRES_MES,
  preferencia,
  textoVariacion,
  variacion,
  ventasDelAnio,
  type RangoPanel,
  type ResumenPanel,
  type TipoPartes,
  type TipoTiempo,
} from "./resumen-vista";

type Vista = "cargando" | "no-disponible" | "instalar" | "entrar" | "codigo" | "resumen" | "productos" | "pedidos" | "suscriptores" | "seguridad";
const PESTANAS: Vista[] = ["resumen", "productos", "pedidos", "suscriptores", "seguridad"];
const API = "/api/admin";

interface Producto {
  id: string;
  nombre: string;
  precio: number;
  categoria: string;
  tipo: "fisico" | "digital";
  descripcion?: string;
  destacado?: boolean;
  imagen?: string;
  disponible: number | null;
  vendidos: number | null;
}
interface Pedido {
  orden: string;
  creado: string;
  estado: string;
  monto: number;
  email: string;
  comprador?: Record<string, unknown>;
  lineas?: { nombre: string; cantidad: number; subtotal: number }[];
  requiereDespacho?: boolean;
  tieneDigitales?: boolean;
  enviado: string | null;
}

const raiz = document.querySelector<HTMLElement>("[data-panel]")!;
const $ = <T extends Element = HTMLElement>(sel: string, dentro: ParentNode = raiz) => dentro.querySelector<T>(sel)!;
const $$ = <T extends Element = HTMLElement>(sel: string, dentro: ParentNode = raiz) => [...dentro.querySelectorAll<T>(sel)];

// Colores del sitio (CSSOM: permitido por la CSP, a diferencia de style="…").
for (const [dato, variable] of [["acento", "--pa-acento"], ["acentoOscuro", "--pa-acento-oscuro"], ["fondo", "--pa-fondo"], ["tinta", "--pa-tinta"]] as const) {
  const v = raiz.dataset[dato];
  if (v && /^#[0-9a-fA-F]{3,8}$/.test(v)) raiz.style.setProperty(variable, v);
}

function crear<K extends keyof HTMLElementTagNameMap>(tag: K, clase?: string, texto?: string): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (clase) el.className = clase;
  if (texto !== undefined) el.textContent = texto;
  return el;
}

let temporizadorToast: number | undefined;
function avisar(texto: string) {
  const t = $("[data-toast]");
  t.textContent = texto;
  t.hidden = false;
  clearTimeout(temporizadorToast);
  temporizadorToast = window.setTimeout(() => (t.hidden = true), 3500);
}

let vistaActual: Vista = "cargando";
function mostrar(vista: Vista) {
  vistaActual = vista;
  $("[data-toast]").hidden = true;
  for (const s of $$("[data-vista]")) s.hidden = s.dataset.vista !== vista;
  const conSesion = PESTANAS.includes(vista);
  for (const el of $$("[data-solo-sesion]")) el.hidden = !conSesion;
  for (const b of $$<HTMLButtonElement>("[data-tab]")) {
    if (b.dataset.tab === vista) b.setAttribute("aria-current", "page");
    else b.removeAttribute("aria-current");
  }
  const primero = $(`[data-vista="${vista}"] input, [data-vista="${vista}"] h1`);
  if (primero && !conSesion) (primero as HTMLElement).focus?.();
}

function errorDe(form: HTMLElement, texto = "") {
  const e = form.querySelector<HTMLElement>("[data-error]");
  if (e) e.textContent = texto;
}

async function conBoton<T>(form: HTMLFormElement, tarea: () => Promise<T>): Promise<T | undefined> {
  const botones = $$<HTMLButtonElement>("button[type=submit]", form);
  botones.forEach((b) => (b.disabled = true));
  try {
    return await tarea();
  } finally {
    botones.forEach((b) => (b.disabled = false));
  }
}

/** Cualquier 401 en plena sesión = la sesión se cerró (inactividad u otra). */
function siSeCerro(status: number): boolean {
  if (status === 401 && PESTANAS.includes(vistaActual)) {
    cerrarLocal("Tu sesión se cerró. Vuelve a entrar.");
    return true;
  }
  return false;
}

// ─────────────────────────── acceso ───────────────────────────

async function iniciar() {
  const par = await obtener<{ configurado: boolean; listoParaConfigurar: boolean }>(`${API}/parametros`);
  if (!par.ok) {
    $("[data-no-disponible-texto]").textContent = par.datos.message || "Falta configuración en el servidor.";
    return mostrar("no-disponible");
  }
  if (!par.datos.configurado) {
    if (!par.datos.listoParaConfigurar) {
      $("[data-no-disponible-texto]").textContent =
        "Falta configurar ADMIN_PEPPER y ADMIN_SETUP_TOKEN en Cloudflare. Pídele a quien mantiene el sitio que lo haga.";
      return mostrar("no-disponible");
    }
    return mostrar("instalar");
  }
  const s = await obtener<{ autenticado: boolean; inactividadSegundos: number }>(`${API}/sesion`);
  if (s.ok && s.datos.autenticado) return entrarAlPanel(s.datos.inactividadSegundos);
  mostrar("entrar");
}

$<HTMLFormElement>('[data-form="instalar"]').addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = e.currentTarget as HTMLFormElement;
  const d = new FormData(f);
  const usuario = String(d.get("usuario") || "").trim();
  const clave = String(d.get("clave") || "");
  errorDe(f);
  if (!/^[a-zA-Z0-9._-]{3,40}$/.test(usuario)) return errorDe(f, "El usuario: 3 a 40 letras, números, punto o guion, sin espacios.");
  if (clave.length < 10) return errorDe(f, "La contraseña debe tener al menos 10 caracteres.");
  if (clave !== d.get("repetir")) return errorDe(f, "Las contraseñas no coinciden.");
  await conBoton(f, async () => {
    const r = await enviar(`${API}/instalar`, { usuario, derivado: await derivarClave(clave, usuario), claveInstalacion: d.get("claveInstalacion") });
    if (!r.ok) return errorDe(f, r.datos.message || "No se pudo crear el usuario.");
    ($('[data-form="entrar"] input[name="usuario"]') as HTMLInputElement).value = usuario;
    mostrar("entrar");
    const aviso = $("[data-aviso-entrar]");
    aviso.textContent = "Usuario creado. Ahora entra con tu contraseña.";
    aviso.hidden = false;
  });
});

$<HTMLFormElement>('[data-form="entrar"]').addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = e.currentTarget as HTMLFormElement;
  const d = new FormData(f);
  const usuario = String(d.get("usuario") || "").trim();
  const clave = String(d.get("clave") || "");
  errorDe(f);
  if (!usuario || !clave) return errorDe(f, "Escribe tu usuario y tu contraseña.");
  await conBoton(f, async () => {
    const r = await enviar<{ segundoFactor?: boolean }>(`${API}/entrar`, { usuario, derivado: await derivarClave(clave, usuario) });
    if (!r.ok) return errorDe(f, r.datos.message || "No se pudo entrar.");
    f.reset();
    $("[data-aviso-entrar]").hidden = true;
    if (r.datos.segundoFactor) return mostrar("codigo");
    await iniciar();
  });
});

$<HTMLFormElement>('[data-form="codigo"]').addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = e.currentTarget as HTMLFormElement;
  errorDe(f);
  const codigo = String(new FormData(f).get("codigo") || "").trim();
  await conBoton(f, async () => {
    const r = await enviar<{ fueRespaldo: boolean; respaldosRestantes: number }>(`${API}/segundo-factor`, { codigo });
    if (r.status === 440) {
      mostrar("entrar");
      return avisar(r.datos.message || "Se venció el tiempo. Vuelve a entrar.");
    }
    if (!r.ok) return errorDe(f, r.datos.message || "Código incorrecto.");
    f.reset();
    if (r.datos.fueRespaldo) avisar(`Usaste un código de respaldo. Te quedan ${r.datos.respaldosRestantes}.`);
    await iniciar();
  });
});
$("[data-volver-entrar]").addEventListener("click", () => mostrar("entrar"));

function cerrarLocal(mensaje?: string) {
  detenerInactividad();
  const aviso = $("[data-aviso-entrar]");
  aviso.textContent = mensaje ?? "";
  aviso.hidden = !mensaje;
  ($("[data-editor]") as HTMLDialogElement).close();
  mostrar("entrar");
}

$("[data-salir]").addEventListener("click", async () => {
  await enviar(`${API}/salir`, {});
  cerrarLocal("Cerraste sesión.");
});

for (const b of $$<HTMLButtonElement>("[data-tab]")) {
  b.addEventListener("click", () => abrirPestana(b.dataset.tab as Vista));
}

async function abrirPestana(v: Vista) {
  mostrar(v);
  if (v === "resumen") await cargarResumen();
  if (v === "productos") await cargarProductos();
  if (v === "pedidos") await cargarPedidos();
  if (v === "suscriptores") await cargarSuscriptores();
  if (v === "seguridad") await cargarSeguridad();
}

async function entrarAlPanel(segundos: number) {
  iniciarInactividad(segundos);
  await abrirPestana("resumen");
}

// ─────────────────────────── inactividad ───────────────────────────
// El servidor cierra la sesión por su cuenta; esto avisa antes y evita
// que alguien encuentre el panel abierto en un computador desatendido.

let plazo = 30 * 60;
let ultimaActividad = Date.now();
let ultimoAviso = 0;
let reloj: number | undefined;
const avisoInactividad = () => $("[data-aviso-inactividad]") as HTMLDialogElement;

function huboActividad() {
  ultimaActividad = Date.now();
}
for (const ev of ["pointerdown", "keydown", "wheel", "touchstart"]) window.addEventListener(ev, huboActividad, { passive: true });

function iniciarInactividad(segundos: number) {
  plazo = segundos || plazo;
  ultimaActividad = Date.now();
  clearInterval(reloj);
  reloj = window.setInterval(async () => {
    const ahora = Date.now();
    const restante = ultimaActividad + plazo * 1000 - ahora;
    if (restante <= 0) {
      avisoInactividad().close();
      await enviar(`${API}/salir`, {});
      return cerrarLocal("Cerramos tu sesión por inactividad.");
    }
    if (restante <= 60_000 && !avisoInactividad().open) avisoInactividad().showModal();
    // Con actividad reciente, se avisa al servidor (como mucho una vez por minuto).
    if (ahora - ultimaActividad < 60_000 && ahora - ultimoAviso > 60_000) {
      ultimoAviso = ahora;
      const r = await enviar(`${API}/actividad`, {});
      siSeCerro(r.status);
    }
  }, 10_000);
}
function detenerInactividad() {
  clearInterval(reloj);
  if (avisoInactividad().open) avisoInactividad().close();
}
$("[data-seguir]").addEventListener("click", async () => {
  huboActividad();
  ultimoAviso = Date.now();
  avisoInactividad().close();
  const r = await enviar(`${API}/actividad`, {});
  siSeCerro(r.status);
});

// ─────────────────────────── productos ───────────────────────────

let productos: Producto[] = [];
let categorias: { id: string; nombre: string }[] = [];

async function cargarProductos() {
  const r = await obtener<{ productos: Producto[]; categorias: { id: string; nombre: string }[] }>(`${API}/productos`);
  if (siSeCerro(r.status)) return;
  if (!r.ok) return avisar(r.datos.message || "No se pudieron cargar los productos.");
  productos = r.datos.productos;
  categorias = r.datos.categorias;
  const filtro = $<HTMLSelectElement>("[data-filtro-categoria]");
  const elegida = filtro.value;
  filtro.replaceChildren(new Option("Todas", ""), ...categorias.map((c) => new Option(c.nombre, c.id)));
  filtro.value = elegida;
  $<HTMLSelectElement>("[data-editor-categorias]").replaceChildren(...categorias.map((c) => new Option(c.nombre, c.id)));
  pintarProductos();
}

function pintarProductos() {
  const texto = $<HTMLInputElement>("[data-buscar-producto]").value.trim().toLowerCase();
  const cat = $<HTMLSelectElement>("[data-filtro-categoria]").value;
  const visibles = productos.filter((p) => (!cat || p.categoria === cat) && (!texto || p.nombre.toLowerCase().includes(texto)));
  const destacados = productos.filter((p) => p.destacado).length;
  const maximo = Number(raiz.dataset.maxDestacados || "0");
  $("[data-resumen-productos]").textContent =
    `${visibles.length} de ${productos.length} productos · ${destacados} destacados` +
    (maximo && destacados > maximo ? ` (en el inicio se ven los ${maximo} más recientes)` : "");
  const nombreCat = new Map(categorias.map((c) => [c.id, c.nombre]));
  $("[data-lista-productos]").replaceChildren(
    ...visibles.map((p) => {
      const li = crear("li", "pa-fila");
      const img = crear("img");
      img.src = p.imagen || "";
      img.alt = "";
      img.width = 64;
      img.height = 64;
      img.loading = "lazy";
      const info = crear("div");
      const nombre = crear("div", "pa-fila__nombre", p.nombre);
      const datos = crear("div", "pa-fila__datos");
      const stock = textoStock(p.disponible, p.vendidos);
      datos.append(
        crear("span", "", formatearPrecio(p.precio)),
        crear("span", "", nombreCat.get(p.categoria) ?? p.categoria),
        crear("span", stock.agotado ? "pa-etiqueta pa-etiqueta--alerta" : "pa-etiqueta", stock.disponible)
      );
      if (stock.vendidos) {
        const v = crear("span", "pa-etiqueta pa-etiqueta--suave", stock.vendidos);
        v.title = "Desde el último ajuste de stock";
        datos.append(v);
      }
      if (p.tipo === "digital") datos.append(crear("span", "pa-etiqueta pa-etiqueta--acento", "Digital"));
      if (p.destacado) datos.append(crear("span", "pa-etiqueta pa-etiqueta--ok", "Destacado"));
      if (!p.imagen) datos.append(crear("span", "pa-etiqueta pa-etiqueta--alerta", "Sin foto"));
      info.append(nombre, datos);
      const botones = crear("div", "pa-fila__botones");
      const editar = crear("button", "pa-boton pa-boton--chico", "Editar");
      editar.type = "button";
      editar.addEventListener("click", () => abrirEditor(p));
      const ver = crear("a", "pa-boton pa-boton--suave pa-boton--chico", "Ver");
      ver.href = `/producto/${encodeURIComponent(p.id)}/`;
      ver.target = "_blank";
      ver.rel = "noopener";
      const borrar = crear("button", "pa-boton pa-boton--suave pa-boton--chico", "Eliminar");
      borrar.type = "button";
      borrar.addEventListener("click", () => eliminarProducto(p));
      botones.append(editar, ver, borrar);
      li.append(img, info, botones);
      return li;
    })
  );
}
$("[data-buscar-producto]").addEventListener("input", pintarProductos);
$("[data-filtro-categoria]").addEventListener("change", pintarProductos);

async function eliminarProducto(p: Producto) {
  if (!confirm(`¿Eliminar "${p.nombre}"? Dejará de verse en la tienda.`)) return;
  const r = await enviar(`${API}/productos`, { accion: "eliminar", id: p.id });
  if (siSeCerro(r.status)) return;
  if (!r.ok) return avisar(r.datos.message || "No se pudo eliminar.");
  avisar("Producto eliminado. La tienda se actualiza en unos segundos.");
  await cargarProductos();
}

const editor = () => $("[data-editor]") as HTMLDialogElement;
const formProducto = () => $<HTMLFormElement>('[data-form="producto"]');
let editando: Producto | null = null;
let fotoPendiente: File | null = null;
let urlVistaPrevia = "";

function abrirEditor(p: Producto | null) {
  editando = p;
  fotoPendiente = null;
  const f = formProducto();
  f.reset();
  errorDe(f);
  $$("[data-error-campo]", f).forEach((e) => (e.textContent = ""));
  $$("[aria-invalid]", f).forEach((e) => e.removeAttribute("aria-invalid"));
  $("[data-error-foto]").textContent = "";
  $("[data-editor-titulo]").textContent = p ? "Editar producto" : "Nuevo producto";
  const campo = (n: string) => f.elements.namedItem(n) as HTMLInputElement;
  campo("nombre").value = p?.nombre ?? "";
  campo("precio").value = p ? String(p.precio) : "";
  campo("disponible").value = p?.disponible === null || !p ? "" : String(p.disponible);
  $("[data-editor-vendidos]").textContent = p ? ayudaVendidos(p.disponible, p.vendidos) : "";
  (f.elements.namedItem("categoria") as HTMLSelectElement).value = p?.categoria ?? categorias[0]?.id ?? "";
  for (const r of $$<HTMLInputElement>('input[name="tipo"]', f)) r.checked = r.value === (p?.tipo ?? "fisico");
  (f.elements.namedItem("descripcion") as HTMLTextAreaElement).value = p?.descripcion ?? "";
  campo("destacado").checked = Boolean(p?.destacado);
  const img = $<HTMLImageElement>("[data-editor-foto]");
  if (urlVistaPrevia) URL.revokeObjectURL(urlVistaPrevia);
  urlVistaPrevia = "";
  img.src = p?.imagen || "";
  img.alt = p ? `Foto de ${p.nombre}` : "";
  editor().showModal();
  campo("nombre").focus();
}
$("[data-nuevo-producto]").addEventListener("click", () => abrirEditor(null));
$("[data-cerrar-editor]").addEventListener("click", () => editor().close());

$<HTMLInputElement>("[data-editor-archivo]").addEventListener("change", async (e) => {
  const input = e.currentTarget as HTMLInputElement;
  const archivo = input.files?.[0];
  input.value = "";
  const error = $("[data-error-foto]");
  error.textContent = "";
  if (!archivo) return;
  try {
    error.textContent = "Preparando la foto…";
    fotoPendiente = await reducirFoto(archivo);
    error.textContent = "";
    if (urlVistaPrevia) URL.revokeObjectURL(urlVistaPrevia);
    urlVistaPrevia = URL.createObjectURL(fotoPendiente);
    $<HTMLImageElement>("[data-editor-foto]").src = urlVistaPrevia;
  } catch (err) {
    fotoPendiente = null;
    error.textContent = err instanceof Error ? err.message : "No pudimos usar esa foto.";
  }
});

formProducto().addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = e.currentTarget as HTMLFormElement;
  const d = new FormData(f);
  errorDe(f);
  $$("[data-error-campo]", f).forEach((x) => (x.textContent = ""));
  $$("[aria-invalid]", f).forEach((x) => x.removeAttribute("aria-invalid"));
  const producto = {
    id: editando?.id,
    nombre: String(d.get("nombre") || ""),
    precio: String(d.get("precio") || "").replace(/[.\s$]/g, ""),
    disponible: String(d.get("disponible") || "").trim(),
    categoria: String(d.get("categoria") || ""),
    tipo: String(d.get("tipo") || ""),
    descripcion: String(d.get("descripcion") || ""),
    destacado: d.get("destacado") === "on",
  };
  await conBoton(f, async () => {
    const r = await enviar<{ producto: Producto; errores?: Record<string, string> }>(`${API}/productos`, {
      accion: "guardar",
      producto: { ...producto, precio: Number(producto.precio), disponible: producto.disponible === "" ? null : Number(producto.disponible) },
    });
    if (siSeCerro(r.status)) return;
    if (!r.ok) {
      for (const [campo, texto] of Object.entries(r.datos.errores ?? {})) {
        const lugar = f.querySelector<HTMLElement>(`[data-error-campo="${campo}"]`);
        if (lugar) lugar.textContent = texto;
        f.querySelector(`[name="${campo}"]`)?.setAttribute("aria-invalid", "true");
      }
      return errorDe(f, r.datos.message || "No se pudo guardar.");
    }
    if (fotoPendiente) {
      const subida = await subirFotoProducto(r.datos.producto.id, fotoPendiente);
      if (!subida.ok) {
        await cargarProductos();
        $("[data-error-foto]").textContent = subida.datos.message || "El producto se guardó, pero la foto no.";
        editando = productos.find((p) => p.id === r.datos.producto.id) ?? null;
        return;
      }
    }
    editor().close();
    avisar("Guardado. La tienda se actualiza en unos segundos.");
    await cargarProductos();
  });
});

// ─────────────────────────── pedidos ───────────────────────────

const ESTADOS: Record<string, [string, string]> = {
  pagada: ["Pagado", "pa-etiqueta pa-etiqueta--ok"],
  "en-revision": ["Revisar pago", "pa-etiqueta pa-etiqueta--alerta"],
  pendiente: ["Pendiente", "pa-etiqueta"],
  rechazada: ["Rechazado", "pa-etiqueta"],
  anulada: ["Anulado", "pa-etiqueta"],
};

async function cargarPedidos() {
  const todos = $<HTMLInputElement>("[data-pedidos-todos]").checked;
  const r = await obtener<{ pedidos: Pedido[] }>(`${API}/pedidos${todos ? "?todos=1" : ""}`);
  if (siSeCerro(r.status)) return;
  if (!r.ok) return avisar(r.datos.message || "No se pudieron cargar los pedidos.");
  const lista = r.datos.pedidos;
  const porEnviar = lista.filter((p) => p.estado === "pagada" && !p.enviado && p.requiereDespacho).length;
  $("[data-resumen-pedidos]").textContent = lista.length
    ? `${lista.length} pedidos · ${porEnviar} por despachar`
    : "Todavía no hay pedidos pagados.";
  const fecha = (iso: string) => new Date(iso).toLocaleString("es-CL", { dateStyle: "medium", timeStyle: "short" });
  $("[data-lista-pedidos]").replaceChildren(
    ...lista.map((p) => {
      const li = crear("li", "pa-pedido");
      const cabeza = crear("div", "pa-pedido__cabeza");
      const [txt, clase] = ESTADOS[p.estado] ?? [p.estado, "pa-etiqueta"];
      const izquierda = crear("div");
      izquierda.append(crear("strong", "", fecha(p.creado)), document.createTextNode(" "), crear("span", clase, txt));
      if (p.enviado) izquierda.append(document.createTextNode(" "), crear("span", "pa-etiqueta pa-etiqueta--ok", "Enviado"));
      cabeza.append(izquierda, crear("span", "pa-pedido__total", formatearPrecio(p.monto)));
      li.append(cabeza);
      const c = p.comprador ?? {};
      const dato = (t: string) => li.append(crear("p", "pa-pedido__dato", t));
      dato(`${String(c.nombre ?? "")} · ${p.email}${c.telefono ? " · " + String(c.telefono) : ""}`);
      if (p.requiereDespacho) dato(`Despacho: ${String(c.direccion ?? "")}, ${String(c.comuna ?? "")}, ${String(c.region ?? "")}`);
      if (c.notas) dato(`Notas: ${String(c.notas)}`);
      if (p.lineas?.length) {
        const ul = crear("ul");
        for (const l of p.lineas) ul.append(crear("li", "", `${l.nombre} × ${l.cantidad} — ${formatearPrecio(l.subtotal)}`));
        li.append(ul);
      }
      if (p.tieneDigitales) dato("Incluye cursos o patrones: envía el material al correo del comprador.");
      dato(`Pedido ${p.orden}`);
      if (p.estado === "pagada") {
        const b = crear("button", p.enviado ? "pa-boton pa-boton--suave pa-boton--chico" : "pa-boton pa-boton--chico", p.enviado ? "Desmarcar enviado" : "Marcar como enviado");
        b.type = "button";
        b.addEventListener("click", async () => {
          b.disabled = true;
          const r2 = await enviar(`${API}/pedidos`, { accion: "marcar-enviado", orden: p.orden, enviado: !p.enviado });
          if (siSeCerro(r2.status)) return;
          if (!r2.ok) {
            b.disabled = false;
            return avisar(r2.datos.message || "No se pudo actualizar.");
          }
          await cargarPedidos();
        });
        li.append(b);
      }
      return li;
    })
  );
}
$("[data-pedidos-todos]").addEventListener("change", cargarPedidos);

// ─────────────────────────── resumen (métricas) ───────────────────────────

const pedidosTxt = (n: number) => `${n} ${n === 1 ? "pedido" : "pedidos"}`;
const NOMBRE_MEDIO: Record<string, string> = { flow: "Flow", mercadopago: "Mercado Pago" };

// Tipo de gráfico elegido en cada panel (se recuerda en este navegador).
const tipos = {
  tiempo: preferencia<TipoTiempo>("tiempo", ["barras", "linea"], "barras"),
  anios: preferencia<TipoTiempo>("anios", ["barras", "linea"], "barras"),
  productos: preferencia<TipoPartes>("productos", ["lista", "barras", "torta"], "lista"),
  medios: preferencia<TipoPartes>("medios", ["lista", "barras", "torta"], "torta"),
};
type ClaveTipo = keyof typeof tipos;
function marcarTipos() {
  for (const grupo of $$("[data-tipo-grafico]")) {
    const clave = grupo.dataset.tipoGrafico as ClaveTipo;
    for (const b of $$<HTMLButtonElement>("button", grupo)) b.setAttribute("aria-pressed", String(b.dataset.tipo === tipos[clave]));
  }
}
for (const grupo of $$("[data-tipo-grafico]")) {
  for (const b of $$<HTMLButtonElement>("button", grupo)) {
    b.addEventListener("click", () => {
      const clave = grupo.dataset.tipoGrafico as ClaveTipo;
      (tipos as Record<string, string>)[clave] = b.dataset.tipo!;
      guardarPreferencia(clave, b.dataset.tipo!);
      marcarTipos();
      if (clave === "anios") dibujarComparacionActual();
      else if (rangoActual) mostrarRango(rangoActual);
    });
  }
}
marcarTipos();

async function cargarResumen() {
  const r = await obtener<ResumenPanel>(`${API}/resumen`);
  if (siSeCerro(r.status)) return;
  if (!r.ok) return avisar(r.datos.message || "No se pudo cargar el resumen.");
  const d = r.datos;
  const kpi = (k: string, valor: string) => ($(`[data-kpi="${k}"]`).textContent = valor);
  const nota = (k: string) => $(`[data-kpi-nota="${k}"]`);
  kpi("hoy", formatearPrecio(d.periodos.hoy.ventas));
  nota("hoy").textContent = pedidosTxt(d.periodos.hoy.pedidos);
  kpi("d7", formatearPrecio(d.periodos.d7.ventas));
  nota("d7").textContent = `${pedidosTxt(d.periodos.d7.pedidos)} · ${textoVariacion(d.variacion7)}`;
  kpi("d30", formatearPrecio(d.periodos.d30.ventas));
  nota("d30").textContent = pedidosTxt(d.periodos.d30.pedidos);
  kpi("ticket", d.periodos.d30.pedidos ? formatearPrecio(d.periodos.d30.ticket) : "—");

  const aviso = $("[data-resumen-despacho]");
  aviso.hidden = !d.porDespachar;
  $("[data-resumen-despacho-texto]").textContent =
    d.porDespachar === 1 ? "Tienes 1 pedido por despachar." : `Tienes ${d.porDespachar} pedidos por despachar.`;

  hoyNegocio = d.hoy;
  mostrarAnual(d.anual);
  const f = formPeriodo();
  if (!f.desde.value) aplicarAtajo("30");
  else await cargarRango();
}

// ─── explorar ventas: rango de fechas ───

let hoyNegocio = "";
let rangoActual: RangoPanel | null = null;
const formPeriodo = () =>
  $<HTMLFormElement>("[data-form-periodo]") as HTMLFormElement & { desde: HTMLInputElement; hasta: HTMLInputElement; agrupar: HTMLSelectElement };

/** Suma días a "AAAA-MM-DD" (negativo para restar). */
function moverDia(dia: string, n: number): string {
  const [a, m, d] = dia.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d) + n * 86400000).toISOString().slice(0, 10);
}
function aplicarAtajo(atajo: string) {
  const hoy = hoyNegocio || new Date().toISOString().slice(0, 10);
  const [a, m] = hoy.split("-").map(Number);
  const mm = (x: number) => String(x).padStart(2, "0");
  let desde = hoy, hasta = hoy, agrupar = "dia";
  if (atajo === "7") desde = moverDia(hoy, -6);
  if (atajo === "30") desde = moverDia(hoy, -29);
  if (atajo === "este-mes") desde = `${a}-${mm(m)}-01`;
  if (atajo === "mes-pasado") {
    const am = m === 1 ? a - 1 : a, mp = m === 1 ? 12 : m - 1;
    desde = `${am}-${mm(mp)}-01`;
    hasta = moverDia(`${a}-${mm(m)}-01`, -1);
  }
  if (atajo === "este-anio") { desde = `${a}-01-01`; agrupar = "mes"; }
  if (atajo === "anio-pasado") { desde = `${a - 1}-01-01`; hasta = `${a - 1}-12-31`; agrupar = "mes"; }
  const f = formPeriodo();
  f.desde.value = desde;
  f.hasta.value = hasta;
  f.agrupar.value = agrupar;
  for (const b of $$<HTMLButtonElement>("[data-atajo]")) b.setAttribute("aria-pressed", String(b.dataset.atajo === atajo));
  void cargarRango();
}
for (const b of $$<HTMLButtonElement>("[data-atajo]")) b.addEventListener("click", () => aplicarAtajo(b.dataset.atajo!));
formPeriodo().addEventListener("submit", (e) => {
  e.preventDefault();
  for (const b of $$<HTMLButtonElement>("[data-atajo]")) b.setAttribute("aria-pressed", "false");
  void cargarRango();
});

async function cargarRango() {
  const f = formPeriodo();
  const error = $("[data-error-periodo]");
  error.textContent = "";
  if (!f.desde.value || !f.hasta.value) return (error.textContent = "Elige las dos fechas.");
  if (f.desde.value > f.hasta.value) return (error.textContent = "La fecha de inicio es posterior a la de término.");
  const q = new URLSearchParams({ desde: f.desde.value, hasta: f.hasta.value, agrupar: f.agrupar.value });
  const r = await obtener<RangoPanel>(`${API}/resumen?${q}`);
  if (siSeCerro(r.status)) return;
  if (!r.ok) return (error.textContent = r.datos.message || "No se pudo cargar ese período.");
  mostrarRango(r.datos);
}

const fechaLarga = (dia: string) => `${diaCorto(dia)} ${dia.slice(0, 4)}`;

function mostrarRango(d: RangoPanel) {
  rangoActual = d;
  const kpi = (k: string, valor: string) => ($(`[data-kpi="${k}"]`).textContent = valor);
  const nota = (k: string) => $(`[data-kpi-nota="${k}"]`);
  const aprox = $("[data-periodo-aproximado]");
  aprox.hidden = d.exacto;
  aprox.textContent = d.exacto
    ? ""
    : `Para fechas de hace más de 13 meses se cuenta por mes completo: se muestra del ${fechaLarga(d.desde)} al ${fechaLarga(d.hasta)}.`;
  kpi("rango", formatearPrecio(d.periodo.ventas));
  nota("rango").textContent = `${fechaLarga(d.desde)} – ${fechaLarga(d.hasta)} · ${d.dias} ${d.dias === 1 ? "día" : "días"}`;
  kpi("rango-pedidos", String(d.periodo.pedidos));
  nota("rango-pedidos").textContent = d.anterior ? `${d.anterior.periodo.pedidos} en el período anterior` : "";
  kpi("rango-ticket", d.periodo.pedidos ? formatearPrecio(d.periodo.ticket) : "—");
  kpi("rango-anterior", d.anterior ? formatearPrecio(d.anterior.periodo.ventas) : "—");
  nota("rango-anterior").textContent = d.anterior
    ? `${fechaLarga(d.anterior.desde)} – ${fechaLarga(d.anterior.hasta)} · ${textoVariacion(d.variacion, "ese período").replace(" vs. ese período", "")}`
    : "No hay datos suficientes para comparar.";

  const titulo = { dia: "por día", semana: "por semana", mes: "por mes" }[d.agrupar];
  $("[data-titulo-serie]").textContent = `Ventas ${titulo}`;
  const puntos = d.serie.map((p) => ({
    etiqueta: p.etiqueta,
    detalle: p.desde === p.hasta ? fechaLarga(p.desde) : `${diaCorto(p.desde)} – ${fechaLarga(p.hasta)}`,
    ventas: p.ventas,
    pedidos: p.pedidos,
  }));
  const lienzo = $("[data-grafico-svg]") as unknown as SVGSVGElement;
  dibujarAdaptable("tiempo", () => !lienzo.closest("[hidden]") && graficoTiempo(lienzo, $("[data-grafico-tooltip]"), puntos, tipos.tiempo, formatearPrecio));
  $("[data-tabla-ventas]").replaceChildren(
    ...[...puntos].reverse().map((x) => {
      const tr = crear("tr");
      tr.append(crear("td", "", x.detalle), crear("td", "", String(x.pedidos)), crear("td", "", formatearPrecio(x.ventas)));
      return tr;
    })
  );
  graficoPartes(
    $("[data-top-productos]"),
    d.topProductos.map((p) => ({ nombre: p.nombre, valor: p.ventas, detalle: `${p.unidades} ${p.unidades === 1 ? "unidad" : "unidades"} · ${formatearPrecio(p.ventas)}` })),
    tipos.productos,
    formatearPrecio
  );
  graficoPartes(
    $("[data-medios]"),
    d.medios.map((m) => ({ nombre: NOMBRE_MEDIO[m.proveedor] ?? m.proveedor, valor: m.ventas, detalle: `${pedidosTxt(m.pedidos)} · ${formatearPrecio(m.ventas)}` })),
    tipos.medios,
    formatearPrecio
  );
}

// ─── comparación por años: se puede elegir qué dos años comparar ───

let anualActual: ResumenPanel["anual"] | null = null;
function mostrarAnual(a: ResumenPanel["anual"]) {
  anualActual = a;
  $("[data-kpi-anio-titulo]").textContent = `${a.anio} a la fecha`;
  $('[data-kpi="anio"]').textContent = formatearPrecio(a.aFecha.ventas);
  $('[data-kpi-nota="anio"]').textContent = `${pedidosTxt(a.aFecha.pedidos)} · ${textoVariacion(a.variacionAnual, `mismo período ${a.anio - 1}`)}`;
  $('[data-kpi="anio-anterior"]').textContent = formatearPrecio(a.aFechaAnterior.ventas);
  $("[data-kpi-anio-anterior-titulo]").textContent = `${a.anio - 1} a la misma fecha`;
  $('[data-kpi-nota="anio-anterior"]').textContent = pedidosTxt(a.aFechaAnterior.pedidos);

  const anios = [...new Set([a.anio, a.anio - 1, ...a.anios.map((x) => x.anio)])].sort((x, y) => y - x);
  const selA = $<HTMLSelectElement>("[data-anio-a]");
  const selB = $<HTMLSelectElement>("[data-anio-b]");
  const previoA = Number(selA.value) || a.anio;
  const previoB = Number(selB.value) || a.anio - 1;
  for (const [sel, valor] of [[selA, previoA], [selB, previoB]] as [HTMLSelectElement, number][]) {
    sel.replaceChildren(...anios.map((x) => {
      const o = crear("option", "", String(x));
      o.value = String(x);
      return o;
    }));
    sel.value = String(anios.includes(valor) ? valor : anios[0]);
  }
  dibujarComparacionActual();

  graficoPartes(
    $("[data-historial-anios]"),
    a.anios.map((x) => ({ nombre: String(x.anio), valor: x.ventas, detalle: `${formatearPrecio(x.ventas)} · ${pedidosTxt(x.pedidos)} · promedio ${formatearPrecio(x.ticket)}` })),
    "lista",
    formatearPrecio,
    "Todavía no hay ventas registradas."
  );
}

function dibujarComparacionActual() {
  if (!anualActual) return;
  const anioA = Number($<HTMLSelectElement>("[data-anio-a]").value);
  const anioB = Number($<HTMLSelectElement>("[data-anio-b]").value);
  const a = ventasDelAnio(anualActual.meses, anioA);
  const b = ventasDelAnio(anualActual.meses, anioB);
  $("[data-leyenda-a]").textContent = String(anioA);
  $("[data-leyenda-b]").textContent = String(anioB);
  const lienzo = $("[data-comparacion-svg]") as unknown as SVGSVGElement;
  const enCurso = { anio: anualActual.anio, mes: Number(anualActual.hoy.slice(5, 7)) };
  dibujarAdaptable("anios", () => !lienzo.closest("[hidden]") && graficoComparacion(lienzo, $("[data-comparacion-tooltip]"), anioA, a, anioB, b, tipos.anios, formatearPrecio, enCurso));
  $("[data-th-a]").textContent = String(anioA);
  $("[data-th-b]").textContent = String(anioB);
  $("[data-tabla-comparacion]").replaceChildren(
    ...NOMBRES_MES.map((m, i) => {
      const curso = i === enCurso.mes - 1 && (anioA === enCurso.anio || anioB === enCurso.anio);
      const v = curso ? null : variacion(a[i].ventas, b[i].ventas);
      const tr = crear("tr");
      tr.append(crear("td", "", curso ? `${m} (en curso)` : m), crear("td", "", formatearPrecio(a[i].ventas)), crear("td", "", formatearPrecio(b[i].ventas)), crear("td", "", v === null ? "—" : `${v > 0 ? "+" : ""}${v}%`));
      return tr;
    })
  );
}
for (const sel of ["[data-anio-a]", "[data-anio-b]"]) $(sel).addEventListener("change", dibujarComparacionActual);

$("[data-resumen-recargar]").addEventListener("click", cargarResumen);
$("[data-ir-pedidos]").addEventListener("click", () => abrirPestana("pedidos"));

// ─────────────────────────── suscriptores ───────────────────────────

async function cargarSuscriptores() {
  const r = await obtener<{ total: number }>(`${API}/suscriptores`);
  if (siSeCerro(r.status)) return;
  $("[data-total-suscriptores]").textContent = r.ok ? String(r.datos.total) : "—";
}
$("[data-descargar-csv]").addEventListener("click", async () => {
  const res = await fetch(`${API}/suscriptores?formato=csv`, { credentials: "same-origin" });
  if (siSeCerro(res.status)) return;
  if (!res.ok) return avisar("No se pudo descargar la lista.");
  const url = URL.createObjectURL(await res.blob());
  const a = crear("a");
  a.href = url;
  a.download = `suscriptores-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});

// ─────────────────────────── seguridad ───────────────────────────

let usuarioActual = "";
let dobleFactorActivo = false;

async function cargarSeguridad() {
  const r = await obtener<{ activo: boolean; respaldosRestantes: number; usuario: string; inactividadMinutos: number; opcionesInactividad: number[] }>(`${API}/seguridad`);
  if (siSeCerro(r.status)) return;
  if (!r.ok) return avisar(r.datos.message || "No se pudo cargar la seguridad.");
  usuarioActual = r.datos.usuario;
  dobleFactorActivo = r.datos.activo;
  $("[data-estado-2fa]").textContent = r.datos.activo
    ? `Activado. Te quedan ${r.datos.respaldosRestantes} códigos de respaldo.`
    : "Desactivado.";
  $("[data-2fa-apagado]").hidden = r.datos.activo;
  $("[data-2fa-encendido]").hidden = !r.datos.activo;
  $("[data-2fa-propuesta]").hidden = true;
  $("[data-si-2fa]").hidden = !r.datos.activo;
  const sel = $<HTMLSelectElement>("[data-inactividad]");
  sel.replaceChildren(...r.datos.opcionesInactividad.map((m) => new Option(`${m} minutos`, String(m))));
  sel.value = String(r.datos.inactividadMinutos);
}

function mostrarRespaldos(codigos: string[]) {
  $("[data-lista-respaldos]").replaceChildren(...codigos.map((c) => crear("li", "", c)));
  $("[data-respaldos]").hidden = false;
}
$("[data-respaldos-listo]").addEventListener("click", async () => {
  $("[data-respaldos]").hidden = true;
  $("[data-lista-respaldos]").replaceChildren();
  await cargarSeguridad();
});

$("[data-2fa-proponer]").addEventListener("click", async () => {
  const r = await enviar<{ qr: string; secretoLegible: string }>(`${API}/seguridad`, { accion: "proponer" });
  if (siSeCerro(r.status)) return;
  if (!r.ok) return avisar(r.datos.message || "No se pudo iniciar.");
  // El QR (SVG del servidor) se muestra como IMAGEN: un SVG dentro de <img> no ejecuta nada.
  $<HTMLImageElement>("[data-2fa-qr]").src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(r.datos.qr);
  $("[data-2fa-secreto]").textContent = r.datos.secretoLegible;
  $("[data-2fa-propuesta]").hidden = false;
});

function formSeguridad(nombre: string, armar: (d: FormData) => Promise<Record<string, unknown>> | Record<string, unknown>, listo: (datos: Record<string, any>) => void) {
  $<HTMLFormElement>(`[data-form="${nombre}"]`).addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = e.currentTarget as HTMLFormElement;
    errorDe(f);
    await conBoton(f, async () => {
      let cuerpo: Record<string, unknown>;
      try {
        cuerpo = await armar(new FormData(f));
      } catch (err) {
        return errorDe(f, err instanceof Error ? err.message : "Revisa los datos.");
      }
      const r = await enviar(`${API}/seguridad`, cuerpo);
      if (siSeCerro(r.status)) return;
      if (!r.ok) return errorDe(f, r.datos.message || "No se pudo completar.");
      f.reset();
      listo(r.datos);
    });
  });
}

formSeguridad("2fa-activar", (d) => ({ accion: "activar", codigo: String(d.get("codigo") || "").trim() }), (datos) => {
  $("[data-2fa-propuesta]").hidden = true;
  $("[data-2fa-apagado]").hidden = true;
  mostrarRespaldos(datos.respaldos);
  avisar("Doble factor activado.");
});
formSeguridad("2fa-respaldos", (d) => ({ accion: "renovar-respaldos", codigo: String(d.get("codigo") || "").trim() }), (datos) => mostrarRespaldos(datos.respaldos));
formSeguridad(
  "2fa-desactivar",
  async (d) => ({ accion: "desactivar", derivado: await derivarClave(String(d.get("clave") || ""), usuarioActual), codigo: String(d.get("codigo") || "").trim() }),
  async () => {
    avisar("Doble factor desactivado.");
    await cargarSeguridad();
  }
);
formSeguridad(
  "clave",
  async (d) => {
    const nueva = String(d.get("nueva") || "");
    if (nueva.length < 10) throw new Error("La contraseña nueva debe tener al menos 10 caracteres.");
    if (nueva !== d.get("repetir")) throw new Error("Las contraseñas nuevas no coinciden.");
    return {
      accion: "cambiar-clave",
      derivadoActual: await derivarClave(String(d.get("actual") || ""), usuarioActual),
      derivadoNuevo: await derivarClave(nueva, usuarioActual),
      codigo: dobleFactorActivo ? String(d.get("codigo") || "").trim() : "",
    };
  },
  (datos) => avisar(datos.sesionesCerradas ? `Contraseña cambiada. Cerramos ${datos.sesionesCerradas} sesión(es) en otros equipos.` : "Contraseña cambiada.")
);

$<HTMLSelectElement>("[data-inactividad]").addEventListener("change", async (e) => {
  const minutos = Number((e.currentTarget as HTMLSelectElement).value);
  const r = await enviar(`${API}/seguridad`, { accion: "inactividad", minutos });
  if (siSeCerro(r.status)) return;
  if (!r.ok) return avisar(r.datos.message || "No se pudo guardar.");
  iniciarInactividad(minutos * 60);
  avisar(`Listo: la sesión se cerrará tras ${minutos} minutos sin uso.`);
});

iniciar();
