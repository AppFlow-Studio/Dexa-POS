/**
 * Environment guard — staging<->production isolation.
 *
 * Locks in the safety contract for the boot-time env reconciliation in
 * lib/storage.ts:
 *   - A MISSING prior signature (fresh install / first upgrade) NEVER wipes
 *     state — it only records the baseline. This protects existing devices from
 *     being reset just by shipping the guard.
 *   - A MATCHING signature is a pure no-op.
 *   - A CHANGED signature (real staging<->prod switch) purges general + sync
 *     storage and the Clerk session, while preserving the env-agnostic device id.
 *
 * The switch path is what fixes the "Cannot coerce the result to a single JSON
 * object" RLS error caused by a stale selectedStore.id / Clerk token surviving
 * an environment change.
 */

const GENERAL = "dexa-pos-general";
const SECURE = "dexa-pos-secure";
const SYNC = "dexa-pos-sync";
const SIG_KEY = "app_env_signature";
const DEVICE_ID_KEY = "dexa-pos-device-id";

function makeMmkvMock() {
  const stores = new Map<string, Map<string, string>>();
  const clearAllCalls: string[] = [];
  const inst = (id: string) => {
    if (!stores.has(id)) stores.set(id, new Map());
    return stores.get(id)!;
  };
  const createMMKV = ({ id }: { id: string }) => {
    const m = inst(id);
    return {
      getString: (k: string) => m.get(k),
      set: (k: string, v: string) => void m.set(k, v),
      remove: (k: string) => void m.delete(k),
      contains: (k: string) => m.has(k),
      getAllKeys: () => Array.from(m.keys()),
      clearAll: () => {
        clearAllCalls.push(id);
        m.clear();
      },
    };
  };
  return { createMMKV, inst, clearAllCalls };
}

const OLD_ENV = process.env;

function loadStorageWith(mock: ReturnType<typeof makeMmkvMock>) {
  jest.isolateModules(() => {
    jest.doMock("react-native-mmkv", () => ({ createMMKV: mock.createMMKV }));
    require("@/lib/storage");
  });
}

afterEach(() => {
  process.env = OLD_ENV;
});

describe("computeEnvSignature", () => {
  beforeEach(() => {
    jest.resetModules();
    process.env = { ...OLD_ENV };
  });

  it("derives <ref>|live from production-style vars", () => {
    process.env.EXPO_PUBLIC_SUPABASE_URL =
      "https://hifouuofcaytijrkbvcy.supabase.co";
    process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY = "pk_live_abc123";
    const { computeEnvSignature } = require("@/lib/envSignature");
    expect(computeEnvSignature()).toBe("hifouuofcaytijrkbvcy|live");
  });

  it("derives <ref>|test from staging-style vars", () => {
    process.env.EXPO_PUBLIC_SUPABASE_URL =
      "https://dfwqakoyittmrwbqvxgw.supabase.co";
    process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY = "pk_test_xyz789";
    const { computeEnvSignature } = require("@/lib/envSignature");
    expect(computeEnvSignature()).toBe("dfwqakoyittmrwbqvxgw|test");
  });

  it("falls back to unknown when env unset", () => {
    delete process.env.EXPO_PUBLIC_SUPABASE_URL;
    delete process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY;
    const { computeEnvSignature } = require("@/lib/envSignature");
    expect(computeEnvSignature()).toBe("unknown|unknown");
  });
});

