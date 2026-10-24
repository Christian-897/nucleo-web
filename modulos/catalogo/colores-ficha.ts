/**
 * Selector de colores de la ficha (navegador). Las miniaturas las arma el
 * borde (`htmlColores`); aquí solo se conectan. Marcas que usa:
 *
 *   [data-colores-lista]      la <ul> con los botones [data-color]
 *                             data-visibles="24" data-visibles-movil="15"
 *   [data-colores-mas]        botón "Ver los N colores" (se oculta si no hace falta)
 *   [data-color-elegido]      donde va el nombre del color elegido
 *   [data-disponible]         "Disponible" / "¡Quedan 2!" / "Agotado"
 *   [data-galeria-principal]  la foto grande
 *   [data-agregar][data-producto-base]  el botón de compra (cambia de id)
 *   [data-lupa]               abre la foto en pantalla completa (también tocar la foto)
 *   [data-opciones-lista]     (v0.40) la <ul> con los botones [data-opcion] (tamaños, materiales…)
 *   [data-opcion-elegida]     donde va el nombre de la opción elegida
 *   [data-ficha~="precio"]    el precio (cambia con la opción)
 *
 * Todo texto se escribe con textContent. La disponibilidad real la confirma
 * igual el servidor al pagar: esto solo informa.
 */
import { consultarStock, consultarStockColores } from "./cliente";

const MOVIL = "(max-width: 760px)";
const POCO_STOCK = 3;

function textoDisponible(stock: number | null | undefined): { texto: string; estado: "ok" | "poco" | "agotado" } {
  if (stock === 0) return { texto: "Agotado", estado: "agotado" };
  if (typeof stock === "number" && stock <= POCO_STOCK) return { texto: stock === 1 ? "¡Queda 1!" : `¡Quedan ${stock}!`, estado: "poco" };
  return { texto: "Disponible", estado: "ok" };
}

function pintarDisponible(stock: number | null | undefined) {
  const el = document.querySelector<HTMLElement>("[data-disponible]");
  if (!el) return;
  const d = textoDisponible(stock);
  el.textContent = d.texto;
  el.dataset.estado = d.estado;
  el.hidden = false;
}

/** Foto en pantalla completa, con zoom al tocar. */
function iniciarLupa() {
  const principal = document.querySelector<HTMLImageElement>("[data-galeria-principal]");
  const lupa = document.querySelector<HTMLButtonElement>("[data-lupa]");
  if (!principal || !lupa) return;
  let dialogo: HTMLDialogElement | null = null;
  let img: HTMLImageElement;
  const abrir = () => {
    if (!dialogo) {
      dialogo = document.createElement("dialog");
      dialogo.className = "lupa";
      dialogo.setAttribute("aria-label", "Foto en pantalla completa");
      const cerrar = document.createElement("button");
      cerrar.type = "button";
      cerrar.className = "lupa__cerrar";
      cerrar.setAttribute("aria-label", "Cerrar");
      cerrar.textContent = "✕";
      cerrar.addEventListener("click", () => dialogo!.close());
      img = document.createElement("img");
      img.className = "lupa__img";
      img.alt = "";
      img.addEventListener("click", (e) => {
        const r = img.getBoundingClientRect();
        img.style.transformOrigin = `${((e.clientX - r.left) / r.width) * 100}% ${((e.clientY - r.top) / r.height) * 100}%`;
        img.classList.toggle("lupa__img--zoom");
      });
      const ayuda = document.createElement("p");
      ayuda.className = "lupa__ayuda";
      ayuda.textContent = "Toca la foto para acercar";
      dialogo.append(cerrar, img, ayuda);
      dialogo.addEventListener("click", (e) => {
        if (e.target === dialogo) dialogo!.close();
      });
      document.body.append(dialogo);
    }
    img.classList.remove("lupa__img--zoom");
    img.src = principal.currentSrc || principal.src;
    img.alt = principal.alt;
    dialogo.showModal();
  };
  lupa.addEventListener("click", abrir);
  principal.style.cursor = "zoom-in";
  principal.addEventListener("click", abrir);
}

/** `prod`, `prod~color`, `prod~color~opcion` o `prod~~opcion` (igual que idCompuesto del servidor). */
function compuesto(base: string, color?: string, opcion?: string): string {
  if (opcion) return `${base}~${color ?? ""}~${opcion}`;
  return color ? `${base}~${color}` : base;
}

