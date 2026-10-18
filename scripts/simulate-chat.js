// [ByClaude] Simulador local de conversación. Corre el bot REAL (app.js, BD,
// cola, estados) pero intercepta las llamadas a Meta: nada sale a WhatsApp.
// Las respuestas se imprimen en consola y quedan en la BD/dashboard como un
// chat más del teléfono ficticio SIM_PHONE.
//
// Uso:
//   node scripts/simulate-chat.js                      → modo interactivo
//   node scripts/simulate-chat.js "hola" "1" "#lista 2" → guion de pasos
// Comandos: texto libre | #lista N (toca la fila N de la última lista)
//           #boton N (toca el botón N) | #salir
// Flags: --continuar (no reinicia el estado del teléfono ficticio)
//        --verbose   (muestra también los logs internos del bot)
require("dotenv").config({ quiet: true });
const readline = require("node:readline");

const PHONE = process.env.SIM_PHONE || "59100000000";
const PORT = process.env.SIM_PORT || "3099";
const args = process.argv.slice(2);
const steps = args.filter(arg => !arg.startsWith("--"));
const keepState = args.includes("--continuar");
const verbose = args.includes("--verbose");

// Sin firma solo dentro de este proceso: el webhook local no viene de Meta.
process.env.NODE_ENV = "development";
delete process.env.APP_SECRET;
process.env.PORT = PORT;

const print = console.log.bind(console);
if (!verbose) {
  console.log = () => {};
  console.warn = () => {};
}

// Intercepción de Meta: mismo módulo axios que usa whatsapp.service.
const axios = require("axios");
let outCount = 0;
let lastList = [];
let lastButtons = [];

axios.post = async (url, payload) => {
  if (!String(url).includes("graph.facebook.com")) {
    throw new Error(`[Simulador] POST inesperado a ${url}`);
  }
  outCount += 1;
  printOutgoing(payload);
  return { data: { messages: [{ id: `wamid.sim.out.${Date.now()}.${outCount}` }] } };
};

function printOutgoing(payload) {
  const to = payload.to === PHONE ? "" : ` (a otro número: ${payload.to})`;
  if (payload.type === "text") {
    print(`🤖${to} ${payload.text.body.replace(/\n/g, "\n   ")}`);
  } else if (payload.type === "image") {
    print(`🤖${to} [Imagen] ${payload.image?.caption || ""}`);
  } else if (payload.interactive?.type === "list") {
    const i = payload.interactive;
    lastList = i.action.sections.flatMap(section => section.rows);
    print(`🤖${to} [Lista] ${i.header?.text || ""}\n   ${i.body.text.replace(/\n/g, "\n   ")}`);
    lastList.forEach((row, n) => print(`     #lista ${n + 1} → ${row.title}`));
  } else if (payload.interactive?.type === "button") {
    const i = payload.interactive;
    lastButtons = i.action.buttons.map(button => button.reply);
    print(`🤖${to} [Botones] ${i.body.text}`);
    lastButtons.forEach((button, n) => print(`     #boton ${n + 1} → ${button.title}`));
  } else {
    print(`🤖${to} [${payload.type}]`);
  }
}

