// [ByCodex] (BRIEF-027) Durabilidad, dedup, recuperacion y resultados inciertos.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { memoryInbox } = require("./helpers/inbox-harness");
const { appHarness } = require("./helpers/app-harness");
function item(id, phone = "00000000123", text = "hola") {
  return { message: { id, from: phone, type: "text", text: { body: text } }, value: {} };
}
function deferred() { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; }
const tick = () => new Promise(r => setImmediate(r));
test("no confirma ni procesa hasta COMMIT; todo el lote queda persistido", async () => {
  const gate = deferred(); const received = [];
  const h = memoryInbox({ beforePersist: () => gate.promise });
  h.start(async (value, message) => received.push(message.id));
  let acknowledged = false;
  const request = h.receive([item("a"), item("b")]).then(r => { acknowledged = true; return r.done; });
  await tick();
  assert.equal(acknowledged, false); assert.deepEqual(received, []);
  gate.resolve(); await request;
  assert.deepEqual(received, ["a", "b"]);
  assert.equal(h.records.get("a").estado, "completado");
});
test("fallo de COMMIT revierte lote y webhook devuelve 503 sin responder al cliente", async () => {
  const h = memoryInbox({ failPersist: true });
  const app = appHarness({ overrides: { "./services/inbox.service": { createInbox: () => h } } });
  const payload = { entry: [{ changes: [{ value: { messages: [item("a").message, item("b").message] } }] }] };
  assert.equal((await app.webhook(Buffer.from(JSON.stringify(payload)))).status, 503);
  assert.equal(h.records.size, 0);
  assert.equal(app.calls.length, 0);
  assert.ok(h.queries.includes("ROLLBACK"));
});
test("duplicado simultaneo no reemplaza payload ni repite efectos", async () => {
  const h = memoryInbox(), seen = [];
  h.start(async (value, message) => seen.push(message.text.body));
  const receipts = await Promise.all([h.receive([item("a", undefined, "original")]), h.receive([item("a", undefined, "alterado")])]);
  await Promise.all(receipts.map(r => r.done));
  assert.deepEqual(seen, ["original"]); assert.equal(h.records.size, 1);
});
test("fallo parcial queda en revision; sucesor durable espera, otro telefono avanza", async () => {
  const h = memoryInbox(), seen = [];
  h.start(async (value, message) => { seen.push(message.id); if (message.id === "a") throw new Error("envio incierto"); });
  await (await h.receive([item("a"), item("b"), item("c", "00000000456")])).done;
  assert.deepEqual(seen, ["a", "c"]);
  assert.equal(h.records.get("a").estado, "revision");
  assert.equal(h.records.get("b").estado, "recibido");
  await h.recover();
  assert.deepEqual(seen, ["a", "c"]);
});
test("reinicio recupera solo no iniciados; en curso queda revision y bloquea su telefono", async () => {
  const h = memoryInbox(), seen = [];
  for (const [id, phone, status, index] of [["a","1","procesando",1],["b","1","recibido",2],["c","2","recibido",3]]) {
    h.records.set(id, { id: index, wamid:id, telefono:phone, estado:status, payload:item(id,phone) });
  }
  h.start(async (value, message) => seen.push(message.id));
  await h.recover();
  assert.deepEqual(seen, ["c"]); assert.equal(h.records.get("a").estado, "revision");
  assert.equal(h.records.get("b").estado, "recibido");
});
test("recepciones viejas requieren revision en vez de respuesta tardia automatica", async () => {
  const h = memoryInbox(), seen = [];
  h.records.set("old", { id:1, wamid:"old", telefono:"1", estado:"recibido", stale:true, payload:item("old","1") });
  h.start(async (v,m) => seen.push(m.id)); await h.recover();
  assert.deepEqual(seen, []); assert.equal(h.records.get("old").estado, "revision");
});
test("sin wamid se rechaza antes de persistir o generar efectos", async () => {
  const h = memoryInbox(); h.start(async()=>assert.fail("no procesar"));
  await assert.rejects(h.receive([item("")]), { code:"INVALID_INBOUND" });
  assert.equal(h.records.size,0);
});
test("PostgreSQL: SQL real de recepcion y dedup sobre tabla temporal aislada", {
  skip:process.env.DEDUP_TEST_DATABASE!=="1", timeout:20000
}, async () => {
  require("dotenv").config({quiet:true});
  const {Client}=require("pg"),fs=require("node:fs"),path=require("node:path");
  const client=new Client({connectionString:process.env.DATABASE_URL,ssl:{rejectUnauthorized:false},connectionTimeoutMillis:5000,query_timeout:5000});
  try {
    await client.connect();
    // [ByCodex] Neon usa pool por transaccion: mantener la tabla temporal en un backend.
    await client.query("BEGIN");
    const table = "inbox_test_" + require("node:crypto").randomUUID().replaceAll("-", "");
    const sql=fs.readFileSync(path.join(__dirname,"../sql/migrations/009_recepcion_durable.sql"),"utf8")
      .replace("CREATE TABLE IF NOT EXISTS","CREATE TEMP TABLE")
      .replaceAll("mensajes_recibidos", table).replaceAll("idx_recibidos_pendientes", table + "_idx");
    await client.query(sql);
    const {createInbox}=require("../src/services/inbox.service");
    const query = (sql,args) => client.query(sql.replaceAll("mensajes_recibidos",table),args);
    const txQuery = (sql,args) => query(({BEGIN:"SAVEPOINT receipt",COMMIT:"RELEASE SAVEPOINT receipt",ROLLBACK:"ROLLBACK TO SAVEPOINT receipt"})[sql] || sql,args);
    const pool={query,connect:async()=>({query:txQuery,release(){}})};
    const seen=[],errors=[];const h=createInbox(pool,{every:()=>({unref(){}}),log:(...args)=>errors.push(args.join(" "))});
    h.start(async(v,m)=>seen.push(m.id));
    await (await h.receive([item("sql-a"),item("sql-b")])).done;
    await (await h.receive([item("sql-a")])).done;
    await h.recover();
    assert.deepEqual(errors,[]);
    assert.deepEqual(seen,["sql-a","sql-b"]);
    assert.equal((await query("SELECT count(*)::int AS n FROM mensajes_recibidos WHERE estado='completado'")).rows[0].n,2);
  } finally { try { await client.query("ROLLBACK"); } finally { await client.end(); } }
});
