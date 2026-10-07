/**
 * Prueba de las visitas (Cloudflare Web Analytics en el panel), con una
 * API de Cloudflare de mentira. Se corre con `npm test`.
 */
import assert from "node:assert/strict";
import type { AlmacenKV } from "../core/tipos";
import { armarReporte, consultarVisitas, CONSULTA, diasHasta, ErrorVisitas, visitasConfiguradas } from "../modulos/visitas/index";

let pasaron = 0;
async function prueba(nombre: string, fn: () => Promise<void> | void) {
  await fn();
  pasaron++;
  console.log("  ok —", nombre);
}
function kvMemoria() {
  const datos = new Map<string, string>();
  const kv: AlmacenKV = {
    get: async (k) => datos.get(k) ?? null,
    put: async (k, v) => void datos.set(k, v),
    delete: async (k) => void datos.delete(k),
    list: async () => ({ keys: [...datos.keys()].map((name) => ({ name })) }),
  };
  return { kv, datos };
}

const AHORA = new Date("2026-10-07T15:00:00Z");
const ENV = {
  ANALITICA_TOKEN: "token-de-prueba-0123456789abcdef\n",
  ANALITICA_CUENTA: "0123456789abcdef0123456789ABCDEF",
  ANALITICA_SITIO: " fedcba9876543210fedcba9876543210 ",
};
const RESPUESTA = {
  data: {
    viewer: {
      accounts: [
        {
          total: [{ count: 120, sum: { visits: 45 } }],
          dias: [
            { count: 20, sum: { visits: 8 }, dimensions: { date: "2026-10-05" } },
            { count: 100, sum: { visits: 37 }, dimensions: { date: "2026-10-07" } },
          ],
          paginas: [
            { count: 50, dimensions: { requestPath: "/" } },
            { count: 30, dimensions: { requestPath: "/admin/" } },
            { count: 20, dimensions: { requestPath: "/tienda/peluches/" } },
            { count: 5, dimensions: { requestPath: "/api/carrito" } },
          ],
          paises: [{ count: 110, dimensions: { countryName: "CL" } }],
          dispositivos: [{ count: 80, dimensions: { deviceType: "mobile" } }],
          origenes: [{ count: 60, dimensions: { refererHost: "" } }, { count: 40, dimensions: { refererHost: "l.instagram.com" } }],
        },
      ],
    },
  },
};

async function run() {
  console.log("Visitas:");

  await prueba("solo se consulta con las 3 variables bien formadas (recorta espacios y saltos pegados)", () => {
    assert.ok(visitasConfiguradas(ENV));
    assert.ok(!visitasConfiguradas({}));
    assert.ok(!visitasConfiguradas({ ...ENV, ANALITICA_CUENTA: "123" }));
    assert.ok(!visitasConfiguradas({ ...ENV, ANALITICA_TOKEN: "corto" }));
  });

  await prueba("el reporte rellena los días sin visitas y no muestra el panel ni la API como páginas", () => {
    const r = armarReporte(RESPUESTA, 7, AHORA);
    assert.equal(r.visitas, 45);
    assert.equal(r.paginas, 120);
    assert.equal(r.porDia.length, 7);
    assert.deepEqual(r.porDia.map((d) => d.dia), diasHasta(AHORA, 7));
    assert.equal(r.porDia.find((d) => d.dia === "2026-10-06")?.visitas, 0);
    assert.equal(r.porDia.find((d) => d.dia === "2026-10-07")?.visitas, 37);
    assert.deepEqual(r.masVistas.map((p) => p.nombre), ["/", "/tienda/peluches/"]);
    assert.equal(r.origenes[0].nombre, "", "directo");
  });

  await prueba("pide a Cloudflare solo lectura, sin robots, con la clave limpia; guarda 10 minutos", async () => {
    const { kv } = kvMemoria();
    let llamadas = 0;
    let enviado: { headers: Record<string, string>; body: string } | null = null;
    const falso = (async (_url: string, init: RequestInit) => {
      llamadas++;
      enviado = { headers: init.headers as Record<string, string>, body: String(init.body) };
      return new Response(JSON.stringify(RESPUESTA), { status: 200 });
    }) as unknown as typeof fetch;
    const r1 = await consultarVisitas({ ...ENV, REVIEWS_KV: kv }, 7, { fetch: falso, ahora: AHORA });
    assert.equal(r1.visitas, 45);
    assert.equal(enviado!.headers.Authorization, "Bearer token-de-prueba-0123456789abcdef");
    const cuerpo = JSON.parse(enviado!.body);
    assert.equal(cuerpo.variables.cuenta, "0123456789abcdef0123456789abcdef");
    assert.equal(cuerpo.variables.sitio, "fedcba9876543210fedcba9876543210");
    assert.equal(cuerpo.variables.desde, "2026-10-01");
    assert.ok(!/mutation/i.test(CONSULTA) && /bot: 0/.test(CONSULTA));
    await consultarVisitas({ ...ENV, REVIEWS_KV: kv }, 7, { fetch: falso, ahora: AHORA });
    assert.equal(llamadas, 1, "la segunda vez sale de la caché");
  });

  await prueba("errores claros, sin mostrar la clave: permiso, sin cuenta, sin conexión", async () => {
    const errorConsola = console.error;
    console.error = () => {};
    try {
      assert.throws(() => armarReporte({ errors: [{ message: "not authorized for that account" }] }, 7, AHORA), /permiso/);
      assert.throws(() => armarReporte({ data: { viewer: { accounts: [] } } }, 7, AHORA), /ANALITICA_CUENTA/);
      const caido = (async () => {
        throw new Error("red");
      }) as unknown as typeof fetch;
      await assert.rejects(consultarVisitas({ ...ENV }, 7, { fetch: caido, ahora: AHORA }), (e: unknown) => e instanceof ErrorVisitas && !String((e as Error).message).includes("token-de-prueba"));
      const negado = (async () => new Response("{}", { status: 403 })) as unknown as typeof fetch;
      await assert.rejects(consultarVisitas({ ...ENV }, 30, { fetch: negado, ahora: AHORA }), /no es válida/);
    } finally {
      console.error = errorConsola;
    }
  });

  console.log(`\n${pasaron} pruebas pasaron.`);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
