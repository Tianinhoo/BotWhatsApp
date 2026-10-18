# [ByCodex] Simulador local: Python presenta el chat; Node ejecuta producción.
"""Sin red, .env ni PostgreSQL. Requiere Python 3.10+ y Node en PATH."""

from __future__ import annotations

import argparse
from datetime import datetime, timedelta, timezone
import json
import os
from pathlib import Path
import queue
import re
import shutil
import subprocess
import sys
import threading
import unicodedata


ROOT = Path(__file__).resolve().parents[1]
PHONE = "59100000000"

# [ByCodex] Adaptadores de I/O solamente. No copia parsers, textos ni handlers.
# appHarness ejecuta src/app.js, inbox y cola reales sin abrir un servidor.
# El cargador importa los servicios CommonJS sin permitir dependencias de red.
NODE_BRIDGE = r"""
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const readline = require('node:readline');
const { appHarness } = require('./tests/helpers/app-harness');
const root = process.cwd();
const phone = '59100000000';
let clock = Date.now();
class SimDate extends Date {
  constructor(...args) { super(...(args.length ? args : [clock])); }
  static now() { return clock; }
}
const clientRows = new Map(), traffic = new Map(), claimed = new Set();
const history = [], summaries = [], outgoing = [], diagnostics = [];
const products = [
  { id: 1, nombre: 'Modelo 1', imagen_key: 'IMAGE_MODELO_1' },
  { id: 2, nombre: 'Modelo 2', imagen_key: 'IMAGE_MODELO_2' },
  { id: 3, nombre: 'Modelo 3', imagen_key: 'IMAGE_MODELO_3' },
  { id: 4, nombre: 'Oferta del día', imagen_key: 'IMAGE_OFERTA_DIA' }
].map(p => ({ ...p, precio: 0, disponible: true, tallas: [], colores: [] }));
const rows = values => ({ rows: values, rowCount: values.length });
const getClient = number => {
  if (!clientRows.has(number)) clientRows.set(number, {
    estado_conversacion: 'ORGANIC', prenda_seleccionada_id: null,
    last_shown_products: [], catalogo_enviado: false
  });
  return clientRows.get(number);
};
// [ByCodex] Almacenamiento de prueba: SQL desconocido falla explícitamente.
const db = { async query(raw, args = []) {
  const sql = raw.replace(/\s+/g, ' ').trim();
  const number = args[0];
  if (sql.startsWith('INSERT INTO mensajes_procesados')) {
    if (claimed.has(number)) return { rows: [], rowCount: 0 };
    claimed.add(number); return { rows: [], rowCount: 1 };
  }
  if (sql.startsWith('INSERT INTO mensajes ')) {
    history.push({ telefono: number, origen: args[1], contenido: args[2],
      estado_envio: args[3], created_at: new SimDate().toISOString() });
    return rows([]);
  }
  if (sql.startsWith('INSERT INTO trafico_clientes')) {
    traffic.set(number, { telefono: number, origen: args[1], source_type: args[2],
      source_id: args[3], source_url: args[4], headline: args[5], body: args[6],
      first_referral_id: args[7] });
    return rows([]);
  }
  if (sql.startsWith('INSERT INTO resumenes_atencion')) {
    const summary = { ...JSON.parse(args[5]), id: summaries.length + 1,
      created_at: new SimDate().toISOString() };
    summaries.push(summary); return rows([summary]);
  }
  if (sql.startsWith('INSERT INTO clientes_whatsapp')) {
    const client = getClient(number);
    if (sql.includes('catalogo_enviado')) client.catalogo_enviado = true;
    else if (sql.includes('prenda_seleccionada_id = NULL')) {
      client.estado_conversacion = args[1];
      client.prenda_seleccionada_id = null; client.last_shown_products = [];
    } else if (sql.includes('prenda_seleccionada_id = EXCLUDED')) {
      client.prenda_seleccionada_id = args[1]; client.estado_conversacion = args[2];
    } else {
      client.estado_conversacion = args[1];
      if (sql.includes('last_shown_products = EXCLUDED'))
        client.last_shown_products = Array.from(args[2]);
    }
    return rows([]);
  }
  if (sql.includes('JOIN productos p ON p.id = c.prenda_seleccionada_id')) {
    const selected = clientRows.get(number)?.prenda_seleccionada_id;
    return rows(products.filter(p => p.id === selected));
  }
  if (sql.startsWith('SELECT') && sql.includes('FROM clientes_whatsapp'))
    return rows(clientRows.has(number) ? [clientRows.get(number)] : []);
  if (sql.startsWith('SELECT') && sql.includes('FROM trafico_clientes'))
    return rows(traffic.has(number) ? [traffic.get(number)] : []);
  if (sql.includes('FROM productos WHERE imagen_key = ANY'))
    return rows(products.filter(p => args[0].includes(p.imagen_key))
      .sort((a, b) => args[0].indexOf(a.imagen_key) - args[0].indexOf(b.imagen_key))
      .slice(0, 9));
  if (sql.startsWith('SELECT id FROM productos WHERE imagen_key'))
    return rows(products.filter(p => p.imagen_key === number));
  if (sql.startsWith('SELECT id, nombre FROM productos WHERE id'))
    return rows(products.filter(p => p.id === Number(number)));
  if (sql.startsWith('SELECT') && sql.includes('FROM mensajes WHERE'))
    return rows(history.filter(m => m.telefono === number &&
      (!sql.includes("origen = 'cliente'") || m.origen === 'cliente'))
      .slice().reverse().slice(0, args[1]));
  throw new Error('Consulta no soportada por el simulador: ' + sql);
} };

const safeEnv = { NODE_ENV: 'test', GRAPH_API_VERSION: 'simulated',
  PHONE_NUMBER_ID: 'simulated', IMAGE_MODELO_1: 'sim-modelo-1',
  IMAGE_MODELO_2: 'sim-modelo-2', IMAGE_MODELO_3: 'sim-modelo-3',
  IMAGE_OFERTA_DIA: 'sim-oferta' };
const modules = new Map();
const localConsole = Object.fromEntries(['log', 'warn', 'error'].map(level =>
  [level, (...args) => { if (level === 'error') diagnostics.push(args.join(' ')); }]));
const axios = { async post(_url, payload) {
  outgoing.push(JSON.parse(JSON.stringify(payload)));
  return { data: { messages: [{ id: 'wamid.sim.out.' + outgoing.length }] } };
} };
function load(relative) {
  const filename = path.resolve(root, relative);
  const allowed = path.join(root, 'src') + path.sep;
  if (!filename.startsWith(allowed)) throw new Error('Importación fuera de src');
  if (filename === path.join(root, 'src/services/db.js')) return db;
  if (modules.has(filename)) return modules.get(filename).exports;
  const module = { exports: {} }; modules.set(filename, module);
  const context = {
    module, exports: module.exports, process: { env: safeEnv }, console: localConsole,
    Date: SimDate, Buffer, AbortController, setTimeout, clearTimeout,
    require(name) {
      if (name === 'axios') return axios;
      if (['events', 'node:events', 'node:timers'].includes(name)) return require(name);
      if (name.startsWith('.')) {
        let target = path.resolve(path.dirname(filename), name);
        if (!target.endsWith('.js')) target += '.js';
        return load(target);
      }
      throw new Error('Dependencia no permitida en simulación: ' + name);
    }
  };
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), context, { filename });
  return module.exports;
}
const state = load('src/services/state.service.js');
const messages = load('src/services/messages.service.js');
const app = appHarness({ env: safeEnv, overrides: {
  './services/state.service': state,
  './services/messages.service': messages,
  './services/dedup.service': load('src/services/dedup.service.js'),
  './services/db': db
} });
let seq = 0, lastMessage = null;
const snapshot = () => ({
  state: clientRows.get(phone)?.estado_conversacion || 'ORGANIC',
  product_id: clientRows.get(phone)?.prenda_seleccionada_id ?? null,
  last_shown: clientRows.get(phone)?.last_shown_products || [],
  summary: summaries.at(-1) || null, history_count: history.length,
  time: new SimDate().toISOString()
});
async function command(input) {
  const start = outgoing.length, errorsBefore = diagnostics.length;
  let receipt = null;
  if (input.op === 'advance') {
    if (!Number.isFinite(input.seconds) || input.seconds < 0)
      throw new Error('Intervalo inválido');
    clock += input.seconds * 1000;
    await app.advance(input.seconds * 1000);
  } else if (input.op === 'resume') {
    await state.resumeBotForClient(phone);
  } else if (input.op === 'send' || input.op === 'duplicate') {
    let message;
    if (input.op === 'duplicate') {
      if (!lastMessage) throw new Error('No hay mensaje para duplicar');
      message = lastMessage;
    } else {
      message = { from: phone, id: 'wamid.sim.in.' + (++seq),
        timestamp: String(Math.floor(clock / 1000)), ...input.message };
      lastMessage = message;
    }
    const response = await app.webhook(Buffer.from(JSON.stringify({ entry: [{
      changes: [{ value: { contacts: [{ wa_id: phone }], messages: [message] } }]
    }] })));
    if (response.status !== 200) throw new Error('Webhook: ' + response.status);
    receipt = app.inbox.records.get(message.id)?.estado;
    if (receipt !== 'completado') throw new Error('Mensaje pendiente: ' + receipt);
  } else if (input.op !== 'status') throw new Error('Operación desconocida');
  const errors = diagnostics.slice(errorsBefore);
  if (errors.length) throw new Error(errors.join('\n'));
  return { ok: true, ...snapshot(), outgoing: outgoing.slice(start), receipt };
}
const input = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
(async () => {
  for await (const line of input) {
    try { process.stdout.write(JSON.stringify(await command(JSON.parse(line))) + '\n'); }
    catch (error) { process.stdout.write(JSON.stringify({ ok: false, error: error.message }) + '\n'); }
  }
  await app.inbox.stop();
})().catch(error => { process.stderr.write(error.message); process.exitCode = 1; });
"""


