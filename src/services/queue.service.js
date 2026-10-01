// [ByCodex] (BRIEF-026) FIFO por telefono; una instancia Node, sin persistencia.
const { redactPhone } = require("./logger.service");

const inflight = new Map();
const SLOW_WARN_MS = 10_000;

function processInOrder(phone, fn) {
  const key = String(phone);
  const previous = inflight.get(key) || Promise.resolve();
  const result = previous.then(() => runInstrumented(key, fn));

  // La cola guarda una promesa que siempre resuelve. El error de este trabajo
  // llega al llamador en result, sin saltarse trabajos ya encolados detras.
  const tail = result.then(() => undefined, () => undefined);
  inflight.set(key, tail);
  void tail.then(() => {
    if (inflight.get(key) === tail) inflight.delete(key);
  });
  return result;
}

async function runInstrumented(phone, fn) {
  const startedAt = Date.now();
  // Avisar durante un trabajo lento; NO liberarlo ni ejecutar el siguiente.
  const warning = setTimeout(() => {
    console.warn(
      "[queue] slow_link phone=" + redactPhone(phone) +
      " duration_ms=" + (Date.now() - startedAt)
    );
  }, SLOW_WARN_MS);
  warning.unref?.();
  try {
    return await fn();
  } finally {
    clearTimeout(warning);
  }
}

module.exports = { processInOrder };
