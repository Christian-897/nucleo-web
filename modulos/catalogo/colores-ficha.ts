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

export function iniciarColores() {
  iniciarLupa();
  const lista = document.querySelector<HTMLElement>("[data-colores-lista]");
  const agregar = document.querySelector<HTMLButtonElement>("[data-agregar][data-producto-base]");
  const base = agregar?.dataset.productoBase || document.querySelector<HTMLElement>("[data-ficha~='producto']")?.dataset.producto;

  // Producto sin colores: solo la disponibilidad.
  if (!lista || !lista.querySelector("[data-color]")) {
    const id = document.querySelector<HTMLElement>("[data-ficha~='producto'], article[data-producto]")?.dataset.producto;
    if (id) void consultarStock([id]).then((s) => pintarDisponible(s[id]));
    return;
  }

  const ul = lista;
  const botones = [...ul.querySelectorAll<HTMLButtonElement>("[data-color]")];
  const principal = document.querySelector<HTMLImageElement>("[data-galeria-principal]");
  const elegidoEl = document.querySelector<HTMLElement>("[data-color-elegido]");
  const mas = document.querySelector<HTMLButtonElement>("[data-colores-mas]");
  const nombreBase = document.querySelector<HTMLElement>("[data-ficha~='nombre'], .ficha__nombre")?.textContent?.trim() || "";
  let stock: Record<string, number | null> = {};
  let abierto = false;

  const visibles = () =>
    Math.max(1, Number(window.matchMedia(MOVIL).matches ? ul.dataset.visiblesMovil : ul.dataset.visibles) || botones.length);

  function plegar() {
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

  function elegir(b: HTMLButtonElement, actualizarUrl = true) {
    const id = b.dataset.color!;
    const nombre = b.dataset.colorNombre || "";
    botones.forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    if (elegidoEl) elegidoEl.textContent = nombre;
    if (principal && b.dataset.colorFoto) {
      principal.src = b.dataset.colorFoto;
      principal.removeAttribute("srcset");
      principal.alt = `${nombreBase} · ${nombre}`;
    }
    if (agregar) {
      agregar.dataset.id = id;
      agregar.dataset.nombre = `${nombreBase} · ${nombre}`;
      if (b.dataset.colorMini) agregar.dataset.imagen = b.dataset.colorMini;
      const s = stock[id];
      agregar.disabled = s === 0;
    }
    pintarDisponible(stock[id]);
    // Si quedó escondido (más allá de los visibles), se abre la lista.
    if ((b.closest("li") as HTMLElement | null)?.hidden) {
      abierto = true;
      plegar();
    }
    if (actualizarUrl) {
      const url = new URL(location.href);
      url.searchParams.set("color", id.split("~")[1] ?? "");
      history.replaceState(history.state, "", url);
    }
  }

  botones.forEach((b) =>
    b.addEventListener("click", () => {
      if (b.getAttribute("aria-disabled") === "true") return;
      elegir(b);
    })
  );
  mas?.addEventListener("click", () => {
    abierto = !abierto;
    plegar();
  });
  window.matchMedia(MOVIL).addEventListener("change", plegar);
  plegar();

  // Color pedido en la dirección (?color=rojo), si existe.
  const pedido = new URL(location.href).searchParams.get("color");
  const delUrl = pedido ? botones.find((b) => b.dataset.color === `${base}~${pedido}`) : undefined;
  elegir(delUrl ?? botones[0], false);

  if (!base) return;
  void consultarStockColores(base).then((s) => {
    stock = s;
    for (const b of botones) {
      const agotado = s[b.dataset.color!] === 0;
      b.classList.toggle("colores__mini--agotado", agotado);
      b.setAttribute("aria-disabled", String(agotado));
      b.setAttribute("aria-label", `${b.dataset.colorNombre}${agotado ? " (agotado)" : ""}`);
    }
    // Si el elegido está agotado y nadie lo pidió por la dirección, se elige el primero con stock.
    const actual = botones.find((b) => b.getAttribute("aria-pressed") === "true");
    if (actual && s[actual.dataset.color!] === 0 && !delUrl) {
      const libre = botones.find((b) => s[b.dataset.color!] !== 0);
      elegir(libre ?? actual, false);
    } else if (actual) elegir(actual, false);
  });
}
