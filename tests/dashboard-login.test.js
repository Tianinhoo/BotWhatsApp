// [ByAntigravity] (BRIEF-024) Tests for rate limiter and Secure cookie
const test = require("node:test");
const assert = require("node:assert");
const { readFileSync } = require("node:fs");
const { resolve } = require("node:path");
const crypto = require("node:crypto");
const vm = require("node:vm");

function createHarness(env = {}) {
  const logs = [];
  const routes = new Map();
  let now = 0;

  const app = {
    get(path, ...handlers) { routes.set(`GET ${path}`, handlers); },
    post(path, ...handlers) { routes.set(`POST ${path}`, handlers); }
  };
  const express = { Router: () => app };

  const dependencies = {
    crypto,
    path: require("node:path"),
    express,
    "../services/whatsapp.service": { sendTextMessage: () => {} },
    "../services/messages.service": { saveMessage: () => {}, bus: { on: () => {} }, getLatestHandoffSummary: () => {}, listHandoffSummaries: () => {} },
    "../services/products.service": { getAllProducts: () => [] },
    "../services/state.service": { resumeBotForClient: () => {} },
    "../services/db": { query: () => Promise.resolve({ rows: [] }) },
    "../services/outbound.service": { sendAndRecord: () => {} },
    "../services/summary.service": { buildHandoffSummary: () => {} },
    "../services/logger.service": { safeError: e => e.message, redactPhone: phone => `***${phone.slice(-4)}` }
  };

  const filename = resolve(__dirname, "../src/routes/dashboard.js");
  const code = readFileSync(filename, "utf8");

  // Mock global objects
  vm.runInNewContext(code, {
    require(name) {
      if (!dependencies[name]) throw new Error(`Missing mock for ${name}`);
      return dependencies[name];
    },
    module: { exports: {} },
    process: { env },
    Buffer,
    Date: class extends Date { static now() { return now; } },
    __dirname: resolve(__dirname, "../src/routes"),
    console: {
      log: (...args) => logs.push({ level: "log", msg: args.join(" ") }),
      warn: (...args) => logs.push({ level: "warn", msg: args.join(" ") }),
      error: (...args) => logs.push({ level: "error", msg: args.join(" ") })
    }
  }, { filename });

  async function login(ip, password) {
    const handlers = routes.get("POST /dashboard/login");
    if (!handlers) throw new Error("Route not found");

    const req = { ip, body: { password }, connection: { remoteAddress: ip } };
    const resHeaders = {};
    const result = {};
    const res = {
      status(code) { result.status = code; return this; },
      json(body) { result.body = body; return this; },
      setHeader(k, v) { resHeaders[k] = v; return this; }
    };

    async function run(idx) {
      if (!handlers[idx]) return;
      await handlers[idx](req, res, () => run(idx + 1));
    }
    await run(0);
    return { ...result, headers: resHeaders };
  }

  return { login, logs, advance: ms => { now += ms; } };
}

test("BRIEF-024: Dashboard hardening tests", async (t) => {
  await t.test("5 intentos consecutivos -> 5to es 401, 6to es 429", async () => {
    const h = createHarness({ DASHBOARD_PASSWORD: "correct", NODE_ENV: "test" });
    const ip = "1.1.1.1";
    
    for (let i = 0; i < 5; i++) {
      const res = await h.login(ip, "wrong");
      assert.strictEqual(res.status, 401);
    }
    const res6 = await h.login(ip, "wrong");
    assert.strictEqual(res6.status, 429);
    assert.strictEqual(res6.body.error, "Demasiados intentos. Intenta más tarde.");
  });

  await t.test("Intento correcto durante bloqueo -> 429", async () => {
    const h = createHarness({ DASHBOARD_PASSWORD: "correct", NODE_ENV: "test" });
    const ip = "2.2.2.2";
    for (let i = 0; i < 5; i++) await h.login(ip, "wrong");
    const res = await h.login(ip, "correct");
    assert.strictEqual(res.status, 429);
  });

  await t.test("Bloqueo expira a los 10 min", async () => {
    const h = createHarness({ DASHBOARD_PASSWORD: "correct", NODE_ENV: "test" });
    const ip = "3.3.3.3";
    for (let i = 0; i < 5; i++) await h.login(ip, "wrong"); // block
    h.advance(10 * 60 * 1000 + 1); // pass 10 minutes
    const res = await h.login(ip, "wrong");
    assert.strictEqual(res.status, 401); // Can try again, but it's wrong so 401
  });

  await t.test("Ventana 5 min expira sin llegar a 5 fallos", async () => {
    const h = createHarness({ DASHBOARD_PASSWORD: "correct", NODE_ENV: "test" });
    const ip = "4.4.4.4";
    await h.login(ip, "wrong");
    await h.login(ip, "wrong");
    h.advance(5 * 60 * 1000 + 1);
    // Ahora hacemos 4 intentos más. Si no se hubiera reseteado, el 3ro habría bloqueado.
    assert.strictEqual((await h.login(ip, "wrong")).status, 401);
    assert.strictEqual((await h.login(ip, "wrong")).status, 401);
    assert.strictEqual((await h.login(ip, "wrong")).status, 401);
    assert.strictEqual((await h.login(ip, "wrong")).status, 401);
  });

  await t.test("Password correcto limpia el contador", async () => {
    const h = createHarness({ DASHBOARD_PASSWORD: "correct", NODE_ENV: "test" });
    const ip = "5.5.5.5";
    await h.login(ip, "wrong");
    await h.login(ip, "wrong");
    await h.login(ip, "correct");
    // Ahora podemos equivocarnos 4 veces seguidas sin 429
    for (let i = 0; i < 4; i++) {
      assert.strictEqual((await h.login(ip, "wrong")).status, 401);
    }
    assert.strictEqual((await h.login(ip, "wrong")).status, 401); // 5th is 401
    assert.strictEqual((await h.login(ip, "wrong")).status, 429); // 6th is 429
  });

  await t.test("Set-Cookie NO incluye Secure en dev/test", async () => {
    const h = createHarness({ DASHBOARD_PASSWORD: "correct", NODE_ENV: "test" });
    const res = await h.login("1.2.3.4", "correct");
    assert.ok(res.headers["Set-Cookie"]);
    assert.strictEqual(res.headers["Set-Cookie"].includes("Secure"), false);
  });

  await t.test("Set-Cookie incluye Secure en production", async () => {
    const h = createHarness({ DASHBOARD_PASSWORD: "correct", NODE_ENV: "production" });
    const res = await h.login("1.2.3.4", "correct");
    assert.ok(res.headers["Set-Cookie"]);
    assert.ok(res.headers["Set-Cookie"].includes("Secure"));
  });

  await t.test("Cada IP tiene su propio contador", async () => {
    const h = createHarness({ DASHBOARD_PASSWORD: "correct", NODE_ENV: "test" });
    for (let i = 0; i < 5; i++) await h.login("10.0.0.1", "wrong");
    assert.strictEqual((await h.login("10.0.0.1", "wrong")).status, 429);
    assert.strictEqual((await h.login("10.0.0.2", "wrong")).status, 401); // other ip still works
  });
});