# [ByCodex] JSON por stdin/stdout, con timeout y cierre para no dejar procesos.
class Engine:
    def __init__(self):
        node = shutil.which("node")
        if not node:
            raise RuntimeError("No encuentro Node en PATH. Usá el runtime Node del proyecto.")
        env = os.environ.copy()
        for key in list(env):
            if key.upper() in {"NODE_OPTIONS", "NODE_PATH", "APP_SECRET", "DATABASE_URL",
                              "WHATSAPP_TOKEN", "VERIFY_TOKEN", "DEDUP_TEST_DATABASE"}:
                env.pop(key)
        self.process = subprocess.Popen(
            [node, "-e", NODE_BRIDGE], cwd=ROOT, env=env,
            stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
            text=True, encoding="utf-8", bufsize=1,
            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
        )
        self.responses: queue.Queue = queue.Queue()
        self.errors: list[str] = []
        self.reader = threading.Thread(target=self._read, daemon=True)
        self.error_reader = threading.Thread(target=self._read_errors, daemon=True)
        self.reader.start()
        self.error_reader.start()

    def _read(self):
        for line in self.process.stdout:
            self.responses.put(line)
        self.responses.put(None)

    def _read_errors(self):
        for line in self.process.stderr:
            self.errors.append(line.rstrip())

    def request(self, op, **data):
        try:
            self.process.stdin.write(json.dumps({"op": op, **data}, ensure_ascii=False) + "\n")
            self.process.stdin.flush()
        except (BrokenPipeError, OSError) as exc:
            raise RuntimeError("El motor Node se cerró inesperadamente.") from exc
        try:
            response = self.responses.get(timeout=15)
        except queue.Empty as exc:
            raise RuntimeError("El motor local no respondió en 15 segundos.") from exc
        if response is None:
            self.error_reader.join(timeout=1)
            raise RuntimeError("El motor Node no arrancó: " + " ".join(self.errors)[-1500:])
        try:
            result = json.loads(response)
        except json.JSONDecodeError as exc:
            raise RuntimeError("Respuesta inválida del motor local.") from exc
        if not result.get("ok"):
            raise RuntimeError(result.get("error", "Error del motor local"))
        return result

    def close(self):
        try:
            self.process.stdin.close()
        except OSError:
            pass
        try:
            self.process.wait(timeout=3)
        except subprocess.TimeoutExpired:
            self.process.kill()
            self.process.wait(timeout=3)
        self.reader.join(timeout=1)
        self.error_reader.join(timeout=1)
        self.process.stdout.close()
        self.process.stderr.close()


