// [ByCodex] (BRIEF-011 / BRIEF-016) Servicios reales, transporte simulado y BD inyectable.
const { readFileSync } = require("node:fs");
const { resolve } = require("node:path");
const { createRequire } = require("node:module");
const vm = require("node:vm");

function load(file, deps, logs) {
  const filename = resolve(__dirname, "../..", file);
  const nativeRequire = createRequire(filename);
  const module = { exports: {} };
  vm.runInNewContext(readFileSync(filename, "utf8"), {
    // [ByCodex] (BRIEF-030) Cancelacion real en el transporte simulado.
    AbortController,
    module, exports: module.exports, process: { env: {} },
    require: name => Object.hasOwn(deps, name) ? deps[name] : nativeRequire(name),
    console: Object.fromEntries(["log", "warn", "error"].map(name =>
      [name, (...args) => logs.push(args.join(" "))]))
  }, { filename });
  return module.exports;
}

function fixture({ rejectAt = 1, noResponse = false, historyFailure = false, db } = {}) {
  const rows = [], writes = [], calls = [], logs = [], events = [];
  let catalogMarked = 0;
  const failure = new Error("Transporte simulado");
  if (!noResponse) failure.response = { status: 400, data: { error: { code: 190 } } };
  const pool = db || { async query(sql, params) {
    if (/INSERT INTO mensajes\s*\(/.test(sql)) {
      if (historyFailure) throw new Error("Historial inaccesible");
      rows.push({ telefono: params[0], origen: params[1], contenido: params[2], estado_envio: params[3] });
    } else if (/INSERT|UPDATE/.test(sql)) writes.push({ sql, params });
    return { rows: /RETURNING/.test(sql) ? [{ id: 1, created_at: new Date() }] : [], rowCount: 1 };
  } };
  const wa = load("src/services/whatsapp.service.js", { axios: {
    async post(url, payload) {
      calls.push(payload);
      if (calls.length === rejectAt) throw failure;
      return { data: { messages: [{ id: `wamid.mock.${calls.length}` }] } };
    }
  } }, logs);
  const messages = load("src/services/messages.service.js", { "./db": pool }, logs);
  messages.bus.on("message", event => events.push(event));
  const outbound = load("src/services/outbound.service.js", { "./messages.service": messages }, logs);
  const state = load("src/services/state.service.js", {
    "./db": pool, "./whatsapp.service": wa, "./messages.service": messages,
    "./outbound.service": outbound,
    "./catalog-state.service": {
      hasReceivedCatalog: async () => false,
      markCatalogSent: async () => { catalogMarked++; }
    }
  }, logs);
  const routes = new Map();
  const router = {
    get(path, ...handlers) { routes.set(`GET ${path}`, handlers.at(-1)); },
    post(path, ...handlers) { routes.set(`POST ${path}`, handlers.at(-1)); }
  };
  load("src/routes/dashboard.js", {
    express: { Router: () => router }, "../services/db": pool,
    "../services/whatsapp.service": wa, "../services/messages.service": messages,
    "../services/outbound.service": outbound, "../services/state.service": state,
    "../services/products.service": {}
  }, logs);
  async function reply(phone = "test-phone", text = "Respuesta de prueba") {
    const result = { status: 200 };
    const res = { status(code) { result.status = code; return this; }, json(body) { result.body = body; } };
    await routes.get("POST /dashboard/api/conversation/:phone/reply")(
      { params: { phone }, body: { text } }, res);
    return result;
  }
  return { wa, messages, outbound, state, reply, rows, writes, calls, logs, events,
    catalogMarked: () => catalogMarked };
}

module.exports = { fixture };
