/**
 * Pestaña "Diseño y textos" del panel (módulo contenido). La pantalla se
 * arma desde el ESQUEMA que define cada sitio: grupos y campos.
 * REGLA: lo que llega del servidor se escribe con textContent o atributos.
 */
import { enviar, obtener, reducirFoto, subirFotoContenido } from "../cliente";
import { esColor, revisarContraste, type ParContraste } from "../../contenido/color";
import type { Campo, Esquema, Valores } from "../../contenido/tipos";

interface FuentePanel {
  id: string;
  nombre: string;
  familia: string;
  roles: string[];
  css: string;
}
interface Aviso {
  mensaje: string;
}
interface DatosSitio {
  esquema: Esquema;
  valores: Valores;
  iniciales: Valores;
  cambiados: string[];
  fuentes: FuentePanel[];
  combinaciones: { id: string; nombre: string; titulo: string; texto: string; firma: string }[];
  contraste: ParContraste[];
  avisos: Aviso[];
}

export interface Ayudas {
  raiz: HTMLElement;
  avisar(texto: string): void;
  siSeCerro(status: number): boolean;
  conBoton<T>(form: HTMLFormElement, tarea: () => Promise<T>): Promise<T | undefined>;
}

const API = "/api/admin";

export function crearVistaSitio(a: Ayudas) {
  const $ = <T extends Element = HTMLElement>(sel: string) => a.raiz.querySelector<T>(sel)!;
  const crear = <K extends keyof HTMLElementTagNameMap>(tag: K, clase?: string, texto?: string) => {
    const el = document.createElement(tag);
    if (clase) el.className = clase;
    if (texto !== undefined) el.textContent = texto;
    return el;
  };

  let datos: DatosSitio | null = null;
  let grupoActual = "";
  let sucio = false;
  const hojasCargadas = new Set<string>();

  /** Carga la hoja de una tipografía para la vista previa (misma dirección: lo permite la CSP del panel). */
  function cargarFuente(f: FuentePanel | undefined) {
    if (!f || hojasCargadas.has(f.css)) return;
    hojasCargadas.add(f.css);
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = f.css;
    document.head.append(link);
  }
  const fuente = (id: string) => datos?.fuentes.find((f) => f.id === id);

  async function cargar() {
    const r = await obtener<DatosSitio>(`${API}/contenido`);
    if (a.siSeCerro(r.status)) return;
    if (!r.ok) return a.avisar(r.datos.message || "No se pudo cargar el diseño y los textos.");
    datos = r.datos;
    if (!grupoActual || !datos.esquema.grupos.some((g) => g.id === grupoActual)) grupoActual = datos.esquema.grupos[0]?.id ?? "";
    pintarGrupos();
    pintarGrupo();
  }

  function pintarGrupos() {
    if (!datos) return;
    const d = datos;
    $("[data-sitio-grupos]").replaceChildren(
      ...d.esquema.grupos.map((g) => {
        const b = crear("button", "pa-chip", g.titulo);
        b.type = "button";
        b.setAttribute("aria-pressed", String(g.id === grupoActual));
        b.addEventListener("click", () => {
          if (g.id === grupoActual) return;
          if (sucio && !confirm("Tienes cambios sin guardar en esta sección. ¿Salir igual?")) return;
          grupoActual = g.id;
          pintarGrupos();
          pintarGrupo();
        });
        return b;
      })
    );
  }

  const camposDelGrupo = () => (datos ? datos.esquema.campos.filter((c) => c.grupo === grupoActual) : []);
  const form = () => $<HTMLFormElement>('[data-form="sitio"]');

  /** Valores que hay ahora en pantalla (sin guardar) encima de los guardados. */
  function valoresEnPantalla(): Valores {
    const v: Valores = { ...(datos?.valores ?? {}) };
    for (const el of form().querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>("[data-clave]")) {
      v[el.dataset.clave!] = el.value;
    }
    return v;
  }

  function pintarGrupo() {
    if (!datos) return;
    const d = datos;
    const g = d.esquema.grupos.find((x) => x.id === grupoActual);
    sucio = false;
    $("[data-sitio-titulo]").textContent = g?.titulo ?? "";
    $("[data-sitio-descripcion]").textContent = g?.descripcion ?? "";
    form().querySelector<HTMLElement>("[data-error]")!.textContent = "";
    const campos = camposDelGrupo();
    const hayColores = campos.some((c) => c.tipo === "color");
    const hayFuentes = campos.some((c) => c.tipo === "fuente");

    const extra = $("[data-sitio-extra]");
    extra.replaceChildren();
    if (hayFuentes && d.combinaciones.length) {
      const caja = crear("div");
      caja.append(crear("p", "pa-tenue pa-chico", "Combinaciones que funcionan bien (después puedes ajustar cada una):"));
      const fila = crear("div", "pa-combinaciones");
      for (const c of d.combinaciones) {
        const b = crear("button", "pa-chip", c.nombre);
        b.type = "button";
        b.addEventListener("click", () => {
          for (const campo of campos.filter((x) => x.tipo === "fuente")) {
            const el = form().querySelector<HTMLSelectElement>(`[data-clave="${campo.clave}"]`);
            const id = campo.rol === "titulo" ? c.titulo : campo.rol === "texto" ? c.texto : c.firma;
            if (el && [...el.options].some((o) => o.value === id)) el.value = id;
          }
          marcarSucio();
          refrescar();
        });
        fila.append(b);
      }
      caja.append(fila);
      extra.append(caja);
    }
    if (hayColores || hayFuentes) extra.append(vistaPrevia());
    if (hayColores) {
      const avisos = crear("ul", "pa-avisos");
      avisos.dataset.sitioAvisos = "";
      avisos.setAttribute("aria-live", "polite");
      extra.append(avisos);
    }

    const contenedor = $("[data-sitio-campos]");
    contenedor.className = hayColores ? "pa-sitio__campos pa-colores" : "pa-sitio__campos";
    contenedor.replaceChildren(...campos.map((c) => campoUI(c)));
    refrescar();
  }

  function vistaPrevia(): HTMLElement {
    const caja = crear("div", "pa-vista-previa");
    caja.dataset.sitioPrevia = "";
    caja.setAttribute("aria-hidden", "true");
    caja.append(crear("div", "pa-vista-previa__franja", "Envíos a todo Chile · Compra segura"));
    const cuerpo = crear("div", "pa-vista-previa__cuerpo");
    cuerpo.append(
      crear("p", "pa-vista-previa__firma", "Tu marca"),
      crear("span", "pa-vista-previa__marca"),
      crear("p", "pa-vista-previa__titulo", "Productos destacados"),
      crear("p", "pa-vista-previa__texto", "Así se ve el texto normal del sitio, con tildes y eñes: ¡Qué lindo tejido!"),
      crear("span", "pa-vista-previa__boton", "Agregar al carrito")
    );
    caja.append(cuerpo, crear("div", "pa-vista-previa__pie", "Pie de página"));
    return caja;
  }

  function marcarSucio() {
    sucio = true;
  }

  /** Vista previa, muestras de tipografía y avisos de contraste, en vivo. */
  function refrescar() {
    if (!datos) return;
    const v = valoresEnPantalla();
    const previa = a.raiz.querySelector<HTMLElement>("[data-sitio-previa]");
    if (previa) {
      for (const c of datos.esquema.campos) {
        if (!c.variable) continue;
        const valor = v[c.clave];
        if (c.tipo === "color" && esColor(valor)) previa.style.setProperty(c.variable, valor);
        if (c.tipo === "fuente") {
          const f = fuente(valor);
          if (f) {
            cargarFuente(f);
            previa.style.setProperty(c.variable, f.familia);
          }
        }
      }
    }
    for (const muestra of a.raiz.querySelectorAll<HTMLElement>("[data-muestra-de]")) {
      const f = fuente(v[muestra.dataset.muestraDe!]);
      if (f) {
        cargarFuente(f);
        muestra.style.fontFamily = f.familia;
      }
    }
    const lista = a.raiz.querySelector<HTMLElement>("[data-sitio-avisos]");
    if (lista) {
      const avisos = revisarContraste(datos.contraste, v);
      lista.className = avisos.length ? "pa-avisos" : "pa-avisos pa-avisos--ok";
      lista.replaceChildren(
        ...(avisos.length
          ? avisos.map((x) => crear("li", "", `⚠ ${x.mensaje}`))
          : [crear("li", "", "✓ Los textos se leen bien con estos colores.")])
      );
    }
  }

  function campoUI(c: Campo): HTMLElement {
    const d = datos!;
    const caja = crear("div", "pa-sitio__campo");
    const id = `sitio-${c.clave.replace(/[^a-z0-9]/gi, "-")}`;
    const etiqueta = crear("label", "pa-campo");
    etiqueta.htmlFor = id;
    const titulo = crear("span", "pa-sitio__etiqueta");
    titulo.append(document.createTextNode(c.etiqueta + (c.opcional ? " (opcional)" : "")));
    if (d.cambiados.includes(c.clave)) titulo.append(crear("span", "pa-etiqueta pa-etiqueta--acento pa-cambiado", "Cambiado"));
    etiqueta.append(titulo);
    const valor = d.valores[c.clave] ?? "";

    if (c.tipo === "imagen") {
      const fila = crear("div", "pa-foto-campo");
      const img = crear("img");
      img.src = valor;
      img.alt = "";
      img.width = 160;
      img.height = 107;
      const boton = crear("label", "pa-boton pa-boton--suave pa-archivo", "Cambiar foto");
      const input = crear("input");
      input.type = "file";
      input.accept = "image/jpeg,image/png,image/webp";
      input.id = id;
      boton.append(input);
      const estado = crear("p", "pa-tenue pa-chico", "Se guarda al elegirla.");
      input.addEventListener("change", async () => {
        const archivo = input.files?.[0];
        input.value = "";
        if (!archivo) return;
        try {
          estado.textContent = "Preparando la foto…";
          const lista = await reducirFoto(archivo, c.anchoMaximo ?? 1600, 900 * 1024, "libre");
          estado.textContent = "Subiendo…";
          const r = await subirFotoContenido(c.clave, lista);
          if (a.siSeCerro(r.status)) return;
          if (!r.ok) {
            estado.textContent = r.datos.message || "No se pudo subir la foto.";
            return;
          }
          d.valores[c.clave] = r.datos.imagen;
          if (!d.cambiados.includes(c.clave)) d.cambiados.push(c.clave);
          img.src = r.datos.imagen;
          estado.textContent = "Listo. El sitio se actualiza en unos segundos.";
        } catch (e) {
          estado.textContent = e instanceof Error ? e.message : "No pudimos usar esa foto.";
        }
      });
      fila.append(img, boton, estado);
      caja.append(titulo, fila);
      if (c.ayuda) caja.append(crear("p", "pa-tenue pa-chico", c.ayuda));
      return caja;
    }

    let control: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
    if (c.tipo === "parrafo") {
      const t = crear("textarea");
      t.rows = 4;
      control = t;
    } else if (c.tipo === "fuente") {
      const s = crear("select");
      for (const f of d.fuentes.filter((x) => !c.rol || x.roles.includes(c.rol))) s.append(new Option(f.nombre, f.id));
      control = s;
    } else {
      const i = crear("input");
      i.type = c.tipo === "email" ? "email" : c.tipo === "telefono" ? "tel" : "text";
      if (c.tipo === "url") i.placeholder = c.red ? "Enlace de tu perfil o @usuario" : "https://…";
      if (c.tipo === "telefono") i.placeholder = "+56 9 1234 5678";
      control = i;
    }
    control.id = id;
    control.dataset.clave = c.clave;
    control.value = valor;
    if (c.tipo === "texto" || c.tipo === "parrafo") (control as HTMLInputElement).maxLength = c.max ?? (c.tipo === "parrafo" ? 1200 : 120);
    control.addEventListener("input", () => {
      marcarSucio();
      refrescar();
    });
    control.addEventListener("change", () => {
      marcarSucio();
      refrescar();
    });

    if (c.tipo === "color") {
      const fila = crear("div", "pa-color");
      const selector = crear("input");
      selector.type = "color";
      selector.value = esColor(valor) ? valor : "#000000";
      selector.setAttribute("aria-label", `${c.etiqueta}: elegir color`);
      (control as HTMLInputElement).maxLength = 7;
      (control as HTMLInputElement).spellcheck = false;
      selector.addEventListener("input", () => {
        control.value = selector.value;
        marcarSucio();
        refrescar();
      });
      control.addEventListener("input", () => {
        if (esColor(control.value)) selector.value = control.value;
      });
      fila.append(selector, control);
      etiqueta.append(fila);
    } else {
      etiqueta.append(control);
    }
    caja.append(etiqueta);
    if (c.tipo === "fuente") {
      const muestra = crear("p", "pa-muestra-fuente", "Tejidos hechos a mano · Aa Ññ 123");
      muestra.dataset.muestraDe = c.clave;
      caja.append(muestra);
    }
    if (c.ayuda) caja.append(crear("p", "pa-tenue pa-chico", c.ayuda));
    const error = crear("p", "pa-error");
    error.dataset.errorSitio = c.clave;
    caja.append(error);
    return caja;
  }

  form().addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!datos) return;
    const f = form();
    const errorGeneral = f.querySelector<HTMLElement>("[data-error]")!;
    errorGeneral.textContent = "";
    f.querySelectorAll<HTMLElement>("[data-error-sitio]").forEach((x) => (x.textContent = ""));
    f.querySelectorAll("[aria-invalid]").forEach((x) => x.removeAttribute("aria-invalid"));
    const valores: Valores = {};
    for (const el of f.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>("[data-clave]")) valores[el.dataset.clave!] = el.value;
    await a.conBoton(f, async () => {
      const r = await enviar<{ valores: Valores; cambiados: string[]; avisos: Aviso[]; errores?: Record<string, string> }>(`${API}/contenido`, {
        accion: "guardar",
        valores,
      });
      if (a.siSeCerro(r.status)) return;
      if (!r.ok) {
        for (const [clave, texto] of Object.entries(r.datos.errores ?? {})) {
          const lugar = f.querySelector<HTMLElement>(`[data-error-sitio="${CSS.escape(clave)}"]`);
          if (lugar) lugar.textContent = texto;
          f.querySelector(`[data-clave="${CSS.escape(clave)}"]`)?.setAttribute("aria-invalid", "true");
        }
        errorGeneral.textContent = r.datos.message || "No se pudo guardar.";
        return;
      }
      datos!.valores = r.datos.valores;
      datos!.cambiados = r.datos.cambiados;
      pintarGrupo();
      a.avisar(r.datos.avisos.length ? "Guardado, pero revisa los avisos de contraste." : "Guardado. El sitio se actualiza en unos segundos.");
    });
  });

  $("[data-sitio-restablecer]").addEventListener("click", async () => {
    if (!datos) return;
    const claves = camposDelGrupo().map((c) => c.clave);
    if (!confirm("¿Volver a lo original en esta sección? Se pierden los cambios que hiciste aquí.")) return;
    const r = await enviar<{ valores: Valores; cambiados: string[] }>(`${API}/contenido`, { accion: "restablecer", claves });
    if (a.siSeCerro(r.status)) return;
    if (!r.ok) return a.avisar(r.datos.message || "No se pudo restablecer.");
    datos.valores = r.datos.valores;
    datos.cambiados = r.datos.cambiados;
    pintarGrupo();
    a.avisar("Listo, volvió lo original en esta sección.");
  });

  return { cargar };
}