class Transcript:
    def __init__(self, directory):
        directory.mkdir(parents=True, exist_ok=True)
        # America/La_Paz no cambia de offset. Evita depender de tzdata en Windows.
        stamp = datetime.now(timezone(timedelta(hours=-4)))
        while True:
            self.path = directory / f"sim_{stamp:%Y%m%d_%H%M%S}.txt"
            try:
                self.file = self.path.open("x", encoding="utf-8")
                break
            except FileExistsError:
                stamp += timedelta(seconds=1)

    def write(self, text=""):
        print(text)
        self.file.write(text + "\n")
        self.file.flush()

    def bubble(self, name, text):
        self.write(f"\n╭─ {name}")
        for line in text.splitlines() or [""]:
            self.write("│ " + line)
        self.write("╰────────────────────────")


HELP = """Texto: escribí como en WhatsApp. Para tocar opciones: #lista N / #boton N.
#audio [nota] simula un audio; #duplicado reentrega el último mensaje.
#esperar 3h avanza el reloj sin esperar; #estado muestra estado/resumen.
#reanudar devuelve el control al bot; #reiniciar comienza un chat nuevo.
#ayuda muestra esta ayuda; #salir termina. Las imágenes se representan con texto."""


# [ByCodex] UI: muestra payloads reales, nunca reconstruye respuestas del árbol.
class Chat:
    def __init__(self, transcript):
        self.transcript = transcript
        self.engine = Engine()
        self.lists = []
        self.buttons = []

    def close(self):
        self.engine.close()

    def render(self, result):
        for payload in result["outgoing"]:
            kind = payload["type"]
            if kind == "text":
                body = payload["text"]["body"]
            elif kind == "image":
                body = "[Imagen simulada] " + payload["image"].get("caption", "")
            elif kind == "interactive":
                item = payload["interactive"]
                parts = [item.get("header", {}).get("text", ""), item["body"]["text"]]
                if item["type"] == "list":
                    self.lists = [row for section in item["action"]["sections"] for row in section["rows"]]
                    parts.append("[" + item["action"]["button"] + "]")
                    for index, row in enumerate(self.lists, 1):
                        parts.append(f"#lista {index} · {row['title']}" +
                                     (f" — {row['description']}" if row.get("description") else ""))
                else:
                    self.buttons = [button["reply"] for button in item["action"]["buttons"]]
                    parts.extend(f"#boton {index} · {button['title']}" for index, button in enumerate(self.buttons, 1))
                parts.append(item.get("footer", {}).get("text", ""))
                body = "\n".join(part for part in parts if part)
            else:
                body = json.dumps(payload, ensure_ascii=False)
            self.transcript.bubble("Cecilia Tedin", body)
        if not result["outgoing"]:
            self.transcript.write("[Simulador: el bot no respondió]")
        return result

    def send(self, text):
        self.transcript.bubble("Clienta", text)
        if text == "#duplicado":
            return self.render(self.engine.request("duplicate"))
        if text.startswith("#audio") and (text == "#audio" or text[6:7] == " "):
            message = {"type": "audio", "audio": {"id": "sim-audio", "mime_type": "audio/ogg"}}
        elif re.fullmatch(r"#(?:lista|boton)\s+\d+", text):
            command, number = text.split()
            choices = self.lists if command == "#lista" else self.buttons
            index = int(number) - 1
            if not 0 <= index < len(choices):
                raise ValueError("No existe esa opción visible. Usá #lista N o #boton N con un número mostrado.")
            reply_type = "list_reply" if command == "#lista" else "button_reply"
            item = choices[index]
            message = {"type": "interactive", "interactive": {"type": reply_type,
                       reply_type: {"id": item["id"], "title": item["title"]}}}
        elif text.startswith("#esperar "):
            match = re.fullmatch(r"#esperar\s+(\d+(?:\.\d+)?)\s*([smhd])", text)
            if not match:
                raise ValueError("Usá #esperar 3h (también s, m o d).")
            seconds = float(match[1]) * {"s": 1, "m": 60, "h": 3600, "d": 86400}[match[2]]
            if seconds > 36500 * 86400:
                raise ValueError("Intervalo demasiado grande; simulá hasta 36500d por paso.")
            result = self.engine.request("advance", seconds=seconds)
            self.transcript.write(f"[Reloj virtual: {result['time']} · estado: {result['state']}]")
            return result
        elif text == "#estado":
            result = self.engine.request("status")
            self.transcript.write(json.dumps(result, ensure_ascii=False, indent=2))
            return result
        elif text == "#reanudar":
            result = self.engine.request("resume")
            self.transcript.write(f"[Asesora: bot reanudado · estado: {result['state']}]")
            return result
        elif text.startswith("#"):
            raise ValueError("Comando desconocido. Consultá #ayuda.")
        else:
            message = {"type": "text", "text": {"body": text}}
        return self.render(self.engine.request("send", message=message))


