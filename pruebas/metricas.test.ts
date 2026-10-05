/**
 * Prueba de métricas: días en hora de Chile, un pedido se cuenta UNA vez,
 * los totales cuadran y los datos raros no rompen nada.
 */
import assert from "node:assert/strict";
import type { AlmacenKV } from "../core/tipos";
import {
  calcularResumen,
  diaLocal,
  obtenerResumen,
  registrarPedido,
  restarDias,
  ultimosDias,
  PREFIJO_DIA,
  PREFIJO_MES,
  diasDelMesHasta,
  obtenerRango,
  normalizarConsulta,
  lunesDe,
  fechaValida,
  ErrorRango,
} from "../modulos/metricas/index";

let pasaron = 0;
async function prueba(nombre: string, fn: () => Promise<void> | void) {
  await fn();
  pasaron++;
  console.log("  ok —", nombre);
}

function kvMemoria(): AlmacenKV & { datos: Map<string, string> } {
  const datos = new Map<string, string>();
  return {
    datos,
    async get(k) {
      return datos.get(k) ?? null;
    },
    async put(k, v) {
      datos.set(k, v);
    },
    async delete(k) {
      datos.delete(k);
    },
    async list({ prefix = "" } = {}) {
      return { keys: [...datos.keys()].filter((k) => k.startsWith(prefix)).map((name) => ({ name })), list_complete: true };
    },
  } as AlmacenKV & { datos: Map<string, string> };
}

const pedido = (orden: string, creado: string, monto: number, proveedor = "flow", lineas = [{ nombre: "Gatito", cantidad: 1, subtotal: monto }]) => ({
  orden,
  creado,
  monto,
  proveedor,
  lineas,
});

