/**
 * expo-sqlite test double backed by a REAL SQLite engine (node:sqlite, built
 * into Node 22+).
 *
 * A hand-written fake would be worse than no test here. The things Phase 1
 * actually has to prove are all SQL behaviours:
 *
 *   - the retention DELETE keeps exactly `cap` newest rows
 *   - ON DELETE CASCADE removes child rows when a parent is pruned
 *   - the immutable-id trigger aborts an UPDATE OF id
 *   - partial indexes (`WHERE voided_at IS NULL`) parse and apply
 *   - ON CONFLICT DO UPDATE upserts rather than duplicating
 *
 * None of that is exercised by a Map pretending to be a database. This adapter
 * translates expo-sqlite's async surface onto node:sqlite's synchronous one,
 * so the SQL under test is the same SQL that ships.
 *
 * Databases are in-memory and keyed by name, so a test can reopen "the same"
 * database and see its rows, and deleteDatabaseAsync genuinely drops them.
 */
const { DatabaseSync } = require("node:sqlite");

/** name -> DatabaseSync. Mirrors on-device file persistence across opens. */
const databases = new Map();

function wrap(raw, name) {
  return {
    _raw: raw,
    _name: name,

    async execAsync(sql) {
      raw.exec(sql);
    },

    async runAsync(sql, params = []) {
      const stmt = raw.prepare(sql);
      const result = stmt.run(...normalize(params));
      return {
        changes: Number(result.changes ?? 0),
        lastInsertRowId: Number(result.lastInsertRowid ?? 0),
      };
    },

    async getAllAsync(sql, params = []) {
      return raw.prepare(sql).all(...normalize(params));
    },

    async getFirstAsync(sql, params = []) {
      const row = raw.prepare(sql).get(...normalize(params));
      return row ?? null;
    },

    /**
     * Real BEGIN/COMMIT/ROLLBACK — the rollback path is what the write-failure
     * test depends on, so faking it would hide the bug it exists to catch.
     */
    async withTransactionAsync(fn) {
      raw.exec("BEGIN");
      try {
        await fn();
        raw.exec("COMMIT");
      } catch (error) {
        try {
          raw.exec("ROLLBACK");
        } catch {
          /* already rolled back */
        }
        throw error;
      }
    },

    async closeAsync() {
      try {
        raw.close();
      } catch {
        /* already closed */
      }
      databases.delete(name);
    },
  };
}

/** node:sqlite rejects undefined and booleans; SQLite has neither. */
function normalize(params) {
  return params.map((p) => {
    if (p === undefined) return null;
    if (typeof p === "boolean") return p ? 1 : 0;
    return p;
  });
}

async function openDatabaseAsync(name) {
  let raw = databases.get(name);
  if (!raw) {
    raw = new DatabaseSync(":memory:");
    databases.set(name, raw);
  }
  return wrap(raw, name);
}

async function deleteDatabaseAsync(name) {
  const raw = databases.get(name);
  if (raw) {
    try {
      raw.close();
    } catch {
      /* already closed */
    }
    databases.delete(name);
  }
}

/** Test helper: drop every database between test files. */
function __resetAllDatabases() {
  for (const raw of databases.values()) {
    try {
      raw.close();
    } catch {
      /* ignore */
    }
  }
  databases.clear();
}

module.exports = {
  openDatabaseAsync,
  deleteDatabaseAsync,
  openDatabaseSync: (name) => {
    throw new Error(`openDatabaseSync("${name}") is not used by lib/db`);
  },
  __resetAllDatabases,
};
