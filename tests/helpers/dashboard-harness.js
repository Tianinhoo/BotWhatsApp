// [ByCodex] (BRIEF-016) Ejecutar el script real del dashboard con DOM/red simulados.
const { readFileSync } = require("node:fs");
const { resolve } = require("node:path");
const vm = require("node:vm");

function element() {
  const classes = new Set();
  return {
    value: "", disabled: true, style: {}, dataset: {}, children: [], listeners: {},
    classList: {
      add: name => classes.add(name), remove: name => classes.delete(name),
      contains: name => classes.has(name),
      toggle(name, enabled) { if (enabled) classes.add(name); else classes.delete(name); }
    },
    set innerHTML(value) { this.html = value; this.children = []; },
    get innerHTML() { return this.html || ""; },
    appendChild(child) { this.children.push(child); },
    addEventListener(name, fn) { this.listeners[name] = fn; }
  };
}

async function dashboard() {
  const elements = new Map();
  const get = id => {
    if (!elements.has(id)) elements.set(id, element());
    return elements.get(id);
  };
  const requests = [];
  const alerts = [];
  const context = vm.createContext({
    document: {
      getElementById: get, createElement: element,
      querySelectorAll: () => []
    },
    fetch: async () => ({ status: 401 }),
    setInterval() {},
    EventSource: class { close() {} },
    alert: message => alerts.push(message), console
  });
  const html = readFileSync(resolve(__dirname, "../../public/dashboard.html"), "utf8");
  vm.runInContext(html.match(/<script>([\s\S]*?)<\/script>/)[1], context);
  await new Promise(resolve => setImmediate(resolve));
  context.api = (url, opts = {}) => {
    if (url === "/dashboard/api/conversations") return Promise.resolve([]);
    return new Promise((resolve, reject) => requests.push({ url, opts, resolve, reject }));
  };
  return { context, get, requests, alerts };
}

function resolveLoad(h, phone, start = 0) {
  const base = `/dashboard/api/conversation/${phone}`;
  const thread = h.requests.slice(start).find(r => r.url === base);
  const summary = h.requests.slice(start).find(r => r.url === base + "/handoff-summary");
  thread.resolve([{ telefono: phone, origen: "cliente", contenido: `Mensaje ${phone}` }]);
  summary.resolve({ telefono: phone, es_pausa_humana: true, origen: { tipo: "organico" }, interes: `Interés ${phone}` });
}

module.exports = { dashboard, resolveLoad };
