/**
 * Purchase-order numbering — client contract.
 *
 * Numbering moved out of the client and into the database (see
 * utils/supabase/migrations/purchase_orders_po_number_integrity.sql).
 * The client used to read COUNT(*) and write COUNT+1, which meant two
 * stations creating a PO at the same moment both read N and both wrote
 * N+1, and deleting a PO made the next number reuse one already taken.
 *
 * These tests pin the client half of that contract: the app must not
 * send a po_number, and must not pre-read a count to build one. If
 * either comes back, the race comes back with it — and now that
 * po_number is unique per (merchant, location), a re-introduced
 * duplicate surfaces as a failed insert in front of a user.
 *
 * # Testability gap
 *
 * The generator itself is SQL and is NOT covered here. Jest cannot
 * exercise a BEFORE INSERT trigger or an advisory lock. Still needs a
 * real Postgres (staging or Supabase local dev) to verify:
 *   - MAX+1 allocation, including after a delete
 *   - padding that grows past 4 digits without lpad() truncating
 *   - two concurrent inserts in one scope getting distinct numbers
 *   - legacy PO-YYYY-MM-NNN rows left untouched and not counted
 * The migration's own step-7 DO block asserts the post-state at apply
 * time; the concurrency case needs two live connections.
 */

jest.mock("@/lib/storage", () => {
  const mem = new Map<string, unknown>();
  return {
    storage: {
      getString: jest.fn((k: string) => mem.get(k) as string | undefined),
      set: jest.fn((k: string, v: unknown) => mem.set(k, v)),
      delete: jest.fn((k: string) => mem.delete(k)),
      contains: jest.fn((k: string) => mem.has(k)),
      getBoolean: jest.fn((k: string) => mem.get(k) as boolean | undefined),
      getNumber: jest.fn((k: string) => mem.get(k) as number | undefined),
    },
    getSyncJSON: jest.fn(() => null),
    setSyncJSON: jest.fn(),
    mmkvStorage: {
      getItem: jest.fn(),
      setItem: jest.fn(),
      removeItem: jest.fn(),
    },
  };
});

jest.mock("@/stores/useStoreSettingsStore", () => ({
  useStoreSettingsStore: {
    getState: () => ({
      selectedStore: { id: "loc-1", merchant_id: "merch-1" },
    }),
  },
}));

jest.mock("@/stores/useEmployeeStore", () => ({
  useEmployeeStore: {
    getState: () => ({
      activeEmployeeId: "emp-1",
      employees: [{ id: "emp-1", fullName: "Test Employee" }],
    }),
  },
}));

jest.mock("@/stores/useMenuStore", () => ({
  useMenuStore: { getState: () => ({ menuItems: [], categories: [] }) },
}));

jest.mock("@/services/inventoryService", () => ({
  InventoryService: {
    deleteInventoryItem: jest.fn(),
    createInventoryItem: jest.fn(),
    updateInventoryItem: jest.fn(),
  },
}));

// Must follow the jest.mock calls above — they are hoisted, the import is not.
// eslint-disable-next-line import/first
import { useInventoryStore } from "@/stores/useInventoryStore";

type RecordedCall = {
  table: string;
  op: "insert" | "update" | "delete" | "select";
  payload?: any;
  options?: any;
};

let calls: RecordedCall[] = [];

/**
 * Minimal PostgREST-shaped fake. Every builder method returns the
 * builder; the builder is thenable so bare `await from().insert()`
 * resolves, and `.single()` returns the row the database would have
 * assigned a number to.
 */
const makeSupabase = () => {
  const makeBuilder = (table: string) => {
    const builder: any = {
      insert: (payload: any) => {
        calls.push({ table, op: "insert", payload });
        return builder;
      },
      update: (payload: any) => {
        calls.push({ table, op: "update", payload });
        return builder;
      },
      delete: () => {
        calls.push({ table, op: "delete" });
        return builder;
      },
      select: (columns?: string, options?: any) => {
        calls.push({ table, op: "select", payload: columns, options });
        return builder;
      },
      eq: () => builder,
      or: () => builder,
      order: () => builder,
      single: async () => ({
        data: { id: "row-1", po_number: "PO-0007" },
        error: null,
      }),
      then: (resolve: (value: any) => unknown) =>
        Promise.resolve(resolve({ data: [], error: null, count: 0 })),
    };
    return builder;
  };

  return { from: (table: string) => makeBuilder(table) } as any;
};

const insertsInto = (table: string) =>
  calls.filter((c) => c.table === table && c.op === "insert");

/** The COUNT(*) probe the old client generators used. */
const countProbes = () =>
  calls.filter(
    (c) =>
      c.op === "select" && c.options?.head === true && c.options?.count != null,
  );

beforeEach(() => {
  calls = [];
  useInventoryStore.setState({
    supabase: makeSupabase(),
    inventoryItems: [],
    vendors: [],
    purchaseOrders: [],
    externalExpenses: [],
  });
});

describe("createPurchaseOrder", () => {
  const draftPo = {
    vendorId: "vendor-1",
    status: "Draft" as const,
    items: [{ inventoryItemId: "item-1", quantity: 2, cost: 5 }],
  };

  it("does not send po_number — the database assigns it", async () => {
    await useInventoryStore.getState().createPurchaseOrder(draftPo);

    const [poInsert] = insertsInto("purchase_orders");
    expect(poInsert).toBeDefined();
    expect(Object.keys(poInsert.payload)).not.toContain("po_number");
  });

  it("does not pre-read a count to build a number", async () => {
    await useInventoryStore.getState().createPurchaseOrder(draftPo);

    expect(countProbes()).toHaveLength(0);
  });

  it("asks for the assigned number back on the returning row", async () => {
    await useInventoryStore.getState().createPurchaseOrder(draftPo);

    const returning = calls.find(
      (c) =>
        c.table === "purchase_orders" &&
        c.op === "select" &&
        typeof c.payload === "string" &&
        c.payload.includes("po_number") &&
        c.payload.includes("id"),
    );
    expect(returning).toBeDefined();
  });
});

describe("addExternalExpense", () => {
  const expense = {
    totalAmount: 12,
    purchasedByEmployeeId: "emp-1",
    purchasedByEmployeeName: "Test Employee",
    purchasedAt: "2026-08-17T10:00:00.000Z",
    items: [
      {
        inventoryItemId: "item-1",
        itemName: "Napkins",
        quantity: 1,
        unitPrice: 12,
        totalAmount: 12,
      },
    ],
  };

  it("does not send po_number for the EXP- series either", async () => {
    await useInventoryStore.getState().addExternalExpense(expense);

    const [expenseInsert] = insertsInto("purchase_orders");
    expect(expenseInsert).toBeDefined();
    expect(expenseInsert.payload.is_adhoc_expense).toBe(true);
    expect(Object.keys(expenseInsert.payload)).not.toContain("po_number");
  });

  it("does not pre-read a count to build a number", async () => {
    await useInventoryStore.getState().addExternalExpense(expense);

    expect(countProbes()).toHaveLength(0);
  });
});
