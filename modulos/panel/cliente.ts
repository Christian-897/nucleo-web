/**
 * Cliente del panel para el NAVEGADOR (headless: sin diseño). Cualquier
 * pantalla de administración usa estas funciones.
 *
 * Importar desde "nucleo-web/panel/cliente": no arrastra código del servidor.
 */

export interface Respuesta<T = Record<string, unknown>> {
  ok: boolean;
  status: number;
  datos: T & { message?: string; errores?: Record<string, string> };
}

async function llamar<T>(url: string, init?: RequestInit): Promise<Respuesta<T>> {
  try {
    const res = await fetch(url, { credentials: "same-origin", ...init });
    const datos = (await res.json().catch(() => ({}))) as Respuesta<T>["datos"];
    return { ok: res.ok, status: res.status, datos };
  } catch {
    return { ok: false, status: 0, datos: { message: "No hay conexión. Revisa tu internet." } as Respuesta<T>["datos"] };
  }
}

export const obtener = <T = Record<string, unknown>>(url: string) => llamar<T>(url);
export const enviar = <T = Record<string, unknown>>(url: string, cuerpo: unknown) =>
  llamar<T>(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(cuerpo) });

let parametros: { sal: string; repeticiones: number } | null = null;

/** PBKDF2-SHA256 en el navegador (600.000 repeticiones). Devuelve 64 hex. */
export async function derivarClave(clave: string, usuario: string, base = "/api/admin"): Promise<string> {
  if (!parametros) {
    const r = await obtener<{ sal: string; repeticiones: number }>(`${base}/parametros`);
    if (!r.ok) throw new Error(r.datos.message || "El panel no está disponible.");
    parametros = { sal: r.datos.sal, repeticiones: r.datos.repeticiones };
  }
  const enc = new TextEncoder();
  const material = await crypto.subtle.importKey("raw", enc.encode(clave), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: enc.encode(`${parametros.sal}:${usuario}`), iterations: parametros.repeticiones },
    material,
    256
  );
  return [...new Uint8Array(bits)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Medidas leyendo solo la cabecera (antes de abrir algo gigantesco). */
async function medidasDeArchivo(archivo: Blob): Promise<{ ancho: number; alto: number } | null> {
  const { medidasDeImagen } = await import("./medidas-imagen");
  return medidasDeImagen(new Uint8Array(await archivo.slice(0, 512 * 1024).arrayBuffer()));
}

/**
 * Reduce una foto en el navegador y la comprime (WebP si se puede) hasta
 * quedar bajo `maximoBytes`.
 *  - "cuadrado" (por defecto): recorta al centro en cuadrado de `lado` px
 *    (las fichas de producto son cuadradas).
 *  - "libre": mantiene la forma; el lado más largo queda en `lado` px
 *    (fotos de portada).
 */
export async function reducirFoto(
  archivo: File,
  lado = 1200,
  maximoBytes = 900 * 1024,
  recorte: "cuadrado" | "libre" = "cuadrado",
  /** "jpeg" para fotos que van en correos (WebP no se ve en todos los programas). */
  formato: "webp" | "jpeg" = "webp"
): Promise<File> {
  const m = await medidasDeArchivo(archivo);
  if (!m) throw new Error("No pudimos leer esa foto. Usa un JPG, PNG o WebP.");
  if (m.ancho > 15000 || m.alto > 15000 || m.ancho * m.alto > 60_000_000) {
    throw new Error("Esa foto es demasiado grande. Expórtala más chica.");
  }
  let imagen: ImageBitmap;
  try {
    imagen = await createImageBitmap(archivo, { imageOrientation: "from-image" });
  } catch {
    imagen = await createImageBitmap(archivo);
  }
  const lienzo = document.createElement("canvas");
  const ctx = lienzo.getContext("2d");
  if (!ctx) throw new Error("Tu navegador no pudo procesar la foto.");
  if (recorte === "libre") {
    const escala = Math.min(1, lado / Math.max(imagen.width, imagen.height));
    lienzo.width = Math.round(imagen.width * escala);
    lienzo.height = Math.round(imagen.height * escala);
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(imagen, 0, 0, lienzo.width, lienzo.height);
  } else {
    const corte = Math.min(imagen.width, imagen.height);
    const final = Math.min(lado, corte);
    lienzo.width = final;
    lienzo.height = final;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(imagen, (imagen.width - corte) / 2, (imagen.height - corte) / 2, corte, corte, 0, 0, final, final);
  }
  imagen.close?.();

  const aBlob = (tipo: string, calidad: number) =>
    new Promise<Blob | null>((r) => lienzo.toBlob((b) => r(b), tipo, calidad));
  let tipo = formato === "jpeg" ? "image/jpeg" : "image/webp";
  let calidad = 0.85;
  let blob = await aBlob(tipo, calidad);
  if (!blob || blob.type !== tipo) {
    tipo = "image/jpeg";
    blob = await aBlob(tipo, calidad);
  }
  while (blob && blob.size > maximoBytes && calidad > 0.4) {
    calidad -= 0.12;
    blob = await aBlob(tipo, calidad);
  }
  if (!blob || blob.size > maximoBytes) throw new Error("No pudimos achicar la foto lo suficiente. Prueba con otra.");
  return new File([blob], tipo === "image/webp" ? "foto.webp" : "foto.jpg", { type: tipo });
}

/** Sube la foto de un producto (ya reducida). */
export async function subirFotoProducto(id: string, foto: File, base = "/api/admin") {
  const form = new FormData();
  form.set("id", id);
  form.set("archivo", foto);
  return llamar<{ imagen: string }>(`${base}/producto-foto`, { method: "POST", body: form });
}

/** Sube la foto de un boletín (JPG, ya reducida). */
export async function subirFotoBoletin(foto: File, base = "/api/admin") {
  const form = new FormData();
  form.set("archivo", foto);
  return llamar<{ imagen: string }>(`${base}/boletin-foto`, { method: "POST", body: form });
}

/** Sube una foto de la portada (ya reducida). Devuelve su dirección; se usa al guardar el carrusel. */
export async function subirFotoCarrusel(foto: File, base = "/api/admin") {
  const form = new FormData();
  form.set("archivo", foto);
  return llamar<{ imagen: string }>(`${base}/carrusel-foto`, { method: "POST", body: form });
}

/** Sube la foto de una categoría (ya reducida). */
export async function subirFotoCategoria(id: string, foto: File, base = "/api/admin") {
  const form = new FormData();
  form.set("id", id);
  form.set("archivo", foto);
  return llamar<{ imagen: string }>(`${base}/categoria-foto`, { method: "POST", body: form });
}

/** Sube una foto del sitio (campo de tipo imagen del módulo contenido) y la deja puesta. */
export async function subirFotoContenido(clave: string, foto: File, base = "/api/admin") {
  const form = new FormData();
  form.set("clave", clave);
  form.set("archivo", foto);
  return llamar<{ imagen: string }>(`${base}/contenido-foto`, { method: "POST", body: form });
}
