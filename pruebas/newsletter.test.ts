/**
 * Prueba del newsletter: intenta romperlo. Fetch interceptado (Turnstile y
 * Resend falsos) y KV en memoria. Se corre con `npm test`.
 */
import assert from "node:assert/strict";
import type { AlmacenKV } from "../core/tipos";
import {
  confirmar,
  darDeBaja,
  exportar,
  suscribir,
  enlaceBaja,
  celdaCsv,
  codificarEmail,
  PREFIJO_SUSCRIPTOR,
} from "../modulos/newsletter/servidor";
import type { ConfigNewsletter, EnvNewsletter } from "../modulos/newsletter/config";

let pasaron = 0;
async function prueba(nombre: string, fn: () => Promise<void> | void) {
  await fn();
  pasaron++;
  console.log("  ok —", nombre);
}

function kvMemoria() {
  const datos = new Map<string, string>();
  const kv: AlmacenKV = {
    async get(k) { return datos.get(k) ?? null; },
    async put(k, v) { datos.set(k, v); },
    async delete(k) { datos.delete(k); },
    async list(o) {
      return { keys: [...datos.keys()].filter((k) => k.startsWith(o?.prefix ?? "")).map((name) => ({ name })) };
    },
  };
  return { kv, datos };
}

const correos: { para: string; html: string }[] = [];
globalThis.fetch = (async (entrada: string | URL | Request, init?: RequestInit) => {
  const url = String(entrada instanceof Request ? entrada.url : entrada);
  if (url.includes("turnstile")) {
    const token = (init?.body as URLSearchParams).get("response");
    return new Response(JSON.stringify({ success: token === "humano" }));
  }
  if (url.includes("api.resend.com")) {
    const b = JSON.parse(String(init?.body));
    correos.push({ para: b.to[0], html: b.html });
    return new Response("{}", { status: 200 });
  }
  throw new Error("fetch inesperado: " + url);
}) as typeof fetch;

const SECRETO = "s".repeat(40);
const TOKEN_EXPORT = "x".repeat(40);
const config: ConfigNewsletter = { nombreSitio: "Tienda Prueba" };

function entorno(): { env: EnvNewsletter; datos: Map<string, string> } {
  const { kv, datos } = kvMemoria();
  return {
    datos,
    env: {
      REVIEWS_KV: kv,
      NEWSLETTER_SECRET: SECRETO,
      NEWSLETTER_EXPORT_TOKEN: TOKEN_EXPORT,
      TURNSTILE_SECRET_KEY: "t",
      RESEND_API_KEY: "re_prueba",
    },
  };
}

const pedir = (ruta: string, cuerpo: unknown, extra: Record<string, string> = {}) =>
  new Request("https://tienda.cl" + ruta, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: "https://tienda.cl", ...extra },
    body: JSON.stringify(cuerpo),
  });

const valido = { email: "Ana@Correo.cl ", aceptaPolitica: true, turnstileToken: "humano" };

function enlaceDelCorreo(): URL {
  const html = correos.at(-1)!.html;
  const href = html.match(/href="([^"]+)"/)![1].replace(/&amp;/g, "&");
  return new URL(href);
}