# [ByCodex] Los casos comprueban conducta actual, incluidas sus limitaciones.
SCENARIOS = {
    "menu_completo": "Recorre las siete opciones mediante las listas reales.",
    "seleccion_prenda": "Selecciona modelo 2 talla M negro; consulta precio y deriva.",
    "handoff": "'quiero asesora' no coincide; botón de asesora pausa hasta reanudar.",
    "fuera_de_guion": "Consulta mezclada devuelve el menú, sin inventar respuesta.",
    "abandono_regreso": "Tres horas después conserva la selección pendiente.",
    "duplicado": "Mismo ID entrante no repite respuestas ni historial.",
    "opcion_invalida": "Opción inexistente y 6 en prendas vuelven a la lista.",
    "audio": "Audio simulado deriva y guarda el motivo; no transcribe.",
    "emoji": "Saludo con emoji y opción con emoji conservan reglas del árbol.",
    "typos": "Errores de escritura repiten menú; alias correcto recupera el flujo.",
}
ALIASES = {"modelo 2 talla m negro": "seleccion_prenda", "quiero asesora": "handoff",
           "fuera de menu": "fuera_de_guion"}


def normalized(value):
    return "".join(char for char in unicodedata.normalize("NFD", value.lower().strip())
                   if unicodedata.category(char) != "Mn")


