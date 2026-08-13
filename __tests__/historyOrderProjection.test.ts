import {
  HISTORY_DISCOUNT_COLUMNS,
  HISTORY_ITEM_COLUMNS,
  HISTORY_PAYMENT_COLUMNS,
} from "@/services/historyOrderProjection";
import fs from "fs";
import path from "path";

/**
 * The Previous Orders page query names its nested columns explicitly instead of
 * `*`. That is the whole point — `order_items(*)` shipped 68 columns for the 26
 * the transform reads — but it introduces a failure mode `*` never had: a
 * column name that doesn't exist makes PostgREST reject the request, and the
 * entire list fails to load rather than one field being blank.
 *
 * So the names are checked against the generated schema types. This catches
 * both a typo and a column dropped by a future migration, at test time instead
 * of on a merchant's tablet.
 */
function rowColumns(table: string): string[] {
  const source = fs.readFileSync(
    path.join(__dirname, "..", "database.types.ts"),
    "utf8",
  );
  const lines = source.split(/\r?\n/);
  const tableLine = lines.indexOf(`      ${table}: {`);
  if (tableLine === -1) throw new Error(`table ${table} not in database.types`);

  const rowLine = lines.indexOf("        Row: {", tableLine);
  if (rowLine === -1) throw new Error(`Row block for ${table} not found`);

  const columns: string[] = [];
  for (let i = rowLine + 1; i < lines.length; i++) {
    if (lines[i] === "        }") break;
    const match = lines[i].match(/^ {10}([a-z0-9_]+)\??:/);
    if (match) columns.push(match[1]);
  }
  if (columns.length === 0) throw new Error(`no columns parsed for ${table}`);
  return columns;
}

describe("Previous Orders nested projections", () => {
  const cases: [string, string][] = [
    ["order_items", HISTORY_ITEM_COLUMNS],
    ["order_payments", HISTORY_PAYMENT_COLUMNS],
    ["order_discounts", HISTORY_DISCOUNT_COLUMNS],
  ];

  it.each(cases)("every %s column exists in the schema", (table, projection) => {
    const actual = new Set(rowColumns(table));
    const missing = projection.split(",").filter((c) => !actual.has(c));
    expect(missing).toEqual([]);
  });

  it.each(cases)("%s projection has no duplicates", (_table, projection) => {
    const columns = projection.split(",");
    expect(columns).toHaveLength(new Set(columns).size);
  });

  it.each(cases)("%s projection is narrower than the full row", (table, projection) => {
    // If a projection ever grows to the full row it has stopped paying for the
    // maintenance burden above, and `*` would be the honest choice.
    expect(projection.split(",").length).toBeLessThan(rowColumns(table).length);
  });

  it("keeps the payment blobs the RRN and entry-mode fallbacks parse", () => {
    // normalizeFetchedPayment reads rrn out of processor_response and
    // terminal_response when the column itself is null. Dropping these as
    // "big unused JSON" would blank the RRN on card receipts.
    expect(HISTORY_PAYMENT_COLUMNS).toContain("processor_response");
    expect(HISTORY_PAYMENT_COLUMNS).toContain("terminal_response");
  });

  it("drops the payment blobs nothing reads", () => {
    for (const column of [
      "emv_data",
      "terminal_request",
      "card_token",
      "metadata",
      "processor_response_text",
      "dejavoo_response_message",
    ]) {
      expect(HISTORY_PAYMENT_COLUMNS.split(",")).not.toContain(column);
    }
  });

  it("keeps voided_at on discounts, which the row filter reads", () => {
    expect(HISTORY_DISCOUNT_COLUMNS.split(",")).toContain("voided_at");
  });
});
