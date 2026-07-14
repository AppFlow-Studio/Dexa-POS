/**
 * W1-1: lib/storage.ts identity-skip contract.
 *
 * zustand's persist wraps every write in a fresh `{state, version}` object,
 * so lazyDebouncedWrite must compare the inner `.state` ref — comparing the
 * wrapper never matches (the pre-W1-1 skip was dead code).
 *
 * Also locks in the data-loss preventers: removeItem / clearStorage /
 * clearCacheData / removeKey must invalidate the identity cache, or a
 * clear-then-unchanged-state sequence skips the rewrite and the key stays
 * empty on disk (lost orders on next boot).
 */

function makeMmkvMock() {
  const stores = new Map<string, Map<string, unknown>>();
  const inst = (id: string) => {
    if (!stores.has(id)) stores.set(id, new Map());
    return stores.get(id)!;
  };
  const createMMKV = ({ id }: { id: string }) => {
    const m = inst(id);
    return {
      getString: (k: string) => m.get(k) as string | undefined,
      getBoolean: (k: string) => m.get(k) as boolean | undefined,
      getNumber: (k: string) => m.get(k) as number | undefined,
      set: (k: string, v: unknown) => void m.set(k, v),
      remove: (k: string) => void m.delete(k),
      delete: (k: string) => void m.delete(k),
      contains: (k: string) => m.has(k),
      getAllKeys: () => Array.from(m.keys()),
      clearAll: () => m.clear(),
    };
  };
  return { createMMKV, inst };
}

type StorageModule = typeof import("@/lib/storage");

function loadStorage(): { mod: StorageModule; mock: ReturnType<typeof makeMmkvMock> } {
  const mock = makeMmkvMock();
  let mod!: StorageModule;
  jest.isolateModules(() => {
    jest.doMock("react-native-mmkv", () => ({ createMMKV: mock.createMMKV }));
    jest.doMock("@/lib/telemetry/registry", () => ({
      internKey: jest.fn(() => 0),
      recordCount: jest.fn(),
      recordSample: jest.fn(),
      noteStringifyEnd: jest.fn(),
      noteFlushAllEnd: jest.fn(),
    }));
    jest.doMock("@/lib/telemetry/keys", () => ({
      KEY_FLUSH_ALL_MS: 0,
      persistKeyIds: jest.fn(() => ({ arm: 1, skip: 2, stringifyMs: 3, bytes: 4 })),
    }));
    mod = require("@/lib/storage");
  });
  return { mod, mock };
}

const NAME = "order-store-storage";

beforeEach(() => {
  jest.resetModules();
});

describe("lazyDebouncedWrite — .state identity skip", () => {
  it("skips when the inner state ref repeats across distinct wrappers", () => {
    const { mod, mock } = loadStorage();
    const adapter = mod.createLazyPersistStorage();
    const general = mock.inst("dexa-pos-general");

    const slice = { ordersById: { a: 1 } };
    adapter.setItem(NAME, { state: slice, version: 1 } as any);
    mod.flushPendingWrite(NAME);
    const written1 = general.get(NAME);
    expect(written1).toBeDefined();

    // New wrapper, SAME slice ref → must skip (no re-arm, no rewrite).
    general.delete(NAME); // sentinel: a rewrite would repopulate
    adapter.setItem(NAME, { state: slice, version: 1 } as any);
    mod.flushPendingWrite(NAME);
    expect(general.get(NAME)).toBeUndefined(); // skipped
  });

  it("arms when the inner state ref changes", () => {
    const { mod, mock } = loadStorage();
    const adapter = mod.createLazyPersistStorage();
    const general = mock.inst("dexa-pos-general");

    adapter.setItem(NAME, { state: { v: 1 }, version: 1 } as any);
    mod.flushPendingWrite(NAME);
    const w1 = general.get(NAME);

    adapter.setItem(NAME, { state: { v: 2 }, version: 1 } as any);
    mod.flushPendingWrite(NAME);
    const w2 = general.get(NAME);
    expect(w2).toBeDefined();
    expect(w2).not.toEqual(w1);
  });
});

describe("identity-cache invalidation (empty-disk-on-boot preventers)", () => {
  it("removeItem: a later identical-ref setItem re-arms and lands on disk", () => {
    const { mod, mock } = loadStorage();
    const adapter = mod.createLazyPersistStorage();
    const general = mock.inst("dexa-pos-general");

    const slice = { ordersById: { a: 1 } };
    adapter.setItem(NAME, { state: slice, version: 1 } as any);
    mod.flushPendingWrite(NAME);

    adapter.removeItem(NAME);
    expect(general.get(NAME)).toBeUndefined();

    adapter.setItem(NAME, { state: slice, version: 1 } as any); // same ref!
    mod.flushPendingWrite(NAME);
    expect(general.get(NAME)).toBeDefined(); // re-armed, not skipped
  });

  it("removeItem cancels a pending debounced write (no resurrection)", () => {
    jest.useFakeTimers();
    try {
      const { mod, mock } = loadStorage();
      const adapter = mod.createLazyPersistStorage();
      const general = mock.inst("dexa-pos-general");

      adapter.setItem(NAME, { state: { v: 1 }, version: 1 } as any); // pending
      adapter.removeItem(NAME);
      jest.runAllTimers(); // would fire the 300ms debounce + setImmediate
      expect(general.get(NAME)).toBeUndefined();
    } finally {
      jest.useRealTimers();
    }
  });

  it("clearStorage: identical-ref setItem after the clear still lands", () => {
    const { mod, mock } = loadStorage();
    const adapter = mod.createLazyPersistStorage();
    const general = mock.inst("dexa-pos-general");

    const slice = { ordersById: { a: 1 } };
    adapter.setItem(NAME, { state: slice, version: 1 } as any);
    mod.flushPendingWrite(NAME);

    mod.clearStorage();
    expect(general.get(NAME)).toBeUndefined();

    adapter.setItem(NAME, { state: slice, version: 1 } as any);
    mod.flushPendingWrite(NAME);
    expect(general.get(NAME)).toBeDefined();
  });

  it("clearCacheData: bypasses the adapter but still invalidates the cache", () => {
    const { mod, mock } = loadStorage();
    const adapter = mod.createLazyPersistStorage();
    const general = mock.inst("dexa-pos-general");

    const slice = { ordersById: { a: 1 } };
    adapter.setItem(NAME, { state: slice, version: 1 } as any);
    mod.flushPendingWrite(NAME);

    mod.clearCacheData();
    expect(general.get(NAME)).toBeUndefined();

    adapter.setItem(NAME, { state: slice, version: 1 } as any);
    mod.flushPendingWrite(NAME);
    expect(general.get(NAME)).toBeDefined();
  });

  it("removeKey: raw delete path invalidates too", () => {
    const { mod, mock } = loadStorage();
    const adapter = mod.createLazyPersistStorage();
    const general = mock.inst("dexa-pos-general");

    const slice = { ordersById: { a: 1 } };
    adapter.setItem(NAME, { state: slice, version: 1 } as any);
    mod.flushPendingWrite(NAME);

    mod.removeKey(NAME);
    expect(general.get(NAME)).toBeUndefined();

    adapter.setItem(NAME, { state: slice, version: 1 } as any);
    mod.flushPendingWrite(NAME);
    expect(general.get(NAME)).toBeDefined();
  });
});
