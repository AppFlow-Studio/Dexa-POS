/**
 * A fake PostgREST server good enough to drive the delta engine honestly.
 *
 * This is NOT a mock that returns canned pages. It holds a row table and
 * actually implements the filter/order/limit semantics the descriptor relies
 * on — including the `or(...)` keyset predicate, which is the single most
 * important thing Phase 2 has to get right and the easiest to fake away.
 *
 * It also counts requests, so a test can assert the steady-state property:
 * a quiet minute costs ONE round trip returning ZERO rows.
 */

export interface FakeRow {
  id: string;
  updated_at: string;
  created_at: string;
  location_id: string;
  [key: string]: unknown;
}

interface Filter {
  kind: "eq" | "gt" | "gte";
  column: string;
  value: string;
}

interface OrClause {
  column: string;
  value: string;
  pkColumn: string;
  pkValue: string;
}

export class FakeSupabase {
  rows: FakeRow[] = [];
  /** Every select() issued — the round-trip counter. */
  requests: Array<{ table: string; limit: number | null }> = [];
  /** Set to make the next select() reject, for failure-path tests. */
  failNext: Error | null = null;
  /** Columns requested by the last select(), for embed assertions. */
  lastSelect = "";

  constructor(rows: FakeRow[] = []) {
    this.rows = [...rows];
  }

  get requestCount(): number {
    return this.requests.length;
  }

  reset(): void {
    this.requests = [];
    this.failNext = null;
  }

  from(table: string) {
    return new FakeQuery(this, table);
  }
}

class FakeQuery {
  private filters: Filter[] = [];
  private orClause: OrClause | null = null;
  private orders: Array<{ column: string; ascending: boolean }> = [];
  private limitValue: number | null = null;

  constructor(
    private db: FakeSupabase,
    private table: string,
  ) {}

  select(columns = "*") {
    this.db.lastSelect = columns;
    return this;
  }

  eq(column: string, value: string) {
    this.filters.push({ kind: "eq", column, value });
    return this;
  }

  gt(column: string, value: string) {
    this.filters.push({ kind: "gt", column, value });
    return this;
  }

  gte(column: string, value: string) {
    this.filters.push({ kind: "gte", column, value });
    return this;
  }

  /**
   * Parses exactly the shape the descriptor emits:
   *   `wm.gt."X",and(wm.eq."X",id.gt."Y")`
   *
   * Parsing rather than pattern-matching is deliberate — if the descriptor
   * ever emits a malformed filter, this throws in a test instead of silently
   * returning everything, which is how a keyset bug would otherwise hide.
   */
  or(expression: string) {
    const match = expression.match(
      /^(\w+)\.gt\."([^"]+)",and\((\w+)\.eq\."([^"]+)",(\w+)\.gt\."([^"]+)"\)$/,
    );
    if (!match) {
      throw new Error(`FakeSupabase: unparseable or() filter: ${expression}`);
    }
    const [, col, val, eqCol, eqVal, pkCol, pkVal] = match;
    if (col !== eqCol || val !== eqVal) {
      throw new Error(
        `FakeSupabase: inconsistent keyset filter — ${col}/${val} vs ${eqCol}/${eqVal}`,
      );
    }
    this.orClause = {
      column: col,
      value: val,
      pkColumn: pkCol,
      pkValue: pkVal,
    };
    return this;
  }

  order(column: string, opts: { ascending?: boolean } = {}) {
    this.orders.push({ column, ascending: opts.ascending !== false });
    return this;
  }

  limit(n: number) {
    this.limitValue = n;
    return this.execute();
  }

  then(resolve: (v: unknown) => unknown) {
    return this.execute().then(resolve);
  }

  private async execute() {
    this.db.requests.push({ table: this.table, limit: this.limitValue });

    if (this.db.failNext) {
      const error = this.db.failNext;
      this.db.failNext = null;
      return { data: null, error };
    }

    let out = this.db.rows.filter((row) => {
      for (const f of this.filters) {
        const cell = String(row[f.column] ?? "");
        if (f.kind === "eq" && cell !== f.value) return false;
        if (f.kind === "gt" && !(cell > f.value)) return false;
        if (f.kind === "gte" && !(cell >= f.value)) return false;
      }
      if (this.orClause) {
        const wm = String(row[this.orClause.column] ?? "");
        const pk = String(row[this.orClause.pkColumn] ?? "");
        const pastWatermark = wm > this.orClause.value;
        const tiedButLaterId =
          wm === this.orClause.value && pk > this.orClause.pkValue;
        if (!pastWatermark && !tiedButLaterId) return false;
      }
      return true;
    });

    for (const o of [...this.orders].reverse()) {
      out = [...out].sort((a, b) => {
        const av = String(a[o.column] ?? "");
        const bv = String(b[o.column] ?? "");
        const cmp = av < bv ? -1 : av > bv ? 1 : 0;
        return o.ascending ? cmp : -cmp;
      });
    }

    if (this.limitValue !== null) out = out.slice(0, this.limitValue);

    return { data: out, error: null };
  }
}

/** Build a server order row with sensible defaults. */
export function serverOrder(
  id: string,
  updatedAt: string,
  overrides: Partial<FakeRow> = {},
): FakeRow {
  return {
    id,
    location_id: "loc-1",
    merchant_id: "m-1",
    order_number: id,
    order_type: "dine_in",
    order_source: "pos",
    status: "completed",
    payment_status: "paid",
    subtotal: 10,
    tax_amount: 0.89,
    total_amount: 10.89,
    discount_amount: 0,
    service_charge: 0,
    tip_amount: 0,
    amount_due: 0,
    amount_paid: 10.89,
    reopen_count: 0,
    created_at: updatedAt,
    updated_at: updatedAt,
    sync_version: 1,
    order_items: [],
    order_payments: [],
    ...overrides,
  };
}

export function isoAt(minutes: number): string {
  return new Date(Date.UTC(2026, 0, 1) + minutes * 60_000).toISOString();
}
