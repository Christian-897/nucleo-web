/**
 * Boletines: intenta romperlo. Resend falso (fetch interceptado) y KV en
 * memoria. Se corre con `npm test`.
 */
import assert from "node:assert/strict";
import type { AlmacenBinario } from "../core/tipos";
import { hmacSha256Hex } from "../core/cripto";
import {
  cabecerasBaja,
  correoBoletin,
  enlaceBoletinValido,
  enviadosHoy,
  enviarBoletin,
  horaReinicio,
  leerBoletin,
  validarBoletin,
  type Boletin,
} from "../modulos/newsletter/boletin";
import { darDeBaja } from "../modulos/newsletter/servidor";
import type { ConfigNewsletter, EnvNewsletter } from "../modulos/newsletter/config";
import { crearPanel } from "../modulos/panel/index";
import type { EnvPanel } from "../modulos/panel/config";

let pasaron = 0;
async function prueba(nombre: string, fn: () => Promise<void> | void) {
  await fn();
  pasaron++;
  console.log("  ok —", nombre);
}

function kvMemoria() {
  const datos = new Map<string, { v: string | ArrayBuffer; meta?: unknown }>();
  const kv: AlmacenBinario = {
    async get(k) {
      const x = datos.get(k)?.v;
      return typeof x === "string" ? x : null;
    },
    async getWithMetadata(k) {
      const x = datos.get(k);
      return { value: (x?.v ?? null) as never, metadata: (x?.meta ?? null) as never };
    },
    async put(k, v, o) {
      datos.set(k, { v, meta: o?.metadata });
    },
    async delete(k) {
      datos.delete(k);
    },
    async list(o) {
      return { keys: [...datos.keys()].filter((k) => k.startsWith(o?.prefix ?? "")).map((name) => ({ name })) };
    },
  } as AlmacenBinario;
  return { kv, datos };
}

const SECRETO = "s".repeat(40);
const config: ConfigNewsletter = { nombreSitio: "Tienda <Prueba>" };
const ORIGEN = "https://tienda.cl";

async function conSuscriptores(n: number) {
  const { kv, datos } = kvMemoria();
  const env: EnvNewsletter = { REVIEWS_KV: kv, NEWSLETTER_SECRET: SECRETO, RESEND_API_KEY: "re_prueba", ADMIN_NOTIFY_EMAIL: "duena@tienda.cl" };
  for (let i = 0; i < n; i++) {
    const email = `persona${i}@correo.cl`;
    const clave = "news:sub:" + (await hmacSha256Hex(SECRETO, `clave:${email}`)).slice(0, 40);
    await kv.put(clave, JSON.stringify({ email, estado: "activo", creado: "2026-10-01T00:00:00Z", confirmado: "2026-10-01T00:00:00Z" }));
  }
  return { env, datos };
}

/** Resend falso: guarda cada lote; `cupo` correos y después responde 429. */
function resendFalso(cupo = Infinity) {
  const lotes: Record<string, unknown>[][] = [];
  let usados = 0;
  const f = (async (url: string | URL | Request, init?: RequestInit) => {
    assert.equal(String(url), "https://api.resend.com/emails/batch");
    const lote = JSON.parse(String(init?.body)) as Record<string, unknown>[];
    assert.ok(lote.length <= 100, "máximo 100 por llamada");
    if (usados + lote.length > cupo) return new Response('{"message":"daily quota"}', { status: 429 });
    usados += lote.length;
    lotes.push(lote);
    return new Response(JSON.stringify({ data: lote.map((_, i) => ({ id: String(i) })) }), { status: 200 });
  }) as typeof fetch;
  return { f, lotes };
}

function boletin(extra: Partial<Boletin> = {}): Boletin {
  return {
    id: "2026-10-09-0a1b2c3d",
    asunto: "Novedades",
    titulo: "Llegaron gatitos",
    texto: "Hola\n\nNuevos tejidos",
    estado: "borrador",
    creado: "2026-10-09T00:00:00Z",
    actualizado: "2026-10-09T00:00:00Z",
    enviados: 0,
    ...extra,
  };
}

