// [ByClaude] (BRIEF-031) Media entrante: handoff para interpretables; silencio para ruido.
const assert = require("node:assert/strict");
const { test } = require("node:test");
const { appHarness } = require("./helpers/app-harness");

function body(type, extras = {}) {
  const msg = { id: `wamid.${type}.1`, from: "00000001234", type, ...extras };
  return Buffer.from(JSON.stringify({ entry: [{ changes: [{ value: { messages: [msg] } }] }] }));
}

for (const type of ["image", "audio", "video", "document", "location", "contacts"]) {
  test(`BRIEF-031: ${type} entrante deriva a asesora con reason`, async () => {
    const fixture = appHarness();
    const res = await fixture.webhook(body(type));
    assert.equal(res.status, 200);
    // El inbox real encola y procesa; esperamos la cola.
    const { drain } = require("../src/services/queue.service");
    await drain();
    const derive = fixture.calls.find(c => c.name === "processMenuOption" && c.args[1] === "asesor");
    assert.ok(derive, `processMenuOption('asesor') debería haberse llamado para ${type}`);
    const extras = derive.args[2];
    assert.ok(extras && extras.reason && extras.reason.includes(type),
      `extras.reason debe contener el tipo ${type}`);
  });
}

for (const type of ["sticker", "reaction"]) {
  test(`BRIEF-031: ${type} se ignora silenciosamente`, async () => {
    const fixture = appHarness();
    const res = await fixture.webhook(body(type));
    assert.equal(res.status, 200);
    const { drain } = require("../src/services/queue.service");
    await drain();
    assert.equal(
      fixture.calls.some(c => c.name === "processMenuOption"),
      false,
      "sticker/reaction NO debería disparar ningún menu option"
    );
    assert.equal(
      fixture.calls.some(c => c.name === "greetAndShowMenu" || c.name === "showMenu"),
      false,
      "sticker/reaction NO debería enviar menú"
    );
  });
}
