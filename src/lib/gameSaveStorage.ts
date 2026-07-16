const GAME_SAVE_DB = "airline-tycoon-game-saves";
const GAME_SAVE_STORE = "saves";
const GAME_SAVE_METADATA_KEY = "airline-tycoon-v1-meta";
const SAVE_DEBOUNCE_MS = 1000;

export type StorageWriteResult =
  | { ok: true; sizeBytes: number }
  | { ok: false; reason: "quota" | "unavailable" | "unknown"; error?: unknown };

type SaveMetadata = { hasSave: boolean; updatedAt: string | null };

let legacySavePendingMigration = false;
let queuedWrite: { key: string; value: string } | null = null;
let queuedResolvers: Array<() => void> = [];
let queuedTimer: number | null = null;
let storageWarning: StorageWriteResult | null = null;
let skipNextPersistedWrite = false;

export function isQuotaExceededError(error: unknown): boolean {
  return (
    error instanceof DOMException &&
    (error.name === "QuotaExceededError" ||
      error.name === "NS_ERROR_DOM_QUOTA_REACHED" ||
      error.code === 22 ||
      error.code === 1014)
  );
}

export function safeSetLocalStorage(key: string, value: string): StorageWriteResult {
  if (typeof window === "undefined") return { ok: false, reason: "unavailable" };

  try {
    window.localStorage.setItem(key, value);
    return { ok: true, sizeBytes: new Blob([value]).size };
  } catch (error) {
    return isQuotaExceededError(error)
      ? { ok: false, reason: "quota", error }
      : { ok: false, reason: "unknown", error };
  }
}

export function safeSetSessionStorage(key: string, value: string): StorageWriteResult {
  if (typeof window === "undefined") return { ok: false, reason: "unavailable" };

  try {
    window.sessionStorage.setItem(key, value);
    return { ok: true, sizeBytes: new Blob([value]).size };
  } catch (error) {
    return isQuotaExceededError(error)
      ? { ok: false, reason: "quota", error }
      : { ok: false, reason: "unknown", error };
  }
}

export function safeGetLocalStorage(key: string): string | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function safeGetSessionStorage(key: string): string | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

export function safeRemoveLocalStorage(key: string) {
  try {
    if (typeof window !== "undefined") window.localStorage.removeItem(key);
  } catch {
    // Storage cleanup must not interrupt gameplay.
  }
}

export function safeRemoveSessionStorage(key: string) {
  try {
    if (typeof window !== "undefined") window.sessionStorage.removeItem(key);
  } catch {
    // Storage cleanup must not interrupt gameplay.
  }
}

export function getLocalSaveMetadataSync(): SaveMetadata {
  const stored = safeGetLocalStorage(GAME_SAVE_METADATA_KEY);
  if (!stored) return { hasSave: Boolean(safeGetLocalStorage("airline-tycoon-v1")), updatedAt: null };

  try {
    const metadata = JSON.parse(stored) as Partial<SaveMetadata>;
    return { hasSave: Boolean(metadata.hasSave), updatedAt: typeof metadata.updatedAt === "string" ? metadata.updatedAt : null };
  } catch {
    return { hasSave: true, updatedAt: null };
  }
}

export function getStorageWarning() {
  return storageWarning;
}

export function skipNextGameSaveWrite() {
  skipNextPersistedWrite = true;
}

export const gameSaveStorage = {
  async getItem(key: string): Promise<string | null> {
    const indexedValue = await readFromIndexedDb(key);
    if (indexedValue) return indexedValue;

    const legacyValue = safeGetLocalStorage(key);
    if (legacyValue) legacySavePendingMigration = true;
    return legacyValue;
  },

  async setItem(key: string, value: string): Promise<void> {
    if (skipNextPersistedWrite) {
      skipNextPersistedWrite = false;
      return;
    }

    return new Promise((resolve) => {
      queuedWrite = { key, value };
      queuedResolvers.push(resolve);
      if (queuedTimer !== null) return;

      queuedTimer = window.setTimeout(async () => {
        const write = queuedWrite;
        const resolvers = queuedResolvers;
        queuedWrite = null;
        queuedResolvers = [];
        queuedTimer = null;
        if (write) await writeGameSave(write.key, write.value);
        resolvers.forEach((done) => done());
      }, SAVE_DEBOUNCE_MS);
    });
  },

  async removeItem(key: string): Promise<void> {
    await removeFromIndexedDb(key);
    safeRemoveLocalStorage(key);
    safeRemoveLocalStorage(GAME_SAVE_METADATA_KEY);
  }
};