async function run() {
  console.log("Boletines:");

  await prueba("valida: asunto y mensaje obligatorios, botón con enlace seguro", () => {
    assert.equal(validarBoletin({ asunto: "", texto: "" }).ok, false);
    const v = validarBoletin({ asunto: " Hola ", texto: "Texto", boton: { texto: "Ver", enlace: "javascript:alert(1)" } });
    assert.equal(v.ok, false);
    assert.ok(v.errores["boton.enlace"]);
    for (const malo of ["//otro.cl", "http://x.cl", "javascript:x", "/a b", "data:text/html,x"]) assert.equal(enlaceBoletinValido(malo), false, malo);
    for (const bueno of ["/tienda/", "https://instagram.com/x"]) assert.equal(enlaceBoletinValido(bueno), true, bueno);
    assert.equal(validarBoletin({ asunto: "A", texto: "B", imagen: "https://malo.cl/x.jpg" }).ok, false);
    assert.equal(validarBoletin({ asunto: "A", texto: "B", imagen: "/media/../x" }).ok, false);
    const ok = validarBoletin({ asunto: "A", texto: "B", imagen: "/media/boletin-abc123", boton: { texto: "", enlace: "" } });
    assert.equal(ok.ok, true);
    assert.equal(ok.datos!.boton, undefined, "botón vacío = sin botón");
  });

  await prueba("el correo escapa todo lo que escribe la dueña y lleva el enlace de baja", () => {
    const html = correoBoletin(config, { titulo: "<script>x</script>", texto: "a <b>\n\nc", boton: { texto: '"><img onerror=1>', enlace: "/tienda/" } }, ORIGEN, "https://tienda.cl/newsletter/baja?e=AA&t=bb");
    assert.ok(!html.includes("<script>x"));
    assert.ok(!html.includes("<b>"));
    assert.ok(!html.includes('"><img onerror'));
    assert.ok(html.includes("Tienda &lt;Prueba&gt;"));
    assert.ok(html.includes('href="https://tienda.cl/tienda/"'), "enlaces del sitio pasan a absolutos");
    assert.ok(html.includes("Darme de baja"));
    assert.ok(html.includes("https://tienda.cl/newsletter/baja?e=AA&amp;t=bb"));
  });

  await prueba("cabeceras de baja de un clic apuntan a la API con la misma firma", () => {
    const c = cabecerasBaja("https://tienda.cl/newsletter/baja?e=AA&t=bb");
    assert.equal(c["List-Unsubscribe"], "<https://tienda.cl/api/newsletter/baja?e=AA&t=bb>");
    assert.equal(c["List-Unsubscribe-Post"], "List-Unsubscribe=One-Click");
  });

  await prueba("envía uno por persona, cada uno con SU enlace de baja, y el enlace funciona", async () => {
    const { env, datos } = await conSuscriptores(3);
    const { f, lotes } = resendFalso();
    const b = boletin();
    const p = await enviarBoletin(env, config, b, ORIGEN, { fetch: f });
    assert.deepEqual([p.enviados, p.pendientes, p.total], [3, 0, 3]);
    assert.equal(b.estado, "enviado");
    const lote = lotes[0];
    assert.equal(lote.length, 3);
    const enlaces = new Set(lote.map((c) => (c.headers as Record<string, string>)["List-Unsubscribe"]));
    assert.equal(enlaces.size, 3, "un enlace distinto por persona");
    for (const c of lote) assert.equal((c.to as string[]).length, 1, "nadie ve los correos de otros");
    assert.equal(lote[0].reply_to, "duena@tienda.cl");
    // Baja de un clic desde Gmail con la cabecera del primer correo.
    const url = (lote[0].headers as Record<string, string>)["List-Unsubscribe"].slice(1, -1);
    const r = await darDeBaja(new Request(url, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: "List-Unsubscribe=One-Click" }), env);
    assert.equal(r.status, 200);
    assert.equal([...datos.keys()].filter((k) => k.startsWith("news:sub:")).length, 2);
    const guardado = await leerBoletin(env, b.id);
    assert.ok(guardado && !JSON.stringify(guardado).includes("persona0@"), "no guarda los correos, solo huellas");
  });

  await prueba("tope diario de Resend: se detiene y después sigue sin repetirle a nadie", async () => {
    const { env } = await conSuscriptores(150);
    const primero = resendFalso(100);
    const b = boletin();
    const p1 = await enviarBoletin(env, config, b, ORIGEN, { fetch: primero.f, maximo: 1000 });
    assert.equal(p1.enviados, 100);
    assert.equal(p1.pendientes, 50);
    assert.match(p1.detenido!, /límite/);
    assert.equal(b.estado, "enviando");
    const segundo = resendFalso();
    const p2 = await enviarBoletin(env, config, (await leerBoletin(env, b.id))!, ORIGEN, { fetch: segundo.f, maximo: 1000 });
    assert.equal(p2.pendientes, 0);
    assert.equal(p2.enviados, 150);
    const todos = [...primero.lotes, ...segundo.lotes].flat().map((c) => (c.to as string[])[0]);
    assert.equal(new Set(todos).size, 150, "nadie recibió dos veces");
  });

  await prueba("cuenta los correos del día (UTC) y dice a qué hora se reinicia en Chile", async () => {
    const { env } = await conSuscriptores(3);
    const ahora = new Date("2026-10-09T15:00:00Z");
    await enviarBoletin(env, config, boletin(), ORIGEN, { fetch: resendFalso().f, ahora });
    assert.equal(await enviadosHoy(env, ahora), 3);
    assert.equal(await enviadosHoy(env, new Date("2026-10-10T01:00:00Z")), 0, "otro día UTC parte de cero");
    assert.equal(horaReinicio("America/Santiago", ahora), "21:00", "verano: UTC-3");
    assert.equal(horaReinicio("America/Santiago", new Date("2026-07-01T12:00:00Z")), "20:00", "invierno: UTC-4");
  });

  await prueba("sin clave de Resend o sin NEWSLETTER_SECRET no envía", async () => {
    const { env } = await conSuscriptores(1);
    const { f, lotes } = resendFalso();
    await assert.rejects(enviarBoletin({ ...env, RESEND_API_KEY: "" }, config, boletin(), ORIGEN, { fetch: f }), /RESEND_API_KEY/);
    await assert.rejects(enviarBoletin({ ...env, NEWSLETTER_SECRET: "corto" }, config, boletin(), ORIGEN, { fetch: f }), /NEWSLETTER_SECRET/);
    assert.equal(lotes.length, 0);
  });

  await prueba("panel: sin sesión nada; con otro origen no guarda; sin la opción no existe", async () => {
    const { env } = await conSuscriptores(1);
    const penv = { ...env, ADMIN_PEPPER: "p".repeat(40) } as EnvPanel;
    const panel = crearPanel({ nombreSitio: "Tienda", boletines: { ...config, urlPublica: ORIGEN } });
    const req = (cuerpo?: unknown, origen = ORIGEN) =>
      new Request(ORIGEN + "/api/admin/boletines", {
        method: cuerpo ? "POST" : "GET",
        headers: { Origin: origen, "Content-Type": "application/json" },
        body: cuerpo ? JSON.stringify(cuerpo) : undefined,
      });
    assert.equal((await panel.boletines.onRequestGet({ env: penv, request: req() })).status, 401);
    assert.equal((await panel.boletines.onRequestPost({ env: penv, request: req({ accion: "guardar", asunto: "a", texto: "b" }) })).status, 401);
    assert.equal((await panel.boletines.onRequestPost({ env: penv, request: req({ accion: "guardar", asunto: "a", texto: "b" }, "https://malo.cl") })).status, 403);
    // Sin la opción "boletines", la sección no existe.
    const sin = crearPanel({ nombreSitio: "Tienda" });
    assert.equal((await sin.boletines.onRequestGet({ env: penv, request: req() })).status, 404);
  });

  console.log(`\n${pasaron} pruebas pasaron.`);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