async function run() {
  console.log("Newsletter:");

  await prueba("suscribe en pendiente y manda el correo de confirmación al suscriptor", async () => {
    const { env, datos } = entorno();
    const r = await suscribir(pedir("/api/newsletter/suscribir", valido), env, config);
    assert.equal(r.status, 200);
    assert.equal(correos.at(-1)!.para, "ana@correo.cl");
    const reg = JSON.parse([...datos.entries()].find(([k]) => k.startsWith(PREFIJO_SUSCRIPTOR))![1]);
    assert.equal(reg.estado, "pendiente");
  });

  await prueba("la clave en KV no deja el correo a la vista", async () => {
    const { env, datos } = entorno();
    await suscribir(pedir("/api/newsletter/suscribir", valido), env, config);
    for (const k of datos.keys()) assert.ok(!k.includes("ana"), k);
  });

  await prueba("confirma con el enlace del correo y queda activo", async () => {
    const { env, datos } = entorno();
    await suscribir(pedir("/api/newsletter/suscribir", valido), env, config);
    const u = enlaceDelCorreo();
    const r = await confirmar(
      pedir("/api/newsletter/confirmar", { e: u.searchParams.get("e"), v: Number(u.searchParams.get("v")), t: u.searchParams.get("t") }),
      env, config
    );
    assert.equal(r.status, 200);
    const reg = JSON.parse([...datos.entries()].find(([k]) => k.startsWith(PREFIJO_SUSCRIPTOR))![1]);
    assert.equal(reg.estado, "activo");
  });

  await prueba("no confirma con firma falsa, otro correo o enlace vencido", async () => {
    const { env } = entorno();
    await suscribir(pedir("/api/newsletter/suscribir", valido), env, config);
    const u = enlaceDelCorreo();
    const v = Number(u.searchParams.get("v"));
    const t = u.searchParams.get("t")!;
    const falsa = await confirmar(pedir("/x", { e: u.searchParams.get("e"), v, t: "0".repeat(64) }), env, config);
    assert.equal(falsa.status, 400);
    const otro = await confirmar(pedir("/x", { e: codificarEmail("otro@correo.cl"), v, t }), env, config);
    assert.equal(otro.status, 400);
    const alargado = await confirmar(pedir("/x", { e: u.searchParams.get("e"), v: v + 999999, t }), env, config);
    assert.equal(alargado.status, 400);
  });

  await prueba("rechaza sin Turnstile válido o sin aceptar la política", async () => {
    const { env } = entorno();
    const bot = await suscribir(pedir("/x", { ...valido, turnstileToken: "bot" }), env, config);
    assert.equal(bot.status, 400);
    const sinPolitica = await suscribir(pedir("/x", { ...valido, aceptaPolitica: false }), env, config);
    assert.equal(sinPolitica.status, 400);
  });

  await prueba("honeypot: responde igual pero no guarda ni envía", async () => {
    const { env, datos } = entorno();
    const antes = correos.length;
    const r = await suscribir(pedir("/x", { ...valido, sitio_web: "spam" }), env, config);
    assert.equal(r.status, 200);
    assert.equal(datos.size, 0);
    assert.equal(correos.length, antes);
  });

  await prueba("no revela si un correo ya está suscrito (misma respuesta)", async () => {
    const { env } = entorno();
    const a = await (await suscribir(pedir("/x", valido), env, config)).json();
    const b = await (await suscribir(pedir("/x", valido), env, config)).json();
    assert.deepEqual(a, b);
  });

  await prueba("no deja bombardear un buzón: máximo 3 correos al día por dirección", async () => {
    const { env } = entorno();
    const antes = correos.length;
    for (let i = 0; i < 6; i++) {
      await suscribir(pedir("/x", valido, { "CF-Connecting-IP": `10.0.0.${i}` }), env, config);
    }
    assert.equal(correos.length - antes, 3);
  });

  await prueba("rechaza otro origen", async () => {
    const { env } = entorno();
    const r = await suscribir(pedir("/x", valido, { Origin: "https://malo.com" }), env, config);
    assert.equal(r.status, 403);
  });

  await prueba("sin NEWSLETTER_SECRET (o muy corto) falla cerrado", async () => {
    const { env } = entorno();
    env.NEWSLETTER_SECRET = "corto";
    const r = await suscribir(pedir("/x", valido), env, config);
    assert.equal(r.status, 503);
  });

  await prueba("baja con enlace firmado; firma falsa no da de baja", async () => {
    const { env, datos } = entorno();
    await suscribir(pedir("/x", valido), env, config);
    const enlace = new URL((await enlaceBaja(env, "https://tienda.cl", "ana@correo.cl"))!);
    const falsa = await darDeBaja(pedir("/x", { e: enlace.searchParams.get("e"), t: "f".repeat(64) }), env);
    assert.equal(falsa.status, 400);
    assert.equal(datos.size > 0, true);
    const ok = await darDeBaja(pedir("/x", { e: enlace.searchParams.get("e"), t: enlace.searchParams.get("t") }), env);
    assert.equal(ok.status, 200);
    assert.equal([...datos.keys()].some((k) => k.startsWith(PREFIJO_SUSCRIPTOR)), false);
  });

  await prueba("baja de un clic desde el programa de correo (RFC 8058)", async () => {
    const { env } = entorno();
    const enlace = (await enlaceBaja(env, "https://tienda.cl", "ana@correo.cl"))!;
    const r = await darDeBaja(
      new Request(enlace, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: "List-Unsubscribe=One-Click" }),
      env
    );
    assert.equal(r.status, 200);
  });

  await prueba("exportar exige el token y solo lista activos", async () => {
    const { env } = entorno();
    await suscribir(pedir("/x", valido), env, config);
    const sin = await exportar(new Request("https://tienda.cl/api/newsletter/exportar"), env);
    assert.equal(sin.status, 401);
    const malo = await exportar(new Request("https://tienda.cl/x", { headers: { Authorization: "Bearer " + "y".repeat(40) } }), env);
    assert.equal(malo.status, 401);
    const pendiente = await exportar(new Request("https://tienda.cl/x", { headers: { Authorization: "Bearer " + TOKEN_EXPORT } }), env);
    assert.equal((await pendiente.text()).trim(), "email,confirmado");
    const u = enlaceDelCorreo();
    await confirmar(pedir("/x", { e: u.searchParams.get("e"), v: Number(u.searchParams.get("v")), t: u.searchParams.get("t") }), env, config);
    const activo = await (await exportar(new Request("https://tienda.cl/x", { headers: { Authorization: "Bearer " + TOKEN_EXPORT } }), env)).text();
    assert.ok(activo.includes('"ana@correo.cl"'));
  });

  await prueba("el CSV neutraliza fórmulas", () => {
    assert.equal(celdaCsv("=HYPERLINK(1)"), `"'=HYPERLINK(1)"`);
    assert.equal(celdaCsv('a"b'), `"a""b"`);
  });

  console.log(`\n${pasaron} pruebas pasaron.`);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