def check(result, *, state=None, count=None, contains=None, product=None, summary=False):
    if state is not None and result["state"] != state:
        raise AssertionError(f"Estado esperado {state}; recibido {result['state']}")
    if count is not None and len(result["outgoing"]) != count:
        raise AssertionError(f"Esperaba {count} respuestas; recibí {len(result['outgoing'])}")
    if contains and contains not in json.dumps(result["outgoing"], ensure_ascii=False):
        raise AssertionError(f"Falta respuesta esperada: {contains}")
    if product is not None and result["product_id"] != product:
        raise AssertionError("La prenda seleccionada no coincide")
    if summary and not result["summary"]:
        raise AssertionError("Falta Resumen para Atención")
    return result


def run_scenario(name, transcript):
    transcript.write(f"\n=== {name}: {SCENARIOS[name]} ===")
    chat = Chat(transcript)
    try:
        check(chat.send("hola"), state="MENU", count=2)
        if name == "menu_completo":
            for option, label in [(1, "Modelo 1"), (2, "Modelos nuevos"),
                                  (3, "Precios y tallas"), (4, "Disponibilidad / stock"),
                                  (5, "Envíos y entregas"), (7, "Contacto y horarios"),
                                  (6, "asesora humana")]:
                chat.send("menú")
                check(chat.send(f"#lista {option}"), contains=label,
                      count=6 if option in (1, 2) else 1,
                      state="WAITING_PRODUCT_SELECTION" if option in (1, 2) else
                            "PAUSED_HUMAN" if option == 6 else "MENU")
        elif name == "seleccion_prenda":
            check(chat.send("1"), state="WAITING_PRODUCT_SELECTION", count=6)
            check(chat.send("modelo 2 talla M negro"), state="MENU", product=2, contains="Elegiste")
            check(chat.send("#boton 1"), contains="Por confirmar", product=2)
            result = check(chat.send("#boton 3"), state="PAUSED_HUMAN", summary=True)
            if result["summary"].get("prenda_seleccionada_id") != 2:
                raise AssertionError("Resumen sin la prenda elegida")
        elif name == "handoff":
            check(chat.send("quiero asesora"), state="MENU", count=2, contains="mensajes libres")
            check(chat.send("#lista 6"), state="PAUSED_HUMAN", summary=True)
            check(chat.send("menú"), state="PAUSED_HUMAN", count=0)
            check(chat.send("#reanudar"), state="MENU", count=0)
            check(chat.send("hola"), state="MENU", count=1)
        elif name == "fuera_de_guion":
            for text in ["2 y también precio", "¿Me llega mañana a El Alto, casera?"]:
                check(chat.send(text), state="MENU", count=2, contains="mensajes libres")
        elif name == "abandono_regreso":
            check(chat.send("1"), state="WAITING_PRODUCT_SELECTION")
            before = chat.engine.request("status")
            after = check(chat.send("#esperar 3h"), state="WAITING_PRODUCT_SELECTION", count=0)
            elapsed = datetime.fromisoformat(after["time"].replace("Z", "+00:00")) - datetime.fromisoformat(before["time"].replace("Z", "+00:00"))
            if elapsed.total_seconds() != 10800:
                raise AssertionError("El reloj no avanzó tres horas")
            check(chat.send("2"), state="MENU", product=2, contains="Elegiste")
        elif name == "duplicado":
            before = check(chat.send("1"), state="WAITING_PRODUCT_SELECTION", count=6)
            after = check(chat.send("#duplicado"), state="WAITING_PRODUCT_SELECTION", count=0)
            if before["history_count"] != after["history_count"]:
                raise AssertionError("El duplicado añadió historial")
        elif name == "opcion_invalida":
            check(chat.send("99"), state="MENU", count=2)
            chat.send("1")
            for text in ["9", "6"]:
                check(chat.send(text), state="WAITING_PRODUCT_SELECTION", count=2, contains="No pude identificar")
            check(chat.send("menú"), state="MENU", count=1)
        elif name == "audio":
            result = check(chat.send("#audio Casera, talla grande para mañana en Cocha"),
                           state="PAUSED_HUMAN", count=1, summary=True)
            if "audio" not in result["summary"].get("motivo_derivacion", ""):
                raise AssertionError("Resumen sin motivo de audio")
            check(chat.send("#audio Otro audio"), state="PAUSED_HUMAN", count=0)
        elif name == "emoji":
            check(chat.send("Hola caserita 😊"), state="MENU", count=2)
            check(chat.send("2 😊"), state="MENU", count=2, contains="mensajes libres")
            check(chat.send("2"), state="WAITING_PRODUCT_SELECTION", count=6)
        elif name == "typos":
            for text in ["presio plis", "catálogooo"]:
                check(chat.send(text), state="MENU", count=2, contains="mensajes libres")
            check(chat.send("catálogo"), state="WAITING_PRODUCT_SELECTION", count=6)
        transcript.write(f"✅ {name}: comportamiento esperado verificado")
        return True
    except (AssertionError, RuntimeError, ValueError) as exc:
        transcript.write(f"❌ {name}: {exc}")
        return False
    finally:
        chat.close()


