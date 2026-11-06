const DB_NAME = "organizador-dinero";
const DB_VERSION = 2;
const STORE_NAMES = ["accounts", "transactions", "tags", "budgets", "goals", "debts", "debtEvents", "meta"];

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Error de IndexedDB"));
  });
}

function transactionDone(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = transaction.onerror = () => reject(transaction.error || new Error("No se pudo guardar la operación."));
  });
}

export class LocalDatabase {
  constructor() {
    this.connection = null;
  }

  async open() {
    if (this.connection) return this.connection;
    this.connection = await new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains("accounts")) db.createObjectStore("accounts", { keyPath: "id" });
        if (!db.objectStoreNames.contains("transactions")) {
          const store = db.createObjectStore("transactions", { keyPath: "id" });
          store.createIndex("date", "date");
          store.createIndex("accountId", "accountId");
        }
        if (!db.objectStoreNames.contains("tags")) db.createObjectStore("tags", { keyPath: "id" });
        if (!db.objectStoreNames.contains("budgets")) db.createObjectStore("budgets", { keyPath: "id" });
        if (!db.objectStoreNames.contains("goals")) db.createObjectStore("goals", { keyPath: "id" });
        if (!db.objectStoreNames.contains("debts")) {
          const store = db.createObjectStore("debts", { keyPath: "id" });
          store.createIndex("direction", "direction");
          store.createIndex("personKey", "personKey");
        }
        if (!db.objectStoreNames.contains("debtEvents")) {
          const store = db.createObjectStore("debtEvents", { keyPath: "id" });
          store.createIndex("debtId", "debtId");
          store.createIndex("date", "date");
        }
        if (!db.objectStoreNames.contains("meta")) db.createObjectStore("meta", { keyPath: "key" });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("No se pudo abrir la base local."));
      request.onblocked = () => reject(new Error("Cierra otras pestañas de la aplicación para actualizar la base de datos."));
    });
    const connection = this.connection;
    connection.onversionchange = () => {
      connection.close();
      if (this.connection === connection) this.connection = null;
    };
    return connection;
  }

  async getAll(storeName) {
    const db = await this.open();
    const tx = db.transaction(storeName, "readonly");
    const [items] = await Promise.all([requestResult(tx.objectStore(storeName).getAll()), transactionDone(tx)]);
    return items;
  }

  async get(storeName, id) {
    const db = await this.open();
    const tx = db.transaction(storeName, "readonly");
    const [item] = await Promise.all([requestResult(tx.objectStore(storeName).get(id)), transactionDone(tx)]);
    return item;
  }

  async put(storeName, value) {
    const db = await this.open();
    const tx = db.transaction(storeName, "readwrite");
    tx.objectStore(storeName).put(value);
    await transactionDone(tx);
    return value;
  }

  async delete(storeName, id) {
    const db = await this.open();
    const tx = db.transaction(storeName, "readwrite");
    tx.objectStore(storeName).delete(id);
    await transactionDone(tx);
  }

  async putMany(records) {
    const db = await this.open();
    const tx = db.transaction(STORE_NAMES, "readwrite");
    for (const [storeName, items] of Object.entries(records)) {
      for (const item of items) tx.objectStore(storeName).put(item);
    }
    await transactionDone(tx);
  }

  async deleteMany(records) {
    const db = await this.open();
    const tx = db.transaction(STORE_NAMES, "readwrite");
    for (const [storeName, keys] of Object.entries(records)) {
      for (const key of keys) tx.objectStore(storeName).delete(key);
    }
    await transactionDone(tx);
  }

  async putAndDelete(records, deletions) {
    const db = await this.open();
    const tx = db.transaction(STORE_NAMES, "readwrite");
    for (const [storeName, items] of Object.entries(records)) {
      for (const item of items) tx.objectStore(storeName).put(item);
    }
    for (const [storeName, keys] of Object.entries(deletions)) {
      for (const key of keys) tx.objectStore(storeName).delete(key);
    }
    await transactionDone(tx);
  }

  async exportAll() {
    const db = await this.open();
    const tx = db.transaction(STORE_NAMES, "readonly");
    const pairs = await Promise.all(STORE_NAMES.map(async (name) => [name, await requestResult(tx.objectStore(name).getAll())]));
    await transactionDone(tx);
    return { format: "organizador-dinero", version: DB_VERSION, exportedAt: new Date().toISOString(), data: Object.fromEntries(pairs) };
  }

  async importAll(payload) {
    if (!payload || payload.format !== "organizador-dinero" || ![1, DB_VERSION].includes(payload.version) || !payload.data || typeof payload.data !== "object") {
      throw new Error("El archivo no parece una copia válida del Organizador de dinero.");
    }
    const records = {};
    for (const storeName of STORE_NAMES) {
      const items = payload.data[storeName] ?? (payload.version === 1 && ["debts", "debtEvents"].includes(storeName) ? [] : undefined);
      if (!Array.isArray(items)) throw new Error(`La sección "${storeName}" de la copia no es válida.`);
      const keys = new Set();
      for (const item of items) {
        const key = storeName === "meta" ? item?.key : item?.id;
        if (typeof key !== "string" || !key || keys.has(key)) {
          throw new Error(`La sección "${storeName}" contiene registros sin una clave válida o repetida.`);
        }
        keys.add(key);
      }
      records[storeName] = items;
    }
    const db = await this.open();
    const tx = db.transaction(STORE_NAMES, "readwrite");
    for (const storeName of STORE_NAMES) {
      const store = tx.objectStore(storeName);
      store.clear();
      for (const item of records[storeName]) store.put(item);
    }
    await transactionDone(tx);
  }
}

export const db = new LocalDatabase();
