// Unit tests for CodePay auto-provision — the headless find-or-create of a
// real payment_terminals row (so batch-out works without SQL). Idempotent,
// keyed on the stable device serial; never throws.

const mockFindExisting = jest.fn();
const mockResolveIdentity = jest.fn();

let mockSettingsState: {
  selectedStore?: { id?: string; merchant_id?: string };
  selectedStation?: { id?: string };
} = {};
let mockAppId = "";

jest.mock("@/services/terminals/terminalRegistration", () => ({
  findExistingTerminalByIdentity: (...args: unknown[]) =>
    mockFindExisting(...args),
}));
jest.mock("@/services/terminals/codepayDeviceIdentity", () => ({
  resolveCodePayDeviceIdentity: () => mockResolveIdentity(),
}));
jest.mock("@/services/terminals/terminalIdentity", () => ({
  normalizeSerial: (raw: string | null | undefined) =>
    (raw ?? "").trim().toUpperCase(),
}));
jest.mock("@/stores/useStoreSettingsStore", () => ({
  useStoreSettingsStore: { getState: () => mockSettingsState },
}));
jest.mock("@/stores/useCodePayTerminalStore", () => ({
  useCodePayTerminalStore: { getState: () => ({ appId: mockAppId }) },
}));

import {
  ensureCodePayTerminalProvisioned,
  setCodePayProvisionSupabaseClient,
} from "@/services/terminals/codepayAutoProvision";

/** Chainable Supabase mock. insert→select→single resolves insertResult;
 *  update→eq/neq chains are awaitable. Records calls for assertions. */
function makeSupabase(insertResult: {
  data: { id: string } | null;
  error: { code?: string; message: string } | null;
}) {
  const calls = {
    inserted: null as Record<string, unknown> | null,
    updates: [] as { payload: Record<string, unknown>; filters: Record<string, unknown> }[],
  };
  const single = jest.fn().mockResolvedValue(insertResult);
  const from = jest.fn(() => {
    const qb: Record<string, unknown> = {};
    qb.insert = jest.fn((payload: Record<string, unknown>) => {
      calls.inserted = payload;
      return qb;
    });
    qb.select = jest.fn(() => qb);
    qb.single = single;
    qb.update = jest.fn((payload: Record<string, unknown>) => {
      const rec = { payload, filters: {} as Record<string, unknown> };
      calls.updates.push(rec);
      const chain: Record<string, unknown> = {
        eq: jest.fn((k: string, v: unknown) => {
          rec.filters[k] = v;
          return chain;
        }),
        neq: jest.fn((k: string, v: unknown) => {
          rec.filters[`neq:${k}`] = v;
          return chain;
        }),
        then: (resolve: (r: unknown) => void) =>
          resolve({ data: null, error: null }),
      };
      return chain;
    });
    return qb;
  });
  return { client: { from } as never, calls };
}

const SESSION = {
  merchantId: "m1",
  locationId: "loc1",
  stationId: "sta1",
  appId: "app_xyz",
  serial: "sn-123",
};

beforeEach(() => {
  mockFindExisting.mockReset();
  mockResolveIdentity.mockReset();
  mockSettingsState = {};
  mockAppId = "";
  setCodePayProvisionSupabaseClient(null);
});

test("creates a new codepay row when none exists", async () => {
  mockFindExisting.mockResolvedValue(null);
  const { client, calls } = makeSupabase({
    data: { id: "new-id" },
    error: null,
  });

  const res = await ensureCodePayTerminalProvisioned({
    supabase: client,
    ...SESSION,
  });

  expect(res).toMatchObject({ ok: true, created: true, terminalId: "new-id" });
  expect(res.serial).toBe("SN-123"); // normalized
  expect(calls.inserted).toMatchObject({
    location_id: "loc1",
    merchant_id: "m1",
    station_id: "sta1",
    terminal_type: "codepay",
    register_id: "app_xyz",
    connection_type: "local",
    serial_number: "SN-123",
    is_active: true,
  });
  // Siblings are deactivated (single-active-per-station).
  const deactivate = calls.updates.find(
    (u) => u.payload.is_active === false,
  );
  expect(deactivate?.filters.station_id).toBe("sta1");
  expect(deactivate?.filters["neq:id"]).toBe("new-id");
});

