// [ByCodex] (BRIEF-021) Ejecutar state.service real con dobles aislados, sin BD, red ni caché global.
const { readFileSync } = require("node:fs");
const { resolve } = require("node:path");
const vm = require("node:vm");

function fixture({ query = async () => ({ rows: [] }), catalogReceived = false,
  // [ByCodex] (BRIEF-026) Control del transporte para carreras sin esperas reales.
  rejectAt = 0, summaryFailure = null, saveSummaryFailure = null, business = {}, beforeSend = null } = {}) {
  const queries = [], sent = [], recorded = [], messages = [], events = [], logs = [];
  const catalogChecks = [], catalogMarks = [], summaryCalls = [], summaries = [];
  const summary = { nombre: "Resumen para Atención", origen: "anuncio",
    modelo: "Modelo de prueba", interes: "Azul", necesidad: "Por confirmar" };
  const sendFailure = new Error("Envío simulado rechazado");
  async function send(type, phone, details = {}) {
    const call = { type, phone, ...details };
    sent.push(call);
    events.push(call);
    // [ByCodex] (BRIEF-026) El envio queda pendiente hasta liberar el gate del test.
    if (beforeSend) await beforeSend(call);
    if (sent.length === rejectAt) throw sendFailure;
    return { messages: [{ id: `wamid.test.${sent.length}` }] };
  }
  const deps = {
    "./db": { async query(sql, params) {
      const call = { type: "query", sql, params: Array.from(params) };
      queries.push(call);
      events.push(call);
      return query(sql, params);
    } },
    "./whatsapp.service": {
      sendTextMessage: (phone, text) => send("text", phone, { text }),
      sendImageMessage: (phone, imageId, caption) => send("image", phone, { imageId, caption }),
      sendMainMenu: phone => send("menu", phone)
    },
    "./outbound.service": { async sendAndRecord(phone, content, callback) {
      recorded.push({ phone, content });
      return callback();
    } },
    "./messages.service": {
      async saveMessage(...args) { messages.push(args); },
      async buildHandoffSummary(...args) {
        summaryCalls.push(args);
        events.push({ type: "build-summary" });
        if (summaryFailure) throw summaryFailure;
        return summary;
      },
      async saveHandoffSummary(value) {
        summaries.push(value);
        events.push({ type: "save-summary" });
        if (saveSummaryFailure) throw saveSummaryFailure;
      }
    },
    "./catalog-state.service": {
      async hasReceivedCatalog(phone) { catalogChecks.push(phone); return catalogReceived; },
      async markCatalogSent(phone) { catalogMarks.push(phone); events.push({ type: "mark-catalog" }); }
    },
    "./logger.service": { redactPhone: () => "***test", safeError: error => error.message },
    "../config/business": { precios: null, tallas: null, envios: null,
      horario_atencion: null, instagram: null, direccion_fisica: null, ...business }
  };
  const filename = resolve(__dirname, "../../src/services/state.service.js");
  const module = { exports: {} };
  vm.runInNewContext(readFileSync(filename, "utf8"), {
    module, exports: module.exports,
    process: { env: { IMAGE_MODELO_1: "image-1", IMAGE_MODELO_2: "image-2",
      IMAGE_MODELO_3: "image-3", IMAGE_OFERTA_DIA: "image-offer" } },
    console: Object.fromEntries(["log", "warn", "error"].map(level =>
      [level, (...args) => logs.push({ level, text: args.join(" ") })])),
    require(name) {
      if (!Object.hasOwn(deps, name)) throw new Error(`Dependencia no simulada: ${name}`);
      return deps[name];
    }
  }, { filename });
  return { state: module.exports, queries, sent, recorded, messages, events, logs,
    catalogChecks, catalogMarks, summaryCalls, summaries, summary, sendFailure,
    transitions: () => queries.filter(call => /INSERT INTO clientes_whatsapp/.test(call.sql))
      .map(call => call.params) };
}

module.exports = { fixture };