async function writeGameSave(key: string, value: string) {
  const indexed = await writeToIndexedDb(key, value);
  if (!indexed.ok) {
    const fallback = safeSetLocalStorage(key, value);
    if (!fallback.ok) reportStorageWarning(fallback);
  }

  if (indexed.ok && legacySavePendingMigration) {
    safeRemoveLocalStorage(key);
    legacySavePendingMigration = false;
  }

  const metadata = getMetadataFromPersistedValue(value);
  safeSetLocalStorage(GAME_SAVE_METADATA_KEY, JSON.stringify(metadata));

  if (process.env.NODE_ENV !== "production" && metadata.hasSave) {
    console.debug("[Save] Compact local save", {
      bytes: new Blob([value]).size,
      megabytes: Number((new Blob([value]).size / 1024 / 1024).toFixed(3)),
      aircraft: getArrayLength(value, "fleet"),
      routes: getArrayLength(value, "routes"),
      schedules: getScheduleCount(value),
      operationalFlights: getOperationalFlightCount(value)
    });
  }
}

function reportStorageWarning(result: StorageWriteResult) {
  storageWarning = result;
  if (typeof window !== "undefined") window.dispatchEvent(new Event("airline-tycoon-storage-warning"));
}

function getMetadataFromPersistedValue(value: string): SaveMetadata {
  try {
    const parsed = JSON.parse(value) as { state?: { game?: { updatedAt?: unknown } | null } };
    return {
      hasSave: Boolean(parsed.state?.game),
      updatedAt: typeof parsed.state?.game?.updatedAt === "string" ? parsed.state.game.updatedAt : null
    };
  } catch {
    return { hasSave: false, updatedAt: null };
  }
}

function getArrayLength(value: string, property: "fleet" | "routes") {
  try {
    const game = JSON.parse(value)?.state?.game;
    return Array.isArray(game?.[property]) ? game[property].length : 0;
  } catch {
    return 0;
  }
}

function getScheduleCount(value: string) {
  try {
    const fleet = JSON.parse(value)?.state?.game?.fleet;
    return Array.isArray(fleet) ? fleet.reduce((count: number, aircraft: { weeklySchedules?: unknown[] }) => count + (aircraft.weeklySchedules?.length ?? 0), 0) : 0;
  } catch {
    return 0;
  }
}

function getOperationalFlightCount(value: string) {
  try {
    const fleet = JSON.parse(value)?.state?.game?.fleet;
    return Array.isArray(fleet) ? fleet.reduce((count: number, aircraft: { schedule?: unknown[] }) => count + (aircraft.schedule?.length ?? 0), 0) : 0;
  } catch {
    return 0;
  }
}

async function openDatabase(): Promise<IDBDatabase | null> {
  if (typeof window === "undefined" || !window.indexedDB) return null;

  return new Promise((resolve) => {
    try {
      const request = window.indexedDB.open(GAME_SAVE_DB, 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(GAME_SAVE_STORE)) request.result.createObjectStore(GAME_SAVE_STORE);
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
      request.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function readFromIndexedDb(key: string): Promise<string | null> {
  const database = await openDatabase();
  if (!database) return null;

  return new Promise((resolve) => {
    try {
      const request = database.transaction(GAME_SAVE_STORE, "readonly").objectStore(GAME_SAVE_STORE).get(key);
      request.onsuccess = () => {
        const result = typeof request.result === "string" ? request.result : null;
        database.close();
        resolve(result);
      };
      request.onerror = () => {
        database.close();
        resolve(null);
      };
    } catch {
      database.close();
      resolve(null);
    }
  });
}

async function writeToIndexedDb(key: string, value: string): Promise<StorageWriteResult> {
  const database = await openDatabase();
  if (!database) return { ok: false, reason: "unavailable" };

  return new Promise((resolve) => {
    try {
      const transaction = database.transaction(GAME_SAVE_STORE, "readwrite");
      transaction.objectStore(GAME_SAVE_STORE).put(value, key);
      transaction.oncomplete = () => {
        database.close();
        resolve({ ok: true, sizeBytes: new Blob([value]).size });
      };
      transaction.onerror = () => {
        database.close();
        resolve(isQuotaExceededError(transaction.error) ? { ok: false, reason: "quota", error: transaction.error } : { ok: false, reason: "unknown", error: transaction.error });
      };
      transaction.onabort = () => {
        database.close();
        resolve(isQuotaExceededError(transaction.error) ? { ok: false, reason: "quota", error: transaction.error } : { ok: false, reason: "unknown", error: transaction.error });
      };
    } catch (error) {
      database.close();
      resolve(isQuotaExceededError(error) ? { ok: false, reason: "quota", error } : { ok: false, reason: "unknown", error });
    }
  });
}

async function removeFromIndexedDb(key: string) {
  const database = await openDatabase();
  if (!database) return;

  await new Promise<void>((resolve) => {
    try {
      const transaction = database.transaction(GAME_SAVE_STORE, "readwrite");
      transaction.objectStore(GAME_SAVE_STORE).delete(key);
      transaction.oncomplete = () => {
        database.close();
        resolve();
      };
      transaction.onerror = () => {
        database.close();
        resolve();
      };
      transaction.onabort = () => {
        database.close();
        resolve();
      };
    } catch {
      database.close();
      resolve();
    }
  });
}
