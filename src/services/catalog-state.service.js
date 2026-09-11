const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(__dirname, "..", "..", "data");
const DATA_FILE = path.join(DATA_DIR, "catalog-state.json");

function ensureFile() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(
      DATA_FILE,
      JSON.stringify({ clientes: [] }, null, 2)
    );
  }
}

function getData() {
  ensureFile();

  try {
    return JSON.parse(
      fs.readFileSync(DATA_FILE, "utf8")
    );
  } catch {
    return { clientes: [] };
  }
}

function saveData(data) {
  fs.writeFileSync(
    DATA_FILE,
    JSON.stringify(data, null, 2)
  );
}

function hasReceivedCatalog(phone) {
  const data = getData();

  return data.clientes.includes(phone);
}

function markCatalogSent(phone) {
  const data = getData();

  if (!data.clientes.includes(phone)) {
    data.clientes.push(phone);
    saveData(data);
  }
}

module.exports = {
  hasReceivedCatalog,
  markCatalogSent
};
