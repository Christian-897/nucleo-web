/**
 * Prueba del comando que arma el núcleo de un sitio (v0.50): copia solo lo
 * que el sitio importa, sigue los imports internos y deja VERSION.txt.
 */
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { calcularPaquete, copiarPaquete, entradasDeModulos, entradasDelSitio } from "../scripts/armar-sitio";

let pasaron = 0;
function prueba(nombre: string, fn: () => void) {
  fn();
  pasaron++;
  console.log("  ok —", nombre);
}

function sitioDePrueba(archivos: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), "sitio-"));
  for (const [ruta, texto] of Object.entries(archivos)) {
    mkdirSync(join(dir, ruta, ".."), { recursive: true });
    writeFileSync(join(dir, ruta), texto);
  }
  return dir;
}

console.log("Armar el núcleo de un sitio:");

prueba("lee los imports de src/ y functions/ (también en .astro), y nada más", () => {
  const s = sitioDePrueba({
    "src/servidor/c.ts": 'import { crearEndpointCotizacion } from "nucleo-web/cotizacion";',
    "src/pages/x.astro": '---\nimport { leerMonto } from "nucleo-web/pago-libre/cliente";\n---\n<script>import "nucleo-web/core/turnstile";</script>',
    "functions/api/c.ts": 'export { onRequestPost } from "nucleo-web/cotizacion";',
    "otra/carpeta.ts": 'import "nucleo-web/catalogo";',
  });
  assert.deepEqual(entradasDelSitio(s), ["nucleo-web/core/turnstile", "nucleo-web/cotizacion", "nucleo-web/pago-libre/cliente"]);
});

prueba("sigue los imports internos y deja fuera lo que no se usa", () => {
  const p = calcularPaquete(["nucleo-web/cotizacion"]);
  assert.ok(p.archivos.includes("modulos/cotizacion/index.ts"));
  assert.ok(p.archivos.includes("core/seguridad.ts"), "arrastra lo que cotizacion usa del core");
  assert.deepEqual(p.modulos, ["cotizacion"]);
  assert.ok(!p.archivos.some((a) => a.startsWith("modulos/catalogo/")));
  assert.ok(!p.archivos.some((a) => a.startsWith("pruebas/") || a.startsWith("docs/")));
  for (const a of p.archivos) assert.ok(existsSync(a), a);
});

prueba("pago-libre arrastra pago, que es lo que usa por dentro", () => {
  const p = calcularPaquete(["nucleo-web/pago-libre"]);
  assert.ok(p.modulos.includes("pago") && p.modulos.includes("pago-libre"));
  assert.ok(!p.modulos.includes("catalogo"));
});

prueba("un import que no existe se informa, no se ignora", () => {
  const p = calcularPaquete(["nucleo-web/cotizacion", "nucleo-web/no-existe"]);
  assert.deepEqual(p.desconocidos, ["nucleo-web/no-existe"]);
});

prueba("--modulos: parte de los módulos elegidos (sitio sin código aún)", () => {
  const e = entradasDeModulos(["cotizacion", "pago-libre"]);
  assert.ok(e.includes("nucleo-web/cotizacion") && e.includes("nucleo-web/pago-libre/cliente"));
  assert.throws(() => entradasDeModulos(["inventado"]), /No existe el módulo «inventado»/);
});

prueba("copia en <sitio>/nucleo/ con package.json, README y VERSION.txt", () => {
  const s = sitioDePrueba({ "src/a.ts": 'import "nucleo-web/cotizacion";' });
  const p = calcularPaquete(entradasDelSitio(s));
  const d = copiarPaquete(p, s, undefined, new Date("2026-11-15T12:00:00Z"));
  for (const a of [...p.archivos, "package.json", "README.md", "VERSION.txt"]) assert.ok(existsSync(join(d, a)), a);
  const version = readFileSync(join(d, "VERSION.txt"), "utf8");
  const pkg = JSON.parse(readFileSync("package.json", "utf8")) as { version: string };
  assert.match(version, new RegExp(`nucleo-web v${pkg.version.replace(/\./g, "\\.")} — copiado el 2026-11-15`));
  assert.match(version, /Módulos \(1\): cotizacion/);
  // Volver a armar reemplaza la carpeta (no quedan archivos viejos).
  writeFileSync(join(d, "sobra.ts"), "");
  copiarPaquete(p, s);
  assert.ok(!existsSync(join(d, "sobra.ts")));
});

console.log(`\n${pasaron} pruebas pasaron.`);
