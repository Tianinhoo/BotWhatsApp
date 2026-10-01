// [ByCodex] (BRIEF-026) Cola real con reloj controlado; sin BD ni red.
const assert = require("node:assert/strict");
const { test } = require("node:test");
const { readFileSync } = require("node:fs");
const { resolve } = require("node:path");
const vm = require("node:vm");
const logger = require("../src/services/logger.service");

function deferred() {
  let resolve;
  const promise = new Promise(r => { resolve = r; });
  return { promise, resolve };
}
const tick = () => new Promise(resolve => setImmediate(resolve));

function harness() {
  let now = 0;
  const timers = new Set(), logs = [];
  const module = { exports: {} };
  const context = vm.createContext({
    module, Date: { now: () => now },
    require(name) { assert.equal(name, "./logger.service"); return logger; },
    console: { warn(message) { logs.push(message); } },
    setTimeout(callback, delay) {
      const timer = { callback, due: now + delay, unref() {} };
      timers.add(timer);
      return timer;
    },
    clearTimeout(timer) { timers.delete(timer); }
  });
  const filename = resolve(__dirname, "../src/services/queue.service.js");
  vm.runInContext(readFileSync(filename, "utf8"), context, { filename });
  return {
    run: module.exports.processInOrder,
    drain: module.exports.drain,
    logs, timers,
    // Inspeccion interna acotada para verificar GC sin exponer la Map al bot.
    size: () => vm.runInContext("inflight.size", context),
    advance(ms) {
      now += ms;
      for (const timer of [...timers]) {
        if (timer.due <= now) { timers.delete(timer); timer.callback(); }
      }
    }
  };
}

test("cola: FIFO y GC no borra un sucesor todavia activo", async () => {
  const q = harness(), a = deferred(), b = deferred(), events = [];
  const first = q.run("00001", async () => { events.push("A"); await a.promise; return 1; });
  const second = q.run("00001", async () => { events.push("B"); await b.promise; return 2; });
  const third = q.run("00001", () => { events.push("C"); return 3; });
  try {
    await tick();
    assert.deepEqual(events, ["A"]);
    assert.equal(q.size(), 1);
    a.resolve();
    assert.equal(await first, 1);
    await tick();
    assert.deepEqual(events, ["A", "B"]);
    assert.equal(q.size(), 1);
    // Nueva llegada mientras B espera: no puede saltarse B y C por un GC temprano.
    const fourth = q.run("00001", () => { events.push("D"); return 4; });
    b.resolve();
    assert.deepEqual(await Promise.all([second, third, fourth]), [2, 3, 4]);
    await tick();
    assert.deepEqual(events, ["A", "B", "C", "D"]);
    assert.equal(q.size(), 0);
    assert.equal(q.timers.size, 0);
  } finally { a.resolve(); b.resolve(); await Promise.allSettled([first, second, third]); }
});

test("cola: clientes distintos avanzan en paralelo", async () => {
  const q = harness(), gate = deferred(), events = [];
  const first = q.run("00001", async () => { events.push("A:start"); await gate.promise; events.push("A:end"); });
  const other = q.run("00002", () => { events.push("B:end"); });
  try {
    await other;
    assert.deepEqual(events, ["A:start", "B:end"]);
  } finally { gate.resolve(); await first; }
});

for (const asynchronous of [false, true]) {
  test("cola: fallo " + (asynchronous ? "asincrono" : "sincrono") + " llega al llamador y no salta B/C", async () => {
    const q = harness(), events = [], failure = new Error("fallo esperado");
    const first = q.run("00001", () => {
      events.push("A");
      if (asynchronous) return Promise.reject(failure);
      throw failure;
    });
    const rejected = assert.rejects(first, error => error === failure);
    const second = q.run("00001", () => { events.push("B"); return "ok B"; });
    const third = q.run("00001", () => { events.push("C"); return "ok C"; });
    await rejected;
    assert.deepEqual(await Promise.all([second, third]), ["ok B", "ok C"]);
    // node:test tambien falla si una rama interna de limpieza rechaza sin manejarse.
    await tick();
    assert.deepEqual(events, ["A", "B", "C"]);
    assert.equal(q.size(), 0);
    assert.equal(q.timers.size, 0);
  });
}

test("cola: aviso a los 10s no libera trabajo lento ni filtra telefono", async () => {
  const q = harness(), gate = deferred();
  let state = "MENU", secondStarted = false;
  const first = q.run("00000001234", async () => { await gate.promise; state = "CATALOG"; });
  const second = q.run("00000001234", () => { secondStarted = true; state = "PAUSED_HUMAN"; });
  try {
    await tick();
    q.advance(9999);
    assert.equal(q.logs.length, 0);
    q.advance(1);
    assert.equal(q.logs.length, 1);
    assert.equal(q.logs[0], "[queue] slow_link phone=***1234 duration_ms=10000");
    assert.equal(q.logs[0].includes("00000001234"), false);
    q.advance(60000);
    await tick();
    assert.equal(secondStarted, false);
    assert.equal(state, "MENU");
    assert.equal(q.logs.length, 1);
  } finally { gate.resolve(); await Promise.all([first, second]); }
  assert.equal(state, "PAUSED_HUMAN");
  assert.equal(q.timers.size, 0);
});

test("cola: trabajo terminado cancela aviso y libera claves tras exito o fallo", async () => {
  const q = harness();
  await Promise.all(Array.from({ length: 30 }, (_, i) => {
    const result = q.run(String(i), () => { if (i % 2) throw new Error("fallo"); return i; });
    return i % 2 ? assert.rejects(result, /fallo/) : result;
  }));
  await tick();
  assert.equal(q.size(), 0);
  assert.equal(q.timers.size, 0);
  q.advance(100000);
  assert.equal(q.logs.length, 0);
  assert.equal(await q.run("1", () => "recuperado"), "recuperado");
});

// [ByClaude] (BRIEF-032) Shutdown limpio depende de drain() esperando la FIFO.
test("drain: espera a que la cola FIFO termine antes de resolver", async () => {
  const q = harness(), a = deferred(), b = deferred(), events = [];
  const first = q.run("00001", async () => { events.push("A"); await a.promise; events.push("A-end"); });
  const second = q.run("00001", async () => { events.push("B"); await b.promise; events.push("B-end"); });
  const third = q.run("00002", async () => { events.push("C"); return "done"; });
  await tick();
  // drain no debe resolver hasta que todas las cadenas terminen.
  let drained = false;
  const drainPromise = q.drain().then(() => { drained = true; });
  await tick();
  assert.equal(drained, false);
  // El de otro telefono termina solo; no influye en los dos del 00001.
  await third;
  await tick();
  assert.equal(drained, false);
  a.resolve();
  await first;
  await tick();
  assert.equal(drained, false);
  b.resolve();
  await second;
  await drainPromise;
  assert.equal(drained, true);
  assert.deepEqual(events, ["A", "C", "A-end", "B", "B-end"]);
});

test("drain: cola vacia resuelve inmediatamente", async () => {
  const q = harness();
  assert.equal(q.size(), 0);
  await q.drain(); // no cuelga
});

test("drain: no rechaza aunque los trabajos encolados fallen", async () => {
  const q = harness();
  const failing = q.run("00001", () => Promise.reject(new Error("boom")));
  const okWork = q.run("00002", () => "ok");
  await assert.rejects(failing, /boom/);
  await okWork;
  await q.drain(); // debe resolver, no propagar el fallo del primero
});
