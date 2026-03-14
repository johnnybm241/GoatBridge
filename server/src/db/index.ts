import initSqlJs from 'sql.js';
import { drizzle } from 'drizzle-orm/sql-js';
import * as schema from './schema.js';
import { config } from '../config.js';
import path from 'path';
import fs from 'fs';

const dbPath = path.resolve(config.databasePath);
const dir = path.dirname(dbPath);
if (!fs.existsSync(dir)) {
  fs.mkdirSync(dir, { recursive: true });
}

// sql.js requires async initialization
const SQL = await initSqlJs();

// Load existing DB from disk or create new
const sqliteDb = fs.existsSync(dbPath)
  ? new SQL.Database(fs.readFileSync(dbPath))
  : new SQL.Database();

// Persist to disk after each write — debounced 500ms
let persistTimer: ReturnType<typeof setTimeout> | null = null;
function schedulePersist() {
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    const data = sqliteDb.export();
    fs.writeFileSync(dbPath, Buffer.from(data));
    persistTimer = null;
  }, 500);
}

// Proxy to intercept write operations
export const sqlite = {
  db: sqliteDb,
  exec(sql: string) {
    sqliteDb.exec(sql);
    schedulePersist();
  },
  run(sql: string, params?: unknown[]) {
    const stmt = sqliteDb.prepare(sql);
    stmt.run(params as unknown[]);
    stmt.free();
    schedulePersist();
  },
  get<T = unknown>(sql: string, params?: unknown[]): T | undefined {
    const stmt = sqliteDb.prepare(sql);
    stmt.bind(params as unknown[]);
    const row = stmt.step() ? stmt.getAsObject() : undefined;
    stmt.free();
    return row as T | undefined;
  },
  all<T = unknown>(sql: string, params?: unknown[]): T[] {
    const stmt = sqliteDb.prepare(sql);
    stmt.bind(params as unknown[]);
    const rows: T[] = [];
    while (stmt.step()) {
      rows.push(stmt.getAsObject() as T);
    }
    stmt.free();
    return rows;
  },
  prepare(sql: string) {
    return {
      run: (...params: unknown[]) => {
        const stmt = sqliteDb.prepare(sql);
        stmt.run(params);
        stmt.free();
        schedulePersist();
      },
      get: <T = unknown>(...params: unknown[]): T | undefined => {
        const stmt = sqliteDb.prepare(sql);
        stmt.bind(params);
        const row = stmt.step() ? stmt.getAsObject() : undefined;
        stmt.free();
        return row as T | undefined;
      },
      all: <T = unknown>(...params: unknown[]): T[] => {
        const stmt = sqliteDb.prepare(sql);
        stmt.bind(params);
        const rows: T[] = [];
        while (stmt.step()) rows.push(stmt.getAsObject() as T);
        stmt.free();
        return rows;
      },
    };
  },
  transaction<T>(fn: () => T): () => T {
    return () => {
      sqliteDb.exec('BEGIN');
      try {
        const result = fn();
        sqliteDb.exec('COMMIT');
        schedulePersist();
        return result;
      } catch (e) {
        sqliteDb.exec('ROLLBACK');
        throw e;
      }
    };
  },
};

export const db = drizzle(sqliteDb, { schema });
