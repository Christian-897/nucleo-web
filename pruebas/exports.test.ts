/**
 * Guardia de empaquetado: cada módulo en `modulos/` debe estar declarado en
 * `exports` del package.json, y cada ruta declarada debe existir. Si no, un
 * sitio que haga `import … from "nucleo-web/<modulo>"` falla al construir.
 * (Pasó con `carrito` en la v0.1.0: esta prueba existe para que no se repita.)
 */
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const raiz = new URL("..", import.meta.url).pathname;
const pkg = JSON.parse(readFileSync(join(raiz, "package.json"), "utf8")) as {
  exports: Record<string, string>;
};

const modulos = readdirSync(join(raiz, "modulos")).filter((d) =>
  statSync(join(raiz, "modulos", d)).isDirectory()
);

let pasaron = 0;
console.log("Exports del paquete:");

for (const m of modulos) {
  assert.ok(pkg.exports[`./${m}`], `falta "./${m}" en exports del package.json`);
  pasaron++;
  console.log(`  ok — módulo "${m}" declarado`);
}

for (const [clave, ruta] of Object.entries(pkg.exports)) {
  assert.ok(existsSync(join(raiz, ruta)), `exports["${clave}"] apunta a algo que no existe: ${ruta}`);
}
pasaron++;
console.log(`  ok — las ${Object.keys(pkg.exports).length} rutas declaradas existen`);

console.log(`\n${pasaron} pruebas pasaron.`);