def interactive(transcript):
    transcript.write(HELP)
    chat = Chat(transcript)
    try:
        transcript.write("[Inicio: saludo de prueba 'hola']")
        chat.send("hola")
        while True:
            try:
                text = input("\nClienta > ").strip()
            except (EOFError, KeyboardInterrupt):
                transcript.write("\n[Sesión finalizada]")
                break
            if not text:
                continue
            if text == "#salir":
                transcript.write("Clienta > #salir")
                break
            if text == "#ayuda":
                transcript.write(HELP)
                continue
            if text == "#reiniciar":
                chat.close()
                chat = Chat(transcript)
                transcript.write("[Nueva conversación; memoria reiniciada]")
                chat.send("hola")
                continue
            try:
                chat.send(text)
            except ValueError as exc:
                transcript.write(f"[Simulador: {exc}]")
    finally:
        chat.close()


def main(argv=None):
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8", errors="replace")
    parser = argparse.ArgumentParser(description=__doc__)
    group = parser.add_mutually_exclusive_group()
    group.add_argument("--auto", action="store_true", help="Verificar diez conversaciones")
    group.add_argument("--scenario", metavar="NOMBRE", help="Ejecutar un escenario o alias")
    group.add_argument("--list-scenarios", action="store_true", help="Listar escenarios")
    parser.add_argument("--log-dir", type=Path, default=ROOT / "logs", help="Directorio de registros")
    args = parser.parse_args(argv)
    if args.list_scenarios:
        for name, description in SCENARIOS.items():
            print(f"{name}: {description}")
        return 0
    name = None
    if args.scenario:
        key = normalized(args.scenario)
        name = ALIASES.get(key, key.replace(" ", "_"))
        if name not in SCENARIOS:
            parser.error("Escenario desconocido. Consultá --list-scenarios.")
    transcript = None
    try:
        transcript = Transcript(args.log_dir)
        transcript.write("Simulador local · Cecilia Tedin · sin Meta ni base de datos externa")
        transcript.write("Datos de ejemplo: cuatro prendas; precios, tallas y colores por confirmar.")
        transcript.write("Registro: " + str(transcript.path))
        if args.auto or name:
            transcript.write("✅ valida el comportamiento actual; no certifica comprensión ni viabilidad comercial.")
            names = list(SCENARIOS) if args.auto else [name]
            passed = sum(run_scenario(scenario, transcript) for scenario in names)
            transcript.write(f"\n{passed}/{len(names)} escenarios aprobados")
            return 0 if passed == len(names) else 1
        interactive(transcript)
        return 0
    except (RuntimeError, OSError, KeyboardInterrupt) as exc:
        message = "Simulador detenido: " + (str(exc) or "interrumpido")
        if transcript:
            try:
                transcript.write(message)
            except OSError:
                print(message, file=sys.stderr)
        else:
            print(message, file=sys.stderr)
        return 1
    finally:
        if transcript:
            try:
                transcript.file.close()
            except OSError as exc:
                print("No se pudo cerrar el registro: " + str(exc), file=sys.stderr)


if __name__ == "__main__":
    raise SystemExit(main())