let seq = 0;
function buildMessage(input) {
  const base = { from: PHONE, id: `wamid.sim.in.${Date.now()}.${++seq}`,
    timestamp: String(Math.floor(Date.now() / 1000)) };
  const tap = input.match(/^#(lista|boton)\s+(\d+)$/i);
  if (!tap) return { ...base, type: "text", text: { body: input } };

  const isList = tap[1].toLowerCase() === "lista";
  const item = (isList ? lastList : lastButtons)[Number(tap[2]) - 1];
  if (!item) return null;
  return isList
    ? { ...base, type: "interactive", interactive: { type: "list_reply", list_reply: { id: item.id, title: item.title } } }
    : { ...base, type: "interactive", interactive: { type: "button_reply", button_reply: { id: item.id, title: item.title } } };
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

// Espera a que el inbox cierre ESTE mensaje (completado/revisión): es la
// señal exacta de fin de turno, sin depender de la latencia de la BD.
async function waitForReplies(wamid, before) {
  const pool = require("../src/services/db");
  const start = Date.now();
  while (Date.now() - start < 30000) {
    await sleep(250);
    const { rows } = await pool.query(
      "SELECT estado, error_code FROM mensajes_recibidos WHERE wamid = $1", [wamid]);
    const estado = rows[0]?.estado;
    if (estado === "revision") {
      print(`   ⚠️ El mensaje quedó en revisión (${rows[0].error_code || "sin código"}).`);
      return;
    }
    if (estado === "completado" || estado === "resuelto") {
      if (outCount === before) print("   (el bot no respondió)");
      return;
    }
  }
  print("   (tiempo de espera agotado)");
}

async function send(input) {
  const message = buildMessage(input);
  if (!message) {
    print("   ⚠️ No hay una lista o botón con ese número.");
    return;
  }
  print(`\n👤 ${input}`);
  const before = outCount;
  const response = await fetch(`http://localhost:${PORT}/webhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ object: "whatsapp_business_account", entry: [{ changes: [{ field: "messages",
      value: { messaging_product: "whatsapp", contacts: [{ wa_id: PHONE, profile: { name: "Simulación" } }],
        messages: [message] } }] }] })
  });
  if (response.status !== 200) {
    print(`   ⚠️ El webhook respondió ${response.status}`);
    return;
  }
  await waitForReplies(message.id, before);
}

async function waitForServer() {
  for (let attempt = 0; attempt < 50; attempt++) {
    try {
      if ((await fetch(`http://localhost:${PORT}/`)).ok) return;
    } catch { /* todavía arrancando */ }
    await sleep(200);
  }
  throw new Error("El bot no arrancó en el puerto " + PORT);
}

// Cierre ordenado del propio app.js (cola drenada, pool cerrado). Un
// process.exit directo deja mensajes en "procesando" y, al reiniciar, el
// inbox los pasa a revisión y bloquea al teléfono (protección BRIEF-027).
function finish() {
  process.emit("SIGTERM");
}

// Espera a que la recuperación del inbox procese lo pendiente del teléfono.
async function waitForInbox(pool) {
  for (let attempt = 0; attempt < 50; attempt++) {
    const { rows } = await pool.query(
      `SELECT estado FROM mensajes_recibidos
        WHERE telefono = $1 AND estado IN ('recibido', 'procesando', 'revision')`,
      [PHONE]
    );
    if (rows.length === 0) return;
    if (rows.some(row => row.estado === "revision")) {
      throw new Error("Hay un caso en revisión para el teléfono ficticio. " +
        "Resolvelo con: node scripts/inbox-review.js");
    }
    await sleep(300);
  }
  throw new Error("La cola del teléfono ficticio no se vació.");
}

async function main() {
  require("../src/app");
  await waitForServer();
  const pool = require("../src/services/db");
  await waitForInbox(pool);

  if (!keepState) {
    await pool.query(
      `UPDATE clientes_whatsapp
         SET estado_conversacion = 'ORGANIC', prenda_seleccionada_id = NULL,
             last_shown_products = '{}', updated_at = now()
       WHERE telefono = $1`,
      [PHONE]
    );
  }

  print(`Simulador listo · teléfono ficticio ${PHONE} · nada se envía a WhatsApp.`);
  print(`Dashboard en vivo: http://localhost:${PORT}/dashboard`);

  if (steps.length > 0) {
    for (const step of steps) await send(step);
    finish();
    return;
  }

  print("Escribí un mensaje, #lista N, #boton N o #salir.");
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, prompt: "\n👤 > " });
  rl.prompt();
  for await (const line of rl) {
    const input = line.trim();
    if (input === "#salir") break;
    if (input) await send(input);
    rl.prompt();
  }
  rl.close();
  finish();
}

main().catch(error => {
  print("Simulador detenido:", error.message);
  process.exit(1);
});
