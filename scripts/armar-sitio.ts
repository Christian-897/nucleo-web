/**
 * ARMAR EL NÚCLEO DE UN SITIO (v0.50): copia dentro del sitio SOLO los
 * archivos del núcleo que ese sitio usa, para que compile solo, sin
 * descargar nada de GitHub.
 *
 *   npx tsx scripts/armar-sitio.ts <carpeta-del-sitio>              copia en <sitio>/nucleo/
 *   npx tsx scripts/armar-sitio.ts <carpeta-del-sitio> --revisar    solo muestra qué copiaría
 *   npx tsx scripts/armar-sitio.ts <carpeta> --modulos contenido,cotizacion,pago-libre
 *        (sitio recién empezado, sin código todavía: parte de esos módulos)
 *
 * Cómo decide: lee los `import … from "nucleo-web/…"` de src/ y functions/
 * del sitio y sigue cada import relativo dentro del núcleo (.ts, .astro,
 * .json). Lo que nadie importa no se copia. Después, en el sitio:
 *   "nucleo-web": "file:./nucleo"  (y "zod" como dependencia propia)
 *
 * Deja <sitio>/nucleo/VERSION.txt con la versión, los módulos y la lista de
 * archivos, para saber qué tiene cada sitio y poder actualizarlo después.
 */
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, normalize, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const EXTENSIONES = [".ts", ".astro", ".json", ".mjs", ".js"];
const IMPORT = /(?:import|export)\s[^'"`;]*?from\s*['"]([^'"]+)['"]|import\s*['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g;

export interface Paquete {
  /** Rutas relativas a la raíz del núcleo, ordenadas. */
  archivos: string[];
  modulos: string[];
  /** Imports a "nucleo-web/…" que no existen en `exports` (error del sitio). */
  desconocidos: string[];
}

function exportsDelNucleo(raiz: string): Record<string, string> {
  return (JSON.parse(readFileSync(join(raiz, "package.json"), "utf8")) as { exports: Record<string, string> }).exports;
}

function importsDe(texto: string): string[] {
  const r: string[] = [];
  for (const m of texto.matchAll(IMPORT)) r.push((m[1] ?? m[2] ?? m[3])!);
  return r;
}

function* archivosDe(carpeta: string): Generator<string> {
  if (!existsSync(carpeta)) return;
  for (const n of readdirSync(carpeta)) {
    if (n === "node_modules" || n.startsWith(".")) continue;
    const p = join(carpeta, n);
    if (statSync(p).isDirectory()) yield* archivosDe(p);
    else if (/\.(ts|tsx|astro|mjs|js)$/.test(n)) yield p;
  }
}

function resolverRelativo(raiz: string, desde: string, especificador: string): string | null {
  const base = normalize(join(dirname(join(raiz, desde)), especificador));
  for (const c of [base, ...EXTENSIONES.map((e) => base + e), ...EXTENSIONES.map((e) => join(base, "index" + e))]) {
    if (existsSync(c) && statSync(c).isFile()) return relative(raiz, c);
  }
  return null;
}

/** Calcula qué archivos del núcleo hacen falta a partir de los puntos de entrada. */
export function calcularPaquete(entradas: string[], raiz = RAIZ): Paquete {
  const exp = exportsDelNucleo(raiz);
  const pendientes: string[] = [];
  const desconocidos: string[] = [];
  for (const e of entradas) {
    const clave = e === "nucleo-web" ? "." : "." + e.slice("nucleo-web".length);
    if (exp[clave]) pendientes.push(normalize(exp[clave]));
    else desconocidos.push(e);
  }
  const vistos = new Set<string>();
  while (pendientes.length) {
    const f = pendientes.pop()!;
    if (vistos.has(f) || !existsSync(join(raiz, f))) continue;
    vistos.add(f);
    for (const s of importsDe(readFileSync(join(raiz, f), "utf8"))) {
      if (!s.startsWith(".")) continue;
      const r = resolverRelativo(raiz, f, s);
      if (r) pendientes.push(r);
    }
  }
  const archivos = [...vistos].sort();
  const modulos = [...new Set(archivos.filter((a) => a.startsWith("modulos/")).map((a) => a.split("/")[1]))].sort();
  return { archivos, modulos, desconocidos: [...new Set(desconocidos)].sort() };
}

/** Los "nucleo-web/…" que importa un sitio (src/ y functions/). */
export function entradasDelSitio(sitio: string): string[] {
  const r = new Set<string>();
  for (const c of ["src", "functions"]) {
    for (const f of archivosDe(join(sitio, c))) {
      for (const s of importsDe(readFileSync(f, "utf8"))) if (s === "nucleo-web" || s.startsWith("nucleo-web/")) r.add(s);
    }
  }
  return [...r].sort();
}

/** Puntos de entrada de una lista de módulos (para un sitio sin código aún). */
export function entradasDeModulos(modulos: string[], raiz = RAIZ): string[] {
  const exp = exportsDelNucleo(raiz);
  const r: string[] = [];
  for (const m of modulos) {
    const claves = Object.keys(exp).filter((k) => k === `./${m}` || k.startsWith(`./${m}/`));
    if (!claves.length) throw new Error(`No existe el módulo «${m}». Los módulos están en modulos/ (ver docs/CATALOGO.md).`);
    for (const k of claves) r.push("nucleo-web" + k.slice(1));
  }
  return r;
}

function versionDelNucleo(raiz: string): string {
  return (JSON.parse(readFileSync(join(raiz, "package.json"), "utf8")) as { version: string }).version;
}

/** Copia el paquete en <sitio>/nucleo/ (borra lo que había). */
export function copiarPaquete(p: Paquete, sitio: string, raiz = RAIZ, fecha = new Date()): string {
  const destino = join(sitio, "nucleo");
  rmSync(destino, { recursive: true, force: true });
  for (const a of [...p.archivos, "package.json", "README.md"]) {
    const d = join(destino, a);
    mkdirSync(dirname(d), { recursive: true });
    copyFileSync(join(raiz, a), d);
  }
  const texto = [
    `nucleo-web v${versionDelNucleo(raiz)} — copiado el ${fecha.toISOString().slice(0, 10)}`,
    "",
    "Solo los archivos que usa este sitio (calculados siguiendo cada import).",
    "El sitio compila sin descargar nada de GitHub.",
    "Para actualizar: desde el núcleo, npx tsx scripts/armar-sitio.ts <este sitio>",
    "",
    `Módulos (${p.modulos.length}): ${p.modulos.join(", ")}`,
    "",
    `Archivos (${p.archivos.length}):`,
    ...p.archivos.map((a) => "  " + a),
    "",
  ].join("\n");
  writeFileSync(join(destino, "VERSION.txt"), texto);
  return destino;
}

// ─── uso desde la terminal ───
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const sitio = args.find((a) => !a.startsWith("--"));
  const revisar = args.includes("--revisar");
  const iModulos = args.indexOf("--modulos");
  if (!sitio) {
    console.error("Uso: npx tsx scripts/armar-sitio.ts <carpeta-del-sitio> [--revisar] [--modulos a,b,c]");
    process.exit(1);
  }
  let entradas: string[];
  try {
    entradas = iModulos >= 0 ? entradasDeModulos((args[iModulos + 1] ?? "").split(",").filter(Boolean)) : entradasDelSitio(sitio);
  } catch (e) {
    console.error((e as Error).message);
    process.exit(1);
  }
  if (!entradas.length) {
    console.error("El sitio no importa nada de nucleo-web. Usa --modulos para elegirlos.");
    process.exit(1);
  }
  const p = calcularPaquete(entradas);
  if (p.desconocidos.length) {
    console.error("Estos imports no existen en el núcleo:", p.desconocidos.join(", "));
    process.exit(1);
  }
  console.log(`Módulos (${p.modulos.length}): ${p.modulos.join(", ")}`);
  console.log(`Archivos: ${p.archivos.length} (+ package.json, README.md, VERSION.txt)`);
  if (revisar) {
    for (const a of p.archivos) console.log("  " + a);
  } else {
    const d = copiarPaquete(p, sitio);
    console.log(`Copiado en ${d}. En el package.json del sitio: "nucleo-web": "file:./nucleo" y "zod".`);
  }
}
