/**
 * Phase 1 measurement harness — the deliverable that turns the provisional
 * retention caps in lib/db/entities.ts into derived ones.
 *
 * The caps cannot be guessed and must not be inherited. The existing MMKV-era
 * constants (MAX_CACHED_ORDERS = 200, KDS_DONE_TICKET_LIMIT = 50, the
 * .slice(0, N)s) were sized for in-memory JSON blobs with no query engine —
 * a completely different constraint. Carrying them across would be patching an
 * old limit into a new design.
 *
 * The derivation (plan §5.2):
 *
 *   1. Write N real rows per table on device; read page_count x page_size;
 *      record bytes-per-row INCLUDING indexes. The payload column dominates
 *      and varies a lot between a 2-item order and a 20-item one, which is
 *      why this measures real rows rather than synthetic uniform ones.
 *   2. Set a total mirror storage budget from the WORST hardware in the fleet.
 *   3. Establish each table's workload requirement — for orders, "how far back
 *      does a cashier actually look up a check?", answerable from
 *      usePreviousOrdersStore telemetry, not intuition.
 *   4. cap = min(budget / bytes-per-row, workload x safety factor).
 *
 * This module does step 1 and reports it. Steps 2-4 are judgement calls that
 * belong in the plan doc, with the numbers recorded beside them.
 *
 * DEV-ONLY. Never called on a production boot path — it writes and deletes
 * throwaway rows.
 */
import { getDb, getDbSizeBytes, getTableRowCounts } from "@/lib/db/index";
import type { TableName } from "@/lib/db/schema";

export interface TableSizeSample {
  table: TableName;
  rows: number;
  /** Total DB growth attributable to these rows, including index pages. */
  bytesDelta: number;
  bytesPerRow: number;
}

export interface MirrorSizeReport {
  samples: TableSizeSample[];
  dbSizeBytes: number | null;
  rowCounts: Record<string, number>;
  measuredAt: string;
}

/**
 * Measure bytes-per-row for one table by inserting real rows and diffing the
 * file size.
 *
 * Runs inside a transaction that is COMMITTED, not rolled back — a rollback
 * would leave the page count unchanged and report zero. The rows are deleted
 * afterwards, but note SQLite does not shrink the file on DELETE, so the
 * measurement is of *allocated* growth. That is the right number: unreclaimed
 * space is precisely what a storage budget has to survive.
 */
export async function measureTable(
  table: TableName,
  rows: Record<string, string | number | null>[],
): Promise<TableSizeSample | null> {
  const db = getDb();
  if (!db || rows.length === 0) return null;

  const before = await getDbSizeBytes();
  if (before === null) return null;

  const cols = Object.keys(rows[0]);
  const sql = `INSERT OR REPLACE INTO ${table} (${cols
    .map((c) => `"${c}"`)
    .join(", ")}) VALUES (${cols.map(() => "?").join(", ")})`;

  await db.withTransactionAsync(async () => {
    for (const row of rows) {
      await db.runAsync(
        sql,
        cols.map((c) => row[c]),
      );
    }
  });

  const after = await getDbSizeBytes();
  if (after === null) return null;

  const bytesDelta = after - before;
  return {
    table,
    rows: rows.length,
    bytesDelta,
    bytesPerRow: Math.round(bytesDelta / rows.length),
  };
}

/** Remove rows written by a measurement run. */
export async function cleanupMeasurement(
  table: TableName,
  ids: string[],
  idColumn = "id",
): Promise<void> {
  const db = getDb();
  if (!db || ids.length === 0) return;
  const placeholders = ids.map(() => "?").join(", ");
  await db.runAsync(
    `DELETE FROM ${table} WHERE "${idColumn}" IN (${placeholders})`,
    ids,
  );
}

/**
 * Snapshot for the storage monitor and for the Phase 1 report. Cheap — two
 * pragma reads plus one COUNT(*) per table — but the COUNTs make it O(rows),
 * so call it on demand rather than on the boot path.
 */
export async function getMirrorSizeReport(): Promise<MirrorSizeReport> {
  return {
    samples: [],
    dbSizeBytes: await getDbSizeBytes(),
    rowCounts: await getTableRowCounts(),
    measuredAt: new Date().toISOString(),
  };
}

/**
 * Human-readable summary for the dev console. Deliberately plain text — this
 * gets pasted into the plan doc's §11 table, and a formatted blob is easier to
 * transcribe than a JSON dump.
 */
export function formatSizeReport(report: MirrorSizeReport): string {
  const lines: string[] = [
    `Local DB size: ${formatBytes(report.dbSizeBytes)}`,
    `Measured at:   ${report.measuredAt}`,
    "",
    "Rows per table:",
  ];
  for (const [table, count] of Object.entries(report.rowCounts)) {
    lines.push(`  ${table.padEnd(28)} ${count}`);
  }
  if (report.samples.length > 0) {
    lines.push("", "Bytes per row (incl. indexes):");
    for (const s of report.samples) {
      lines.push(
        `  ${s.table.padEnd(28)} ${s.bytesPerRow} B/row  (${s.rows} rows, ${formatBytes(s.bytesDelta)})`,
      );
    }
  }
  return lines.join("\n");
}

function formatBytes(bytes: number | null): string {
  if (bytes === null) return "unavailable";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
