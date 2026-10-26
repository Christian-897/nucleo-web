/**
 * Pantalla de Ayuda del panel: un diálogo con buscador, abierto desde el
 * botón "? Ayuda" de arriba o desde el "?" de cada sección.
 * REGLA: todo con textContent / createElement; nunca innerHTML.
 */
import { buscarAyuda, SECCIONES_AYUDA, TEMAS_AYUDA, type BloqueAyuda, type SeccionAyuda, type TemaAyuda } from "../ayuda";
import { GUIAS_AYUDA } from "../guias";
import { crearGuia } from "./guia-vista";

interface OpcionesVista {
  raiz: HTMLElement;
  /** Abre una pestaña del panel ("Ir a Productos"). */
  irA: (pestana: string) => void | Promise<void>;
}

/** Qué secciones muestra el "?" de cada pestaña. */
const SECCIONES_DE_PESTANA: Record<string, SeccionAyuda[]> = {
  resumen: ["resumen"],
  productos: ["productos"],
  categorias: ["categorias"],
  portada: ["portada"],
  sitio: ["sitio"],
  pedidos: ["pedidos", "despacho"],
  mensajes: ["mensajes"],
  suscriptores: ["suscriptores"],
  seguridad: ["seguridad"],
};

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

function bloque(b: BloqueAyuda): HTMLElement {
  if (typeof b === "string") {
    const p = document.createElement("p");
    p.append(conNegritas(b));
    return p;
  }
  if ("pasos" in b) {
    const ol = document.createElement("ol");
    for (const paso of b.pasos) {
      const li = document.createElement("li");
      li.append(conNegritas(paso));
      ol.append(li);
    }
    return ol;
  }
  const p = document.createElement("p");
  p.className = "pa-ayuda__nota";
  p.append(conNegritas(b.nota));
  return p;
}

