import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

type SqlValue = string | number | bigint | Buffer | null;

let db: Database.Database | null = null;
let dbFilePath = "";

function nowIso(): string {
  return new Date().toISOString();
}

function ensureDirectory(path: string) {
  mkdirSync(dirname(path), { recursive: true });
}

function getDatabase(): Database.Database {
  if (!db) {
    throw new Error("Datenbank ist nicht initialisiert.");
  }

  return db;
}

function initSchema() {
  const database = getDatabase();
  database.exec(`
    CREATE TABLE IF NOT EXISTS rooms (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS storage_locations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      roomId INTEGER NOT NULL,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      description TEXT,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      FOREIGN KEY (roomId) REFERENCES rooms(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      storageLocationId INTEGER NOT NULL,
      name TEXT NOT NULL,
      quantity REAL NOT NULL DEFAULT 0,
      unit TEXT NOT NULL,
      category TEXT,
      minimumQuantity REAL,
      expirationDate TEXT,
      notes TEXT,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      FOREIGN KEY (storageLocationId) REFERENCES storage_locations(id) ON DELETE CASCADE
    );
  `);
}

export async function initializeDatabase(path: string) {
  dbFilePath = path;
  ensureDirectory(path);
  db = new Database(path, { timeout: 5000 });
  db.pragma("journal_mode = WAL");
  db.pragma("synchronous = NORMAL");
  db.pragma("foreign_keys = ON");
  db.pragma("busy_timeout = 5000");
  db.pragma("temp_store = MEMORY");
  initSchema();
}

export function closeDatabase() {
  if (db?.open) {
    db.close();
  }
  db = null;
}

export function getDatabasePath() {
  return dbFilePath;
}

export function queryAll<T>(statement: string, params: SqlValue[] = []): T[] {
  return getDatabase().prepare<SqlValue[], T>(statement).all(...params);
}

export function queryOne<T>(statement: string, params: SqlValue[] = []): T | null {
  return getDatabase().prepare<SqlValue[], T>(statement).get(...params) ?? null;
}

export function insertAndGetId(statement: string, params: SqlValue[] = []) {
  const result = getDatabase().prepare(statement).run(...params);
  return Number(result.lastInsertRowid);
}

export function runAndPersist(statement: string, params: SqlValue[] = []) {
  return getDatabase().prepare(statement).run(...params);
}

export function withTransaction<T>(handler: () => T): T {
  return getDatabase().transaction(handler)();
}

export function checkpointDatabase() {
  getDatabase().pragma("wal_checkpoint(TRUNCATE)");
}

export async function createBackupFile(destinationFile: string) {
  ensureDirectory(destinationFile);
  await getDatabase().backup(destinationFile);
}

export function touchTimestamp() {
  return nowIso();
}
