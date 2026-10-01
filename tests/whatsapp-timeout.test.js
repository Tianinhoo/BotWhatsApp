// [ByCodex] (BRIEF-030) Cancelacion determinista: no usa red ni esperas reales.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function harness({ pending = false, reject = false } = {}) {
  const calls = [], timers = [];
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../src/services/whatsapp.service.js"), "utf8"), {
    module, AbortController, process: { env: {} },
    console: { error() {} },
    require(name) {
      if (name === "./logger.service") return { safeError: () => "redacted" };
      if (name === "node:timers") return {
        setTimeout(fn, ms) { const t = { fn, ms, cleared: false, unref() {} }; timers.push(t); return t; },
        clearTimeout(t) { t.cleared = true; }
      };
      if (name === "axios") return { post(url, payload, options) {
        calls.push({ payload, options });
        if (pending) return new Promise((resolve, reject) => options.signal.addEventListener("abort", () =>
          reject(Object.assign(new Error("aborted"), { code: "ERR_CANCELED" })), { once: true }));
        if (reject) return Promise.reject(new Error("rejected"));
        return Promise.resolve({ data: { messages: [{ id: "fake" }] } });
      } };
      throw new Error(name);
    }
  });
  return { wa: module.exports, calls, timers };
}
const operations = [
  wa => wa.sendTextMessage("test", "hola"),
  wa => wa.sendImageMessage("test", "fake"),
  wa => wa.sendMainMenu("test"),
  wa => wa.sendButtonMessage({ to: "test", body: "hola", buttons: [] })
];
test("todos los envios abortan a los 8s, propagan incertidumbre y no reintentan", async () => {
  for (const send of operations) {
    const h = harness({ pending: true });
    const running = send(h.wa);
    const check = assert.rejects(running, { code: "ERR_CANCELED" });
    assert.equal(h.calls[0].options.timeout, 8000);
    assert.equal(h.timers[0].ms, 8000);
    assert.equal(h.calls[0].options.signal.aborted, false);
    h.timers[0].fn();
    await check;
    assert.equal(h.calls[0].options.signal.aborted, true);
    assert.equal(h.timers[0].cleared, true);
    assert.equal(h.calls.length, 1);
  }
});
test("envio aceptado o rechazado limpia el temporizador de cancelacion", async () => {
  for (const reject of [false, true]) {
    const h = harness({ reject });
    if (reject) await assert.rejects(h.wa.sendTextMessage("test", "hola"), /rejected/);
    else assert.equal((await h.wa.sendTextMessage("test", "hola")).messages[0].id, "fake");
    assert.equal(h.timers[0].cleared, true);
    assert.equal(h.calls[0].options.signal.aborted, false);
  }
});
