/**
 * Recorrido «Muéstrame cómo» (v0.43): encierra en rojo el botón real del
 * panel y explica cada paso. Ver ../guias.ts.
 * REGLA: todo con textContent / createElement; nunca innerHTML.
 */
import type { PasoGuia } from "../guias";

interface OpcionesGuia {
  /** El contenedor del panel ([data-panel]): ahí viven los colores y estilos de los botones. */
  raiz: HTMLElement;
  /** Abre una pestaña del panel. */
  irA: (pestana: string) => void | Promise<void>;
}

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

function visible(el: Element): el is HTMLElement {
  if (!(el instanceof HTMLElement)) return false;
  if (el.closest("[hidden]")) return false;
  const d = el.closest("dialog");
  if (d && !d.open) return false;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0;
}

function buscar(selector: string): HTMLElement | null {
  try {
    for (const el of document.querySelectorAll(selector)) if (visible(el)) return el;
  } catch {
    /* selector que el navegador no entiende: como si no estuviera */
  }
  return null;
}

/** "Toca **Guardar**" → texto con <strong>, sin interpretar HTML. */
function conNegritas(texto: string): DocumentFragment {
  const f = document.createDocumentFragment();
  texto.split("**").forEach((parte, i) => {
    if (!parte) return;
    if (i % 2) {
      const b = document.createElement("strong");
      b.textContent = parte;
      f.append(b);
    } else f.append(document.createTextNode(parte));
  });
  return f;
}

export function crearGuia({ raiz, irA }: OpcionesGuia) {
  const marco = document.createElement("div");
  marco.className = "pa-guia__marco";
  marco.setAttribute("aria-hidden", "true");
  const tarjeta = document.createElement("div");
  tarjeta.className = "pa-guia__tarjeta";
  tarjeta.setAttribute("role", "dialog");
  tarjeta.setAttribute("aria-live", "polite");
  const titulo = document.createElement("p");
  titulo.className = "pa-guia__titulo";
  const cuenta = document.createElement("p");
  cuenta.className = "pa-guia__cuenta";
  const texto = document.createElement("p");
  texto.className = "pa-guia__texto";
  const aviso = document.createElement("p");
  aviso.className = "pa-guia__aviso";
  const botones = document.createElement("div");
  botones.className = "pa-guia__botones";
  const boton = (t: string, clase: string) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = clase;
    b.textContent = t;
    return b;
  };
  const anterior = boton("Anterior", "pa-boton pa-boton--suave pa-boton--chico");
  const siguiente = boton("Siguiente", "pa-boton pa-boton--chico");
  const salir = boton("Salir", "pa-enlace");
  botones.append(salir, anterior, siguiente);
  tarjeta.append(titulo, cuenta, texto, aviso, botones);

  let pasos: PasoGuia[] = [];
  let i = 0;
  let objetivo: HTMLElement | null = null;
  let activo = false;
  let turno = 0;

  function ubicar() {
    if (!activo) return;
    const ancho = Math.min(340, window.innerWidth - 24);
    tarjeta.style.width = `${ancho}px`;
    if (!objetivo || !visible(objetivo)) {
      marco.hidden = true;
      tarjeta.style.left = `${(window.innerWidth - ancho) / 2}px`;
      tarjeta.style.top = `${Math.max(12, window.innerHeight / 2 - tarjeta.offsetHeight / 2)}px`;
      return;
    }
    const r = objetivo.getBoundingClientRect();
    const m = 6;
    marco.hidden = false;
    Object.assign(marco.style, {
      left: `${r.left - m}px`,
      top: `${r.top - m}px`,
      width: `${r.width + m * 2}px`,
      height: `${r.height + m * 2}px`,
    });
    const alto = tarjeta.offsetHeight;
    let top = r.bottom + m + 12;
    if (top + alto > window.innerHeight - 8) top = r.top - m - 12 - alto;
    if (top < 8) top = Math.min(window.innerHeight - alto - 8, Math.max(8, r.bottom + m + 12));
    const left = Math.min(Math.max(12, r.left), window.innerWidth - ancho - 12);
    tarjeta.style.left = `${left}px`;
    tarjeta.style.top = `${top}px`;
  }

  /** Dentro del diálogo abierto (si el objetivo está en uno), para quedar sobre él. */
  function colocar(contenedor: Element) {
    if (marco.parentElement !== contenedor) contenedor.append(marco, tarjeta);
  }

  async function mostrar(n: number) {
    const mio = ++turno;
    i = Math.max(0, Math.min(n, pasos.length - 1));
    const p = pasos[i];
    if (p.pestana) await irA(p.pestana);
    let el = buscar(p.selector);
    if (!el && p.clic) {
      buscar(p.clic)?.click();
      for (let k = 0; k < 10 && !el; k++) {
        await esperar(120);
        el = buscar(p.selector);
      }
    }
    if (mio !== turno || !activo) return;
    objetivo = el;
    colocar(el?.closest("dialog[open]") ?? raiz);
    cuenta.textContent = `Paso ${i + 1} de ${pasos.length}`;
    texto.replaceChildren(conNegritas(p.texto));
    aviso.textContent = el ? "" : "No veo esta parte en tu pantalla. Puede que en tu tienda no esté activa o que todavía no tengas ninguno. Puedes seguir con el próximo paso.";
    anterior.disabled = i === 0;
    siguiente.textContent = i === pasos.length - 1 ? "Terminar" : "Siguiente";
    if (el) {
      el.scrollIntoView({ block: "center", behavior: "smooth" });
      await esperar(320);
    }
    if (mio !== turno) return;
    ubicar();
    siguiente.focus({ preventScroll: true });
  }

  function terminar() {
    activo = false;
    turno++;
    objetivo = null;
    marco.remove();
    tarjeta.remove();
    window.removeEventListener("resize", ubicar);
    window.removeEventListener("scroll", ubicar, true);
    document.removeEventListener("keydown", tecla, true);
  }

  function tecla(e: KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      terminar();
    }
  }

  anterior.addEventListener("click", () => void mostrar(i - 1));
  siguiente.addEventListener("click", () => (i >= pasos.length - 1 ? terminar() : void mostrar(i + 1)));
  salir.addEventListener("click", terminar);

  function iniciar(nombre: string, lista: PasoGuia[]) {
    if (!lista.length) return;
    if (activo) terminar();
    pasos = lista;
    activo = true;
    titulo.textContent = nombre;
    window.addEventListener("resize", ubicar);
    window.addEventListener("scroll", ubicar, true);
    document.addEventListener("keydown", tecla, true);
    void mostrar(0);
  }

  return { iniciar, terminar };
}