test("adopts the existing row when the serial already matches", async () => {
  mockFindExisting.mockResolvedValue({ id: "existing-1" });
  const { client, calls } = makeSupabase({ data: null, error: null });

  const res = await ensureCodePayTerminalProvisioned({
    supabase: client,
    ...SESSION,
  });

  expect(res).toMatchObject({
    ok: true,
    created: false,
    terminalId: "existing-1",
  });
  expect(calls.inserted).toBeNull(); // no INSERT on the adopt path
  const adopt = calls.updates.find((u) => u.filters.id === "existing-1");
  expect(adopt?.payload).toMatchObject({
    terminal_type: "codepay",
    register_id: "app_xyz",
    serial_number: "SN-123",
    station_id: "sta1",
    is_active: true,
  });
});

test("adopts on a 23505 uniqueness race instead of failing", async () => {
  mockFindExisting
    .mockResolvedValueOnce(null) // pre-insert lookup: none
    .mockResolvedValueOnce({ id: "raced-1" }); // post-collision lookup
  const { client } = makeSupabase({
    data: null,
    error: { code: "23505", message: "duplicate key" },
  });

  const res = await ensureCodePayTerminalProvisioned({
    supabase: client,
    ...SESSION,
  });

  expect(res).toMatchObject({
    ok: true,
    created: false,
    terminalId: "raced-1",
  });
});

test("returns no_supabase when no client is registered or passed", async () => {
  const res = await ensureCodePayTerminalProvisioned({ ...SESSION });
  expect(res).toEqual({ ok: false, reason: "no_supabase" });
});

test("returns missing_session when location/merchant/station absent", async () => {
  const { client } = makeSupabase({ data: { id: "x" }, error: null });
  const res = await ensureCodePayTerminalProvisioned({
    supabase: client,
    appId: "app_xyz",
    serial: "sn-1",
  });
  expect(res).toEqual({ ok: false, reason: "missing_session" });
});

test("returns no_app_id when neither param nor store has one", async () => {
  const { client } = makeSupabase({ data: { id: "x" }, error: null });
  mockAppId = ""; // store fallback also empty
  const res = await ensureCodePayTerminalProvisioned({
    supabase: client,
    merchantId: "m1",
    locationId: "loc1",
    stationId: "sta1",
    serial: "sn-1",
  });
  expect(res).toEqual({ ok: false, reason: "no_app_id" });
});

test("returns no_serial when the device identity cannot be resolved", async () => {
  mockResolveIdentity.mockResolvedValue(null);
  const { client } = makeSupabase({ data: { id: "x" }, error: null });
  const res = await ensureCodePayTerminalProvisioned({
    supabase: client,
    appId: "app_xyz",
    merchantId: "m1",
    locationId: "loc1",
    stationId: "sta1",
    // serial omitted → falls back to resolveCodePayDeviceIdentity() → null
  });
  expect(res).toEqual({ ok: false, reason: "no_serial" });
});

test("falls back to the registered client + store app_id", async () => {
  mockFindExisting.mockResolvedValue(null);
  const { client, calls } = makeSupabase({ data: { id: "n2" }, error: null });
  setCodePayProvisionSupabaseClient(client);
  mockSettingsState = {
    selectedStore: { id: "loc9", merchant_id: "m9" },
    selectedStation: { id: "sta9" },
  };
  mockAppId = "store_app";
  mockResolveIdentity.mockResolvedValue({ serial: "hw9", source: "hardware" });

  const res = await ensureCodePayTerminalProvisioned();

  expect(res).toMatchObject({ ok: true, terminalId: "n2", serial: "HW9" });
  expect(calls.inserted).toMatchObject({
    location_id: "loc9",
    merchant_id: "m9",
    station_id: "sta9",
    register_id: "store_app",
    serial_number: "HW9",
  });
});
