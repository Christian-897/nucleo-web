/**
 * Formulario de reseña (navegador). Lo usa FormularioResena.astro.
 * Lee ?o=<pedido>&t=<código> del enlace del correo, muestra lo comprado y
 * manda las opiniones. Todo con textContent / createElement; nunca innerHTML.
 */
interface ProductoForm {
  id: string;
  nombre: string;
  imagen?: string;
  variante?: string;
  hecha: boolean;
}

const MAXIMO_TEXTO = 1000;

function crear<K extends keyof HTMLElementTagNameMap>(tag: K, clase = "", texto = ""): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (clase) el.className = clase;
  if (texto) el.textContent = texto;
  return el;
}

export function iniciarFormularioResena(raiz: HTMLElement, api = "/api/resenas") {
  const params = new URLSearchParams(location.search);
  const o = params.get("o") ?? "";
  const t = params.get("t") ?? "";
  const estado = raiz.querySelector<HTMLElement>("[data-resena-estado]")!;
  const form = raiz.querySelector<HTMLFormElement>("[data-resena-form]")!;
  const lista = raiz.querySelector<HTMLElement>("[data-resena-productos]")!;
  const nombre = raiz.querySelector<HTMLInputElement>("[data-resena-nombre]")!;
  const error = raiz.querySelector<HTMLElement>("[data-resena-error]")!;
  const gracias = raiz.querySelector<HTMLElement>("[data-resena-gracias]")!;

  const decir = (texto: string) => {
    estado.hidden = false;
    estado.textContent = texto;
  };

  function tarjeta(p: ProductoForm, i: number): HTMLElement {
    const li = crear("li", "resena-form__producto");
    li.dataset.producto = p.id;
    const cabeza = crear("div", "resena-form__cabeza");
    if (p.imagen) {
      const img = crear("img");
      img.src = p.imagen;
      img.alt = "";
      img.width = 72;
      img.height = 72;
      img.loading = "lazy";
      cabeza.append(img);
    }
    const datos = crear("div");
    datos.append(crear("strong", "resena-form__nombre", p.nombre));
    if (p.variante) datos.append(crear("span", "resena-form__variante", p.variante));
    cabeza.append(datos);
    li.append(cabeza);
    if (p.hecha) {
      li.classList.add("resena-form__producto--hecha");
      li.append(crear("p", "resena-form__hecha", "Ya opinaste sobre este producto. ¡Gracias!"));
      return li;
    }
    const grupo = crear("fieldset", "resena-form__estrellas");
    grupo.append(crear("legend", "resena-form__leyenda", "¿Cuántas estrellas le das?"));
    const fila = crear("div", "resena-form__fila");
    for (let n = 5; n >= 1; n--) {
      const id = `estrella-${i}-${n}`;
      const input = crear("input");
      input.type = "radio";
      input.name = `estrellas-${i}`;
      input.value = String(n);
      input.id = id;
      const label = crear("label", "", "★");
      label.htmlFor = id;
      label.title = `${n} ${n === 1 ? "estrella" : "estrellas"}`;
      label.setAttribute("aria-label", label.title);
      fila.append(input, label);
    }
    grupo.append(fila);
    const campo = crear("label", "resena-form__campo");
    campo.append(crear("span", "", "Tu opinión"));
    const area = crear("textarea");
    area.name = `texto-${i}`;
    area.rows = 4;
    area.maxLength = MAXIMO_TEXTO;
    area.placeholder = "¿Qué te gustó? ¿Cómo te ha funcionado?";
    campo.append(area);
    li.append(grupo, campo, crear("p", "resena-form__error", ""));
    return li;
  }

  async function cargar() {
    if (!o || !t) return decir("Este enlace no está completo. Ábrelo desde el correo que te enviamos.");
    let r: Response;
    try {
      r = await fetch(`${api}?o=${encodeURIComponent(o)}&t=${encodeURIComponent(t)}`, { headers: { Accept: "application/json" } });
    } catch {
      return decir("No pudimos conectarnos. Revisa tu conexión y recarga la página.");
    }
    const d = await r.json().catch(() => ({}));
    if (!r.ok) return decir(d.message || "Este enlace no es válido o ya venció.");
    const productos = (d.productos ?? []) as ProductoForm[];
    if (!productos.length) return decir("No encontramos productos para opinar en este pedido.");
    estado.hidden = true;
    if (productos.every((p) => p.hecha)) {
      gracias.hidden = false;
      return;
    }
    nombre.value = d.nombreSugerido || "";
    lista.replaceChildren(...productos.map(tarjeta));
    form.hidden = false;
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    error.textContent = "";
    const resenas: { producto: string; estrellas: number; texto: string }[] = [];
    lista.querySelectorAll<HTMLElement>(".resena-form__producto:not(.resena-form__producto--hecha)").forEach((li) => {
      li.querySelector<HTMLElement>(".resena-form__error")!.textContent = "";
      const marcada = li.querySelector<HTMLInputElement>('input[type="radio"]:checked');
      const texto = li.querySelector<HTMLTextAreaElement>("textarea")!.value.trim();
      // Se manda solo lo que se completó (puede opinar de uno y no de otro).
      if (marcada || texto) resenas.push({ producto: li.dataset.producto!, estrellas: Number(marcada?.value ?? 0), texto });
    });
    if (!resenas.length) {
      error.textContent = "Elige las estrellas y escribe tu opinión de al menos un producto.";
      return;
    }
    const boton = form.querySelector<HTMLButtonElement>('button[type="submit"]')!;
    boton.disabled = true;
    try {
      const r = await fetch(api, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ o, t, nombre: nombre.value, resenas }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        for (const [id, msg] of Object.entries((d.errores ?? {}) as Record<string, string>)) {
          const lugar = id === "nombre" ? error : lista.querySelector<HTMLElement>(`[data-producto="${CSS.escape(id)}"] .resena-form__error`);
          if (lugar) lugar.textContent = msg;
        }
        if (!d.errores) error.textContent = d.message || "No se pudo enviar. Intenta de nuevo.";
        else if (d.errores.nombre) error.textContent = d.errores.nombre;
        return;
      }
      form.hidden = true;
      gracias.hidden = false;
      gracias.scrollIntoView({ behavior: "smooth", block: "center" });
    } catch {
      error.textContent = "No pudimos conectarnos. Revisa tu conexión e intenta de nuevo.";
    } finally {
      boton.disabled = false;
    }
  });

  void cargar();
}
