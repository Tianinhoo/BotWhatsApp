// [ByCodex] (BRIEF-022) App real en VM con crypto real, reloj controlado y servicios aislados.
const { readFileSync } = require("node:fs");
const { resolve } = require("node:path");
const crypto = require("node:crypto");
const vm = require("node:vm");

// [ByCodex] (BRIEF-026) Overrides para integrar cola y motor reales sin red.
function appHarness({ env = { NODE_ENV: "test" }, query, listenCalls = [], overrides = {} } = {}) {
  const routes = new Map();
  const logs = [], calls = [], queries = [], timers = [];
  let jsonOptions;
  let now = 0;
  const app = {
    use() {},
    get(path, ...handlers) { routes.set(`GET ${path}`, handlers); },
    post(path, ...handlers) { routes.set(`POST ${path}`, handlers); },
    listen(port) { listenCalls.push(port); }
  };
  const express = Object.assign(() => app, {
    json(options) { jsonOptions = options; return () => {}; }
  });
  const record = name => async (...args) => { calls.push({ name, args }); };
  const dependencies = {
    dotenv: { config() {} },
    crypto,
    express,
    "./routes/dashboard": () => {},
    // [ByCodex] (BRIEF-026) Usar la cola real tambien en pruebas HMAC/dedup.
    "./services/queue.service": require("../../src/services/queue.service"),
    "./services/db": {
      query(sql) {
        queries.push(sql);
        return query ? query(sql) : Promise.resolve({ rows: [{ "?column?": 1 }] });
      }
    },
    "./services/dedup.service": {
      async tryClaimMessage(...args) {
        calls.push({ name: "tryClaimMessage", args });
        return true;
      }
    },
    "./services/messages.service": { saveMessage: record("saveMessage") },
    "./services/state.service": {
      STATES: { ORGANIC: "ORGANIC", PAUSED_HUMAN: "PAUSED_HUMAN" },
      registerTraffic: record("registerTraffic"),
      async getUserState(...args) {
        calls.push({ name: "getUserState", args });
        return "ORGANIC";
      },
      extractSelection: message => message.text?.body || "",
      resolveMenuOption: () => null,
      requestedMenu: () => false,
      processMenuOption: record("processMenuOption"),
      greetAndShowMenu: record("greetAndShowMenu"),
      showMenu: record("showMenu")
    },
    "./services/logger.service": {
      redactPhone: phone => `***${phone.slice(-4)}`,
      safeError: error => error.message
    }
  };
  // [ByCodex] (BRIEF-026) Solo sustituir dependencias explicitamente pedidas.
  Object.assign(dependencies, overrides);
  const filename = resolve(__dirname, "../../src/app.js");
  vm.runInNewContext(readFileSync(filename, "utf8"), {
    require(name) {
      if (!Object.hasOwn(dependencies, name)) {
        throw new Error(`Dependencia de app.js sin simular: ${name}`);
      }
      return dependencies[name];
    },
    process: { env: { ...env } },
    Buffer,
    Date: class extends Date { static now() { return now; } },
    setTimeout(callback, delay) {
      const timer = { callback, delay, due: now + delay, fired: false };
      timers.push(timer);
      return timer;
    },
    clearTimeout(timer) { timer.fired = true; },
    console: Object.fromEntries(["log", "warn", "error"].map(level => [level,
      (...args) => logs.push({ level, message: args.join(" ") })]))
  }, { filename });

  async function dispatch(method, path, rawBody, headers = {}) {
    const handlers = routes.get(`${method} ${path}`);
    if (!handlers) throw new Error(`Ruta no registrada: ${method} ${path}`);
    const req = { headers };
    if (rawBody !== undefined) {
      // Ejecuta también el verify real de express.json: la firma usa los bytes recibidos.
      jsonOptions.verify(req, {}, rawBody);
      req.body = JSON.parse(rawBody.toString("utf8"));
    }
    const result = { status: 200, writes: 0 };
    const res = {
      status(code) { result.status = code; return this; },
      sendStatus(code) { result.status = code; result.writes++; return this; },
      json(body) {
        result.body = JSON.parse(JSON.stringify(body));
        result.writes++;
        return this;
      }
    };
    async function run(index) {
      if (!handlers[index]) return;
      let downstream;
      await handlers[index](req, res, () => { downstream = run(index + 1); });
      if (downstream) await downstream;
    }
    await run(0);
    return result;
  }

  async function advance(milliseconds) {
    now += milliseconds;
    for (const timer of timers.filter(timer => !timer.fired && timer.due <= now)) {
      timer.fired = true;
      timer.callback();
    }
    await Promise.resolve();
  }

  return { logs, calls, queries, timers, listenCalls, advance,
    webhook: (rawBody, headers) => dispatch("POST", "/webhook", rawBody, headers),
    health: () => dispatch("GET", "/health") };
}

function incomingBody() {
  return Buffer.from(JSON.stringify({ entry: [{ changes: [{ value: { messages: [{
    id: "wamid.hmac.test", from: "00000001234", type: "text", text: { body: "hola" }
  }] } }] }] }));
}

function sign(rawBody, secret) {
  return `sha256=${crypto.createHmac("sha256", secret).update(rawBody).digest("hex")}`;
}

module.exports = { appHarness, incomingBody, sign };