describe("reconcileEnvironmentOnBoot (via lib/storage import)", () => {
  beforeEach(() => {
    jest.resetModules();
    process.env = { ...OLD_ENV };
  });

  it("does NOT clear when there is no prior signature (existing device first upgrade)", () => {
    process.env.EXPO_PUBLIC_SUPABASE_URL = "https://ref1.supabase.co";
    process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY = "pk_test_x";
    const mock = makeMmkvMock();
    mock.inst(GENERAL).set("store-settings-storage", "keepme");

    loadStorageWith(mock);

    expect(mock.clearAllCalls).toHaveLength(0);
    expect(mock.inst(GENERAL).get("store-settings-storage")).toBe("keepme");
    expect(mock.inst(GENERAL).get(SIG_KEY)).toBe("ref1|test");
  });

  it("is a no-op when the signature matches", () => {
    process.env.EXPO_PUBLIC_SUPABASE_URL = "https://ref1.supabase.co";
    process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY = "pk_test_x";
    const mock = makeMmkvMock();
    mock.inst(GENERAL).set(SIG_KEY, "ref1|test");
    mock.inst(GENERAL).set("store-settings-storage", "keepme");

    loadStorageWith(mock);

    expect(mock.clearAllCalls).toHaveLength(0);
    expect(mock.inst(GENERAL).get("store-settings-storage")).toBe("keepme");
  });

  it("purges general + sync, drops Clerk session, preserves device id, and re-stamps on a real switch", () => {
    process.env.EXPO_PUBLIC_SUPABASE_URL = "https://prodref.supabase.co";
    process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY = "pk_live_y";
    const mock = makeMmkvMock();
    // Previous environment was staging.
    mock.inst(GENERAL).set(SIG_KEY, "stagingref|test");
    mock.inst(GENERAL).set("store-settings-storage", '{"selectedStore":{}}');
    mock.inst(SYNC).set("offline_orders", "[]");
    mock.inst(SECURE).set(DEVICE_ID_KEY, "DEVICE-123");
    mock.inst(SECURE).set("__clerk_client_jwt", "stale-test-token");

    loadStorageWith(mock);

    // General + sync + secure all cleared.
    expect(mock.clearAllCalls).toEqual(
      expect.arrayContaining([GENERAL, SYNC, SECURE]),
    );
    // Stale env state gone.
    expect(mock.inst(GENERAL).get("store-settings-storage")).toBeUndefined();
    expect(mock.inst(SYNC).get("offline_orders")).toBeUndefined();
    expect(mock.inst(SECURE).get("__clerk_client_jwt")).toBeUndefined();
    // Hardware identity preserved.
    expect(mock.inst(SECURE).get(DEVICE_ID_KEY)).toBe("DEVICE-123");
    // New signature stamped.
    expect(mock.inst(GENERAL).get(SIG_KEY)).toBe("prodref|live");
  });

  it("REFUSES to purge on a malformed (unknown) current signature even with a well-formed prior", () => {
    // Simulate a half-injected env at boot: Supabase URL missing → ref "unknown",
    // Clerk key still present. A blind guard would read this as a switch away from
    // the stored prod signature and wipe every Clerk token fleet-wide.
    delete process.env.EXPO_PUBLIC_SUPABASE_URL;
    process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY = "pk_test_x";
    const mock = makeMmkvMock();
    mock.inst(GENERAL).set(SIG_KEY, "prodref|live");
    mock.inst(GENERAL).set("store-settings-storage", "keepme");
    mock.inst(SECURE).set("__clerk_client_jwt", "healthy-token");

    loadStorageWith(mock);

    // Nothing cleared; healthy session and stored baseline survive.
    expect(mock.clearAllCalls).toHaveLength(0);
    expect(mock.inst(GENERAL).get("store-settings-storage")).toBe("keepme");
    expect(mock.inst(SECURE).get("__clerk_client_jwt")).toBe("healthy-token");
    // Stored baseline left untouched so the next resolved boot reconciles.
    expect(mock.inst(GENERAL).get(SIG_KEY)).toBe("prodref|live");
  });

  it("re-baselines without purging when the STORED signature is malformed", () => {
    process.env.EXPO_PUBLIC_SUPABASE_URL = "https://ref1.supabase.co";
    process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY = "pk_test_x";
    const mock = makeMmkvMock();
    // A corrupted / pre-guard baseline must not be mistaken for a real prior env.
    mock.inst(GENERAL).set(SIG_KEY, "unknown|unknown");
    mock.inst(GENERAL).set("store-settings-storage", "keepme");
    mock.inst(SECURE).set("__clerk_client_jwt", "healthy-token");

    loadStorageWith(mock);

    // No purge; just a quiet re-stamp to the resolved signature.
    expect(mock.clearAllCalls).toHaveLength(0);
    expect(mock.inst(GENERAL).get("store-settings-storage")).toBe("keepme");
    expect(mock.inst(SECURE).get("__clerk_client_jwt")).toBe("healthy-token");
    expect(mock.inst(GENERAL).get(SIG_KEY)).toBe("ref1|test");
  });
});