async function run() {
  console.log("Métricas:");

  await prueba("el día se calcula en hora de Chile, no en UTC", () => {
    // 02:30 UTC del 5 de octubre = 23:30 del 4 de octubre en Santiago (UTC-3 en horario de verano).
    assert.equal(diaLocal("2026-10-05T02:30:00Z"), "2026-10-04");
    assert.equal(diaLocal("2026-10-05T12:00:00Z"), "2026-10-05");
    assert.equal(diaLocal("no es fecha"), "");
  });

  await prueba("aritmética de días cruza meses y años", () => {
    assert.equal(restarDias("2026-03-01", 1), "2026-02-28");
    assert.equal(restarDias("2026-01-01", 1), "2025-12-31");
    const u = ultimosDias("2026-10-04", 30);
    assert.equal(u.length, 30);
    assert.equal(u[0], "2026-09-05");
    assert.equal(u[29], "2026-10-04");
  });

  await prueba("un pedido se cuenta una sola vez aunque se registre varias veces", async () => {
    const kv = kvMemoria();
    const p = pedido("ORD1", "2026-10-04T15:00:00Z", 18000);
    assert.equal(await registrarPedido(kv, p), true);
    assert.equal(await registrarPedido(kv, p), false);
    assert.equal(await registrarPedido(kv, p), false);
    const dia = JSON.parse(kv.datos.get(PREFIJO_DIA + "2026-10-04")!);
    assert.equal(dia.v, 18000);
    assert.equal(dia.n, 1);
    assert.deepEqual(dia.p.Gatito, [1, 18000]);
    assert.deepEqual(dia.m.flow, [1, 18000]);
  });

  await prueba("el resumen cuadra: hoy, 7 días, 30 días, ticket, top y medios", async () => {
    const kv = kvMemoria();
    const ahora = new Date("2026-10-04T18:00:00Z");
    await registrarPedido(kv, pedido("A", "2026-10-04T15:00:00Z", 18000, "flow"));
    await registrarPedido(kv, pedido("B", "2026-10-04T16:00:00Z", 15000, "mercadopago", [{ nombre: "Perrito", cantidad: 1, subtotal: 15000 }]));
    await registrarPedido(kv, pedido("C", "2026-10-01T16:00:00Z", 36000, "mercadopago", [{ nombre: "Gatito", cantidad: 2, subtotal: 36000 }]));
    await registrarPedido(kv, pedido("D", "2026-09-25T16:00:00Z", 10000, "flow", [{ nombre: "Lana", cantidad: 5, subtotal: 10000 }]));
    await registrarPedido(kv, pedido("Viejo", "2026-08-01T16:00:00Z", 99999, "flow")); // fuera de 30 días
    const r = await obtenerResumen(kv, { ahora });
    assert.equal(r.hoy, "2026-10-04");
    assert.deepEqual(r.periodos.hoy, { ventas: 33000, pedidos: 2, ticket: 16500 });
    assert.deepEqual(r.periodos.d7, { ventas: 69000, pedidos: 3, ticket: 23000 });
    assert.deepEqual(r.periodos.d7Anterior, { ventas: 10000, pedidos: 1, ticket: 10000 });
    assert.deepEqual(r.periodos.d30, { ventas: 79000, pedidos: 4, ticket: 19750 });
    assert.equal(r.variacion7, 590);
    assert.equal(r.serie.length, 30);
    assert.equal(r.serie.at(-1)!.ventas, 33000);
    assert.deepEqual(r.topProductos.map((p) => [p.nombre, p.unidades]), [["Lana", 5], ["Gatito", 3], ["Perrito", 1]]);
    assert.deepEqual(r.medios.map((m) => [m.proveedor, m.pedidos, m.ventas]), [["mercadopago", 2, 51000], ["flow", 2, 28000]]);
  });

  await prueba("sin ventas: todo en cero y sin dividir por cero", () => {
    const r = calcularResumen({}, "2026-10-04", "America/Santiago");
    assert.deepEqual(r.periodos.d30, { ventas: 0, pedidos: 0, ticket: 0 });
    assert.equal(r.variacion7, null);
    assert.equal(r.topProductos.length, 0);
  });

  await prueba("datos raros no rompen: orden inválida, montos negativos, día dañado, sin KV", async () => {
    const kv = kvMemoria();
    assert.equal(await registrarPedido(kv, pedido("../x", "2026-10-04T15:00:00Z", 1000)), false);
    assert.equal(await registrarPedido(kv, pedido("Z", "basura", 1000)), false);
    assert.equal(await registrarPedido(undefined, pedido("Z", "2026-10-04T15:00:00Z", 1000)), false);
    kv.datos.set(PREFIJO_DIA + "2026-10-04", "{no es json");
    assert.equal(await registrarPedido(kv, pedido("N", "2026-10-04T15:00:00Z", -500, "flow", [{ nombre: "X", cantidad: -3, subtotal: NaN }])), true);
    const dia = JSON.parse(kv.datos.get(PREFIJO_DIA + "2026-10-04")!);
    assert.equal(dia.v, 0);
    assert.equal(dia.n, 1);
    assert.deepEqual(dia.p.X, [0, 0]);
  });

  console.log("Métricas — comparación por años:");

  await prueba("cada venta suma también a su mes, que no vence", async () => {
    const kv = kvMemoria();
    const puts: { k: string; ttl?: number }[] = [];
    const putOriginal = kv.put.bind(kv);
    kv.put = async (k, v, o) => {
      puts.push({ k, ttl: o?.expirationTtl });
      return putOriginal(k, v, o);
    };
    await registrarPedido(kv, pedido("M1", "2026-10-04T15:00:00Z", 18000));
    await registrarPedido(kv, pedido("M2", "2026-10-20T15:00:00Z", 2000));
    const mes = JSON.parse(kv.datos.get(PREFIJO_MES + "2026-10")!);
    assert.equal(mes.v, 20000);
    assert.equal(mes.n, 2);
    assert.ok(puts.filter((p) => p.k.startsWith(PREFIJO_MES)).every((p) => p.ttl === undefined), "los meses no vencen");
    assert.ok(puts.filter((p) => p.k.startsWith(PREFIJO_DIA)).every((p) => p.ttl! > 0), "los días sí vencen");
  });

  await prueba("año a la fecha: compara hasta el MISMO día del año anterior, no el mes completo", async () => {
    const kv = kvMemoria();
    // 2025: enero completo + octubre repartido (antes y después del día 4).
    await registrarPedido(kv, pedido("P1", "2025-01-10T15:00:00Z", 10000));
    await registrarPedido(kv, pedido("P2", "2025-10-02T15:00:00Z", 5000));
    await registrarPedido(kv, pedido("P3", "2025-10-25T15:00:00Z", 99000)); // después del 4/oct: no cuenta en "a la fecha"
    await registrarPedido(kv, pedido("P4", "2024-06-01T15:00:00Z", 7000));
    // 2026
    await registrarPedido(kv, pedido("A1", "2026-02-10T15:00:00Z", 20000));
    await registrarPedido(kv, pedido("A2", "2026-10-03T15:00:00Z", 10000));
    const r = await obtenerResumen(kv, { ahora: new Date("2026-10-04T18:00:00Z") });
    const a = r.anual;
    assert.equal(a.anio, 2026);
    assert.deepEqual(a.aFecha, { ventas: 30000, pedidos: 2, ticket: 15000 });
    assert.deepEqual(a.aFechaAnterior, { ventas: 15000, pedidos: 2, ticket: 7500 });
    assert.equal(a.variacionAnual, 100);
    assert.deepEqual(a.anios.map((x) => [x.anio, x.ventas, x.pedidos]), [[2026, 30000, 2], [2025, 114000, 3], [2024, 7000, 1]]);
    assert.deepEqual(a.meses["2025-10"], { ventas: 104000, pedidos: 2 });
    assert.equal(a.meses["2026-03"], undefined);
  });

  await prueba("29 de febrero: el año anterior se corta en el 28", () => {
    assert.equal(diasDelMesHasta(2027, 2, 29).at(-1), "2027-02-28");
    assert.equal(diasDelMesHasta(2028, 2, 29).at(-1), "2028-02-29");
    assert.equal(diasDelMesHasta(2026, 10, 4).length, 4);
  });

  await prueba("sin historial: la comparación anual queda en cero y sin %", async () => {
    const r = await obtenerResumen(kvMemoria(), { ahora: new Date("2026-10-04T18:00:00Z") });
    assert.equal(r.anual.variacionAnual, null);
    assert.deepEqual(r.anual.anios, []);
  });

  console.log("Métricas — rango de fechas:");
  const AHORA = new Date("2026-10-04T18:00:00Z"); // domingo 4 de octubre, hora de Chile

  await prueba("fechas: valida días reales y calcula el lunes de cada semana", () => {
    assert.equal(fechaValida("2026-02-28"), true);
    assert.equal(fechaValida("2026-02-30"), false);
    assert.equal(fechaValida("2026-13-01"), false);
    assert.equal(fechaValida("hola"), false);
    assert.equal(lunesDe("2026-10-04"), "2026-09-28");
    assert.equal(lunesDe("2026-09-28"), "2026-09-28");
  });

  await prueba("rango por día: totales, serie con ceros y comparación con el período anterior", async () => {
    const kv = kvMemoria();
    await registrarPedido(kv, pedido("R1", "2026-10-01T15:00:00Z", 10000, "flow"));
    await registrarPedido(kv, pedido("R2", "2026-10-03T15:00:00Z", 20000, "mercadopago", [{ nombre: "Perrito", cantidad: 2, subtotal: 20000 }]));
    await registrarPedido(kv, pedido("R0", "2026-09-28T15:00:00Z", 5000, "flow"));
    await registrarPedido(kv, pedido("Rx", "2026-09-20T15:00:00Z", 99000, "flow"));
    const r = await obtenerRango(kv, { desde: "2026-10-01", hasta: "2026-10-04", agrupar: "dia" }, { ahora: AHORA });
    assert.equal(r.exacto, true);
    assert.equal(r.dias, 4);
    assert.deepEqual(r.periodo, { ventas: 30000, pedidos: 2, ticket: 15000 });
    assert.deepEqual(r.serie.map((p) => [p.desde, p.ventas]), [["2026-10-01", 10000], ["2026-10-02", 0], ["2026-10-03", 20000], ["2026-10-04", 0]]);
    assert.deepEqual(r.anterior, { desde: "2026-09-27", hasta: "2026-09-30", periodo: { ventas: 5000, pedidos: 1, ticket: 5000 } });
    assert.equal(r.variacion, 500);
    assert.deepEqual(r.topProductos[0], { nombre: "Perrito", unidades: 2, ventas: 20000 });
    assert.deepEqual(r.medios.map((m) => m.proveedor), ["mercadopago", "flow"]);
  });

  await prueba("rango por semana (lunes a domingo) y por mes, recortados al rango", async () => {
    const kv = kvMemoria();
    await registrarPedido(kv, pedido("S1", "2026-09-29T15:00:00Z", 1000));
    await registrarPedido(kv, pedido("S2", "2026-10-04T15:00:00Z", 2000));
    await registrarPedido(kv, pedido("S3", "2026-09-22T15:00:00Z", 4000));
    const sem = await obtenerRango(kv, { desde: "2026-09-23", hasta: "2026-10-04", agrupar: "semana" }, { ahora: AHORA });
    assert.deepEqual(sem.serie.map((p) => [p.desde, p.hasta, p.ventas]), [["2026-09-23", "2026-09-27", 0], ["2026-09-28", "2026-10-04", 3000]]);
    const mes = await obtenerRango(kv, { desde: "2026-09-01", hasta: "2026-10-04", agrupar: "mes" }, { ahora: AHORA });
    assert.deepEqual(mes.serie.map((p) => [p.etiqueta, p.ventas]), [["sep 2026", 5000], ["oct 2026", 2000]]);
  });

  await prueba("rango antiguo (más de 400 días): usa meses completos y lo avisa", async () => {
    const kv = kvMemoria();
    await registrarPedido(kv, pedido("V1", "2024-03-15T15:00:00Z", 7000));
    await registrarPedido(kv, pedido("V2", "2024-05-02T15:00:00Z", 3000));
    const r = await obtenerRango(kv, { desde: "2024-03-20", hasta: "2024-04-10", agrupar: "dia" }, { ahora: AHORA });
    assert.equal(r.exacto, false);
    assert.equal(r.agrupar, "mes");
    assert.equal(r.desde, "2024-03-01");
    assert.equal(r.hasta, "2024-04-30");
    assert.equal(r.periodo.ventas, 7000);
    assert.equal(r.anterior, null);
  });

  await prueba("rango: errores claros y la fecha final no pasa de hoy", () => {
    const hoy = "2026-10-04";
    assert.throws(() => normalizarConsulta({ desde: "2026-10-05", hasta: "2026-10-01" }, hoy), ErrorRango);
    assert.throws(() => normalizarConsulta({ desde: "2026-02-30", hasta: "2026-03-01" }, hoy), ErrorRango);
    assert.throws(() => normalizarConsulta({ desde: "2010-01-01", hasta: "2026-01-01" }, hoy), /10 años/);
    assert.equal(normalizarConsulta({ desde: "2026-10-01", hasta: "2027-01-01" }, hoy).hasta, hoy);
    assert.equal(normalizarConsulta({ desde: "2026-10-01", hasta: "2026-10-02", agrupar: "<script>" as any }, hoy).agrupar, "dia");
  });

  console.log(`\n${pasaron} pruebas pasaron.`);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