export function crearVistaAyuda({ raiz, irA }: OpcionesVista) {
  const dialogo = raiz.querySelector<HTMLDialogElement>("[data-ayuda]")!;
  const buscador = dialogo.querySelector<HTMLInputElement>("[data-ayuda-buscar]")!;
  const lista = dialogo.querySelector<HTMLElement>("[data-ayuda-lista]")!;
  const estado = dialogo.querySelector<HTMLElement>("[data-ayuda-estado]")!;
  const filtro = dialogo.querySelector<HTMLElement>("[data-ayuda-filtro]")!;
  const filtroTexto = dialogo.querySelector<HTMLElement>("[data-ayuda-filtro-texto]")!;
  let secciones: SeccionAyuda[] | null = null;
  const guia = crearGuia({ raiz, irA });

  /** Solo los temas de lo que este sitio tiene activo. */
  function temasDelSitio(): TemaAyuda[] {
    return TEMAS_AYUDA.filter((t) => {
      if (!t.requiere) return true;
      const el = raiz.querySelector<HTMLElement>(t.requiere);
      return Boolean(el) && !el!.hidden;
    });
  }

  function articulo(t: TemaAyuda, abierto: boolean): HTMLElement {
    const d = document.createElement("details");
    d.className = "pa-ayuda__tema";
    d.open = abierto;
    d.dataset.tema = t.id;
    const s = document.createElement("summary");
    s.textContent = t.titulo;
    d.append(s);
    const cuerpo = document.createElement("div");
    cuerpo.className = "pa-ayuda__cuerpo";
    if (t.soloDueno) {
      const p = document.createElement("p");
      p.className = "pa-tenue pa-chico";
      p.textContent = "Solo lo puede hacer la persona dueña del panel.";
      cuerpo.append(p);
    }
    for (const b of t.contenido) cuerpo.append(bloque(b));
    const acciones = document.createElement("div");
    acciones.className = "pa-ayuda__acciones";
    const pasosGuia = GUIAS_AYUDA[t.id];
    if (pasosGuia?.length) {
      // «Muéstrame cómo»: recorre el panel real encerrando en rojo cada paso (v0.43).
      const ver = document.createElement("button");
      ver.type = "button";
      ver.className = "pa-boton pa-boton--chico";
      ver.textContent = "Muéstrame cómo";
      ver.addEventListener("click", () => {
        dialogo.close();
        guia.iniciar(t.titulo, pasosGuia);
      });
      acciones.append(ver);
    }
    cuerpo.append(acciones);
    const pestana = SECCIONES_AYUDA[t.seccion].pestana;
    if (pestana) {
      const ir = document.createElement("button");
      ir.type = "button";
      ir.className = "pa-boton pa-boton--suave pa-boton--chico";
      ir.textContent = `Ir a ${SECCIONES_AYUDA[t.seccion].nombre}`;
      ir.addEventListener("click", () => {
        dialogo.close();
        void irA(pestana);
      });
      acciones.append(ir);
    }
    d.append(cuerpo);
    return d;
  }

  function pintar() {
    const consulta = buscador.value.trim();
    let temas = temasDelSitio();
    if (secciones && !consulta) temas = temas.filter((t) => secciones!.includes(t.seccion));
    filtro.hidden = !secciones || Boolean(consulta);
    const encontrados = consulta ? buscarAyuda(temas, consulta) : temas;
    lista.replaceChildren();
    if (!encontrados.length) {
      estado.textContent = `No encontré nada sobre «${consulta}». Prueba con otras palabras (por ejemplo: precio, pedido, despacho, contraseña) o pregúntale a quien administra tu sitio.`;
      return;
    }
    if (consulta) {
      estado.textContent = encontrados.length === 1 ? "1 respuesta" : `${encontrados.length} respuestas`;
      encontrados.slice(0, 12).forEach((t, i) => lista.append(articulo(t, i === 0)));
      return;
    }
    estado.textContent = "";
    // Sin búsqueda: todos los temas agrupados por sección.
    let actual: SeccionAyuda | null = null;
    for (const t of encontrados) {
      if (t.seccion !== actual) {
        actual = t.seccion;
        const h = document.createElement("h3");
        h.className = "pa-ayuda__seccion";
        h.textContent = SECCIONES_AYUDA[actual].nombre;
        lista.append(h);
      }
      lista.append(articulo(t, false));
    }
  }

  let espera: number | undefined;
  buscador.addEventListener("input", () => {
    clearTimeout(espera);
    espera = window.setTimeout(pintar, 120);
  });
  dialogo.querySelector("[data-ayuda-todo]")!.addEventListener("click", () => {
    secciones = null;
    pintar();
    buscador.focus();
  });
  dialogo.querySelector("[data-ayuda-cerrar]")!.addEventListener("click", () => dialogo.close());

  function abrir(pestana?: string) {
    secciones = pestana ? SECCIONES_DE_PESTANA[pestana] ?? null : null;
    filtroTexto.textContent = secciones ? `Mostrando ayuda de ${secciones.map((s) => SECCIONES_AYUDA[s].nombre).join(" y ")}.` : "";
    buscador.value = "";
    pintar();
    if (!dialogo.open) dialogo.showModal();
    lista.scrollTop = 0;
    buscador.focus();
  }

  /** Un "?" junto al título de cada sección del panel. */
  for (const titulo of raiz.querySelectorAll<HTMLElement>("[data-vista] > .pa-titulo")) {
    const vista = titulo.closest<HTMLElement>("[data-vista]")!.dataset.vista!;
    if (!SECCIONES_DE_PESTANA[vista]) continue;
    const b = document.createElement("button");
    b.type = "button";
    b.className = "pa-ayuda__mini";
    b.textContent = "?";
    const h1 = titulo.querySelector("h1");
    if (!h1) continue;
    b.setAttribute("aria-label", `Ayuda sobre ${h1.textContent ?? "esta sección"}`);
    b.title = "Ayuda sobre esta sección";
    b.addEventListener("click", () => abrir(vista));
    h1.append(b);
  }

  return { abrir, cerrar: () => dialogo.close(), guia };
}