function formatoPesos(n: number): string {
  return "$" + Math.round(n).toLocaleString("es-CL");
}

export function iniciarColores() {
  iniciarLupa();
  const lista = document.querySelector<HTMLElement>("[data-colores-lista]");
  const listaOp = document.querySelector<HTMLElement>("[data-opciones-lista]");
  const agregar = document.querySelector<HTMLButtonElement>("[data-agregar][data-producto-base]");
  const base = agregar?.dataset.productoBase || document.querySelector<HTMLElement>("[data-ficha~='producto']")?.dataset.producto;
  const botones = lista ? [...lista.querySelectorAll<HTMLButtonElement>("[data-color]")] : [];
  const botonesOp = listaOp ? [...listaOp.querySelectorAll<HTMLButtonElement>("[data-opcion]")] : [];

  // Producto sin colores ni opciones: solo la disponibilidad.
  if (!botones.length && !botonesOp.length) {
    const id = document.querySelector<HTMLElement>("[data-ficha~='producto'], article[data-producto]")?.dataset.producto;
    if (id) void consultarStock([id]).then((s) => pintarDisponible(s[id]));
    return;
  }

  const ul = lista;
  const principal = document.querySelector<HTMLImageElement>("[data-galeria-principal]");
  const elegidoEl = document.querySelector<HTMLElement>("[data-color-elegido]");
  const elegidoOpEl = document.querySelector<HTMLElement>("[data-opcion-elegida]");
  const precioEl = document.querySelector<HTMLElement>(".ficha [data-ficha~='precio'], [data-ficha-precio]");
  const mas = document.querySelector<HTMLButtonElement>("[data-colores-mas]");
  const nombreBase = document.querySelector<HTMLElement>("[data-ficha~='nombre'], .ficha__nombre")?.textContent?.trim() || "";
  const fotoBase = principal?.getAttribute("src") || "";
  const imagenBase = agregar?.dataset.imagen || "";
  let stock: Record<string, number | null> = {};
  let abierto = false;
  let color: HTMLButtonElement | undefined;
  let opcion: HTMLButtonElement | undefined;

  const colorId = (b?: HTMLButtonElement) => (b?.dataset.color ? b.dataset.color.split("~")[1] : undefined);
  const permitido = (b: HTMLButtonElement, op = opcion) => {
    const lista = op?.dataset.opcionColores;
    return !lista || lista.split(",").includes(colorId(b) ?? "");
  };
  const idActual = () => (base ? compuesto(base, colorId(color), opcion?.dataset.opcion) : "");
  const stockDe = (c?: HTMLButtonElement, op = opcion) => (base ? stock[compuesto(base, colorId(c), op?.dataset.opcion)] : undefined);

  const visibles = () =>
    Math.max(1, Number(window.matchMedia(MOVIL).matches ? ul?.dataset.visiblesMovil : ul?.dataset.visibles) || botones.length);

  function plegar() {
    if (!ul) return;
    const n = visibles();
    const sobra = botones.length > n;
    botones.forEach((b, i) => {
      const li = b.closest("li") ?? b;
      (li as HTMLElement).hidden = sobra && !abierto && i >= n;
    });
    if (mas) {
      mas.hidden = !sobra;
      const t = mas.querySelector("[data-colores-mas-texto]") ?? mas;
      t.textContent = abierto ? "Ver menos" : `Ver los ${botones.length} ${ul.dataset.plural || "colores"}`;
      mas.setAttribute("aria-expanded", String(abierto));
    }
  }

  /** Marca en los botones lo que no viene en la opción elegida o está agotado. */
  function marcar() {
    for (const b of botones) {
      const fuera = Boolean(opcion) && !permitido(b);
      const agotado = !fuera && stockDe(b) === 0;
      b.classList.toggle("colores__mini--agotado", agotado || fuera);
      b.classList.toggle("colores__mini--no-viene", fuera);
      b.setAttribute("aria-disabled", String(agotado || fuera));
      b.setAttribute("aria-label", `${b.dataset.colorNombre}${fuera ? " (no viene en este tamaño)" : agotado ? " (agotado)" : ""}`);
    }
    for (const o of botonesOp) {
      // Una opción está agotada si no queda nada en ninguno de sus colores (o en ella misma, sin colores).
      const claves = Object.keys(stock).filter((k) => k.endsWith(`~${o.dataset.opcion}`));
      const agotada = claves.length > 0 && claves.every((k) => stock[k] === 0);
      o.classList.toggle("opciones__boton--agotada", agotada);
      o.setAttribute("aria-label", `${o.dataset.opcionNombre}${agotada ? " (agotado)" : ""}`);
    }
  }

  function actualizar(actualizarUrl = true) {
    const nombres = [nombreBase, opcion?.dataset.opcionNombre, color?.dataset.colorNombre].filter(Boolean).join(" · ");
    if (elegidoEl) elegidoEl.textContent = color?.dataset.colorNombre || "";
    if (elegidoOpEl) elegidoOpEl.textContent = opcion?.dataset.opcionNombre || "";
    if (principal) {
      const foto = color?.dataset.colorFoto || fotoBase;
      if (foto && principal.getAttribute("src") !== foto) {
        principal.src = foto;
        principal.removeAttribute("srcset");
      }
      principal.alt = nombres;
    }
    const precio = Number(opcion?.dataset.opcionPrecio);
    if (precioEl && opcion && Number.isFinite(precio)) precioEl.textContent = formatoPesos(precio);
    const s = base ? stock[idActual()] : undefined;
    if (agregar) {
      agregar.dataset.id = idActual();
      agregar.dataset.nombre = nombres;
      if (opcion && Number.isFinite(precio)) agregar.dataset.precio = String(precio);
      agregar.dataset.imagen = color?.dataset.colorMini || imagenBase;
      agregar.disabled = s === 0;
    }
    pintarDisponible(s);
    botones.forEach((x) => x.setAttribute("aria-pressed", String(x === color)));
    botonesOp.forEach((x) => x.setAttribute("aria-pressed", String(x === opcion)));
    if (color && (color.closest("li") as HTMLElement | null)?.hidden) {
      abierto = true;
      plegar();
    }
    if (actualizarUrl) {
      const url = new URL(location.href);
      const c = colorId(color);
      if (c) url.searchParams.set("color", c);
      if (opcion?.dataset.opcion) url.searchParams.set("opcion", opcion.dataset.opcion);
      history.replaceState(history.state, "", url);
    }
  }

  /** El color a mostrar en esta opción: el actual si viene y queda; si no, el primero que venga y quede. */
  function colorPara(op: HTMLButtonElement | undefined, preferido?: HTMLButtonElement): HTMLButtonElement | undefined {
    if (!botones.length) return undefined;
    const vienen = botones.filter((b) => !op || permitido(b, op));
    if (preferido && vienen.includes(preferido) && stockDe(preferido, op) !== 0) return preferido;
    return vienen.find((b) => stockDe(b, op) !== 0) ?? (preferido && vienen.includes(preferido) ? preferido : vienen[0]);
  }

  botones.forEach((b) =>
    b.addEventListener("click", () => {
      if (b.getAttribute("aria-disabled") === "true") return;
      color = b;
      actualizar();
    })
  );
  botonesOp.forEach((o) =>
    o.addEventListener("click", () => {
      opcion = o;
      color = colorPara(o, color);
      marcar();
      actualizar();
    })
  );
  mas?.addEventListener("click", () => {
    abierto = !abierto;
    plegar();
  });
  window.matchMedia(MOVIL).addEventListener("change", plegar);
  plegar();

  // Lo pedido en la dirección (?opcion=xl&color=rojo), si existe.
  const pedidoUrl = new URL(location.href).searchParams;
  const opUrl = botonesOp.find((o) => o.dataset.opcion === pedidoUrl.get("opcion"));
  const colorUrl = botones.find((b) => colorId(b) === pedidoUrl.get("color"));
  opcion = opUrl ?? botonesOp[0];
  color = colorUrl && (!opcion || permitido(colorUrl)) ? colorUrl : colorPara(opcion);
  marcar();
  actualizar(false);

  if (!base) return;
  void consultarStockColores(base).then((s) => {
    stock = s;
    // Si lo elegido está agotado y nadie lo pidió por la dirección, se elige lo primero que quede.
    if (!colorUrl && !opUrl && stockDe(color) === 0) {
      const libre = botonesOp.length
        ? botonesOp.map((o) => ({ o, c: colorPara(o) })).find(({ o, c }) => stockDe(c, o) !== 0)
        : undefined;
      if (libre) {
        opcion = libre.o;
        color = libre.c;
      } else color = colorPara(opcion, color);
    }
    marcar();
    actualizar(false);
  });
}
