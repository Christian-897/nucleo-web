/**
 * Copia las tipografías de la lista (modulos/contenido/fuentes.ts) a la
 * carpeta pública de un sitio, SOLO con las letras latinas (español).
 *
 *   1) En una carpeta cualquiera:  npm i <los paquetes de Fontsource de la lista>
 *   2) Desde el núcleo:            npx tsx scripts/copiar-fuentes.ts <esa carpeta>/node_modules <sitio>/public/fuentes
 *
 * Resultado: <destino>/<id>/fuente.css y sus .woff2. Se hace una vez por
 * sitio (o al agregar tipografías a la lista).
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { FUENTES } from "../modulos/contenido/fuentes";

const [origen, destino] = process.argv.slice(2);
if (!origen || !destino) {
  console.error("Uso: npx tsx scripts/copiar-fuentes.ts <node_modules> <destino>");
  process.exit(1);
}

let total = 0;
for (const f of FUENTES) {
  const carpeta = join(origen, f.paquete);
  if (!existsSync(carpeta)) {
    console.error(`Falta el paquete ${f.paquete} en ${origen}`);
    process.exit(1);
  }
  const salida = join(destino, f.id);
  mkdirSync(salida, { recursive: true });
  const bloques: string[] = [];
  for (const hoja of f.archivos) {
    const css = readFileSync(join(carpeta, hoja), "utf8");
    // Cada @font-face va precedido de un comentario con su subconjunto: solo "latin" (no latin-ext, cyrillic…).
    for (const m of css.matchAll(/\/\* ([^*]+) \*\/\s*(@font-face\s*\{[^}]+\})/g)) {
      const nombre = m[1];
      if (!/-latin-/.test(nombre) || /-latin-ext-/.test(nombre)) continue;
      let bloque = m[2];
      for (const u of bloque.matchAll(/url\(\.\/files\/([^)]+\.woff2)\)/g)) {
        copyFileSync(join(carpeta, "files", u[1]), join(salida, u[1]));
        total++;
      }
      bloque = bloque.replace(/url\(\.\/files\/([^)]+\.woff2)\)/g, "url(./$1)").replace(/,\s*url\([^)]+\.woff\)[^;]*/g, "");
      bloques.push(`/* ${nombre} */\n${bloque}`);
    }
  }
  if (!bloques.length) {
    console.error(`No encontré letras latinas en ${f.paquete}`);
    process.exit(1);
  }
  writeFileSync(join(salida, "fuente.css"), `/* ${f.nombre} — ${f.paquete} (SIL Open Font License) */\n${bloques.join("\n\n")}\n`);
  console.log(`  ${f.id}: ${bloques.length} variante(s)`);
}
console.log(`Listo: ${FUENTES.length} tipografías, ${total} archivos .woff2 en ${destino}`);
