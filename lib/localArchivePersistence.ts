import type { LocalArchiveData } from "@/lib/localArchiveStore";

const DB_NAME = "panocode-local-archives";
const STORE_NAME = "archives";
const DB_VERSION = 1;
const MAX_ARCHIVE_RECORDS = 5;
const ARCHIVE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

type StoredArchiveRecord = LocalArchiveData & {
  savedAt: number;
};

export type LocalArchiveSummary = {
  key: string;
  name: string;
  savedAt: number;
};

function openArchiveDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error ?? new Error("Failed to open IndexedDB"));
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "key" });
      }
    };
  });
}

export async function saveArchiveToIndexedDb(archive: LocalArchiveData): Promise<void> {
  const db = await openArchiveDb();

  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    store.put({ ...archive, savedAt: Date.now() });

    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("Failed to save archive"));
    transaction.onabort = () => reject(transaction.error ?? new Error("Archive save aborted"));
  });

  await pruneArchiveRecords(db);

  db.close();
}

export async function loadArchiveFromIndexedDb(key: string): Promise<LocalArchiveData | null> {
  const db = await openArchiveDb();

  const result = await new Promise<LocalArchiveData | null>((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readonly");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(key);

    request.onsuccess = () => {
      const value = request.result as StoredArchiveRecord | undefined;
      if (!value) {
        resolve(null);
        return;
      }

      if (Date.now() - value.savedAt > ARCHIVE_TTL_MS) {
        resolve(null);
        return;
      }

      resolve({
        key: value.key,
        name: value.name,
        tree: value.tree,
        files: value.files,
      });
    };
    request.onerror = () => reject(request.error ?? new Error("Failed to load archive"));
  });

  db.close();
  return result;
}

export async function listArchiveSummaries(): Promise<LocalArchiveSummary[]> {
  const db = await openArchiveDb();
  await pruneArchiveRecords(db);
  const records = await listArchiveRecords(db);
  db.close();

  return records
    .filter((record) => Date.now() - record.savedAt <= ARCHIVE_TTL_MS)
    .sort((left, right) => right.savedAt - left.savedAt)
    .map((record) => ({
      key: record.key,
      name: record.name,
      savedAt: record.savedAt,
    }));
}

export async function removeArchiveFromIndexedDb(key: string): Promise<void> {
  const db = await openArchiveDb();
  await deleteArchiveRecord(db, key);
  db.close();
}

export async function clearArchivesFromIndexedDb(): Promise<void> {
  const db = await openArchiveDb();

  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    store.clear();

    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("Failed to clear archives"));
    transaction.onabort = () => reject(transaction.error ?? new Error("Archive clear aborted"));
  });

  db.close();
}

async function listArchiveRecords(db: IDBDatabase): Promise<StoredArchiveRecord[]> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readonly");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.getAll();

    request.onsuccess = () => resolve((request.result as StoredArchiveRecord[] | undefined) ?? []);
    request.onerror = () => reject(request.error ?? new Error("Failed to list archives"));
  });
}

async function deleteArchiveRecord(db: IDBDatabase, key: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    store.delete(key);

    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("Failed to delete archive"));
    transaction.onabort = () => reject(transaction.error ?? new Error("Archive delete aborted"));
  });
}

async function pruneArchiveRecords(db: IDBDatabase): Promise<void> {
  const records = await listArchiveRecords(db);
  const now = Date.now();

  const expired = records.filter((record) => now - record.savedAt > ARCHIVE_TTL_MS);
  for (const record of expired) {
    await deleteArchiveRecord(db, record.key);
  }

  const freshRecords = records
    .filter((record) => now - record.savedAt <= ARCHIVE_TTL_MS)
    .sort((left, right) => right.savedAt - left.savedAt);

  for (const record of freshRecords.slice(MAX_ARCHIVE_RECORDS)) {
    await deleteArchiveRecord(db, record.key);
  }
}