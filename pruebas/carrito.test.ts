/**
 * Prueba del motor del carrito. Lo más importante: el precio y el stock
 * SIEMPRE salen de la fuente real (obtenerProducto), nunca del cliente.
 * Se corre con `npm test` (tsx).
 */
import assert from "node:assert/strict";
import { validarCarrito } from "../modulos/carrito/servidor";
import type { Producto } from "../modulos/carrito/tipos";

let pasaron = 0;
async function prueba(nombre: string, fn: () => Promise<void> | void) {
  await fn();
  pasaron++;
  console.log("  ok —", nombre);
}

const catalogo: Record<string, Producto> = {
  silla: { id: "silla", nombre: "Silla", precio: 19990, stock: 5 },
  mesa: { id: "mesa", nombre: "Mesa", precio: 89990 }, // sin stock => ilimitado
  agotado: { id: "agotado", nombre: "Agotado", precio: 1000, stock: 0 },
};
const config = {
  obtenerProducto: (id: string) => catalogo[id] ?? null,
};

async function run() {
  console.log("Carrito (servidor):");

  await prueba("calcula el total con el precio REAL, no el del cliente", async () => {
    // El cliente podría intentar mandar precio=1; validarCarrito ni lo mira.
    const r = await validarCarrito(
      [{ productoId: "silla", cantidad: 2, precio: 1 } as never],
      config
    );
    assert.equal(r.total, 19990 * 2);
    assert.equal(r.lineas[0].precioUnitario, 19990);
    assert.equal(r.listoParaPagar, true);
  });

  await prueba("rechaza un producto que no existe", async () => {
    const r = await validarCarrito([{ productoId: "ovni", cantidad: 1 }], config);
    assert.equal(r.lineas.length, 0);
    assert.equal(r.problemas[0]?.tipo, "no-existe");
    assert.equal(r.listoParaPagar, false);
  });

  await prueba("ajusta la cantidad si supera el stock", async () => {
    const r = await validarCarrito([{ productoId: "silla", cantidad: 10 }], config);
    assert.equal(r.lineas[0].cantidad, 5);
    assert.equal(r.problemas[0]?.tipo, "stock-ajustado");
    assert.equal(r.problemas[0]?.cantidadDisponible, 5);
  });

  await prueba("excluye un producto sin stock", async () => {
    const r = await validarCarrito([{ productoId: "agotado", cantidad: 1 }], config);
    assert.equal(r.lineas.length, 0);
    assert.equal(r.problemas[0]?.tipo, "sin-stock");
  });

  await prueba("suma las líneas repetidas del mismo producto", async () => {
    const r = await validarCarrito(
      [
        { productoId: "mesa", cantidad: 1 },
        { productoId: "mesa", cantidad: 2 },
      ],
      config
    );
    assert.equal(r.lineas.length, 1);
    assert.equal(r.lineas[0].cantidad, 3);
    assert.equal(r.total, 89990 * 3);
  });

  await prueba("marca cantidad inválida (0, negativa o decimal)", async () => {
    const r = await validarCarrito(
      [
        { productoId: "silla", cantidad: 0 },
        { productoId: "mesa", cantidad: -2 },
      ],
      config
    );
    assert.equal(r.lineas.length, 0);
    assert.equal(r.problemas.length, 2);
    assert.ok(r.problemas.every((p) => p.tipo === "cantidad-invalida"));
  });

  await prueba("carrito vacío no está listo para pagar", async () => {
    const r = await validarCarrito([], config);
    assert.equal(r.listoParaPagar, false);
    assert.equal(r.total, 0);
  });

  console.log(`\n${pasaron} pruebas pasaron.`);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
