/**
 * KDS on low-end (4GB) tablets — regression guards for the idle-load fixes.
 * See docs/features/kds/kds-lowend-device-performance.md.
 *
 * Each guard pins a cost that ran continuously on an idle board:
 * - TcpServerModule's accept loop spinning on a closed socket (~2 cores)
 * - the CFD server starting on KDS stations at all
 * - a perpetual header animation forcing 60fps full-window repaints
 * - the 1Hz timer tick re-stringifying every persisted ticket
 * - 4 preloaded ExoPlayers per KDSSoundService instance
 */
import fs from "fs";
import path from "path";

const read = (...p: string[]) =>
  fs.readFileSync(path.join(process.cwd(), ...p), "utf8");

// ─── createStablePartialize ───────────────────────────────────────

function loadStorage(): typeof import("@/lib/storage") {
  let mod!: typeof import("@/lib/storage");
  jest.isolateModules(() => {
    jest.doMock("react-native-mmkv", () => ({
      createMMKV: () => ({
        getString: () => undefined,
        getBoolean: () => undefined,
        getNumber: () => undefined,
        set: () => {},
        remove: () => {},
        delete: () => {},
        contains: () => false,
        getAllKeys: () => [],
        clearAll: () => {},
      }),
    }));
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
  return mod;
}

describe("createStablePartialize", () => {
  type S = { tickets: object; done: object[]; tick: number; flag: boolean };
  const { createStablePartialize } = loadStorage();

  it("returns the same slice while picked fields keep their references", () => {
    const partialize = createStablePartialize<S, "tickets" | "done">([
      "tickets",
      "done",
    ]);
    const base: S = { tickets: {}, done: [], tick: 0, flag: false };
    const first = partialize(base);
    // A 1Hz tick / fetch flag touches only unpicked fields.
    const second = partialize({ ...base, tick: 1, flag: true });
    expect(second).toBe(first);
    expect(second).toEqual({ tickets: base.tickets, done: base.done });
  });

  it("returns a new slice when a picked field changes", () => {
    const partialize = createStablePartialize<S, "tickets" | "done">([
      "tickets",
      "done",
    ]);
    const base: S = { tickets: {}, done: [], tick: 0, flag: false };
    const first = partialize(base);
    const nextTickets = { a: 1 };
    const second = partialize({ ...base, tickets: nextTickets });
    expect(second).not.toBe(first);
    expect(second.tickets).toBe(nextTickets);
  });
});

describe("useKDSStore persists through a stable partialize (source)", () => {
  const source = read("stores", "useKDSStore.ts");
  const persistBlock = source.slice(source.indexOf('name: "kds-ticket-storage"'));

  it("uses createStablePartialize", () => {
    expect(persistBlock).toMatch(/partialize:\s*createStablePartialize</);
  });

  it("never persists the per-second timer fields", () => {
    const keys = persistBlock.slice(0, persistBlock.indexOf("]),"));
    expect(keys).not.toMatch(/timerTick|nowEpochMs/);
  });
});

// ─── KDSSoundService shared players ───────────────────────────────

describe("KDSSoundService shares one player per preset", () => {
  function loadSound() {
    const created: { release: jest.Mock; play: jest.Mock; seekTo: jest.Mock }[] = [];
    const createAudioPlayer = jest.fn(() => {
      const p = { release: jest.fn(), play: jest.fn(), seekTo: jest.fn() };
      created.push(p);
      return p;
    });
    let Service!: typeof import("@/services/kds/kdsSoundService").default;
    jest.isolateModules(() => {
      jest.doMock("expo-audio", () => ({
        createAudioPlayer,
        setAudioModeAsync: jest.fn(() => Promise.resolve()),
      }));
      Service = require("@/services/kds/kdsSoundService").default;
    });
    return { Service, created, createAudioPlayer };
  }

  it("creates players only for configured presets and shares them across services", async () => {
    const { Service, createAudioPlayer } = loadSound();
    const board = new Service();
    const preview = new Service();
    board.updateConfig({ enabled: true, pos: "chime", online: "bell", kiosk: "chime", third_party: "none", default: "chime" });
    await board.init();
    await preview.init();
    // chime + bell only — not all four presets, and not once per service.
    expect(createAudioPlayer).toHaveBeenCalledTimes(2);

    preview.playPreview("alert"); // unconfigured preset: created on demand
    preview.playPreview("alert");
    expect(createAudioPlayer).toHaveBeenCalledTimes(3);
  });

  it("releases the shared players only when the last service disposes", async () => {
    const { Service, created } = loadSound();
    const a = new Service();
    const b = new Service();
    await a.init();
    await b.init();
    a.playPreview("ding");
    expect(created).toHaveLength(1);

    a.dispose();
    expect(created[0].release).not.toHaveBeenCalled();
    b.dispose();
    expect(created[0].release).toHaveBeenCalledTimes(1);
  });

  it("can be re-initialized after dispose (remount)", async () => {
    const { Service, createAudioPlayer } = loadSound();
    const svc = new Service();
    await svc.init();
    svc.dispose();
    await svc.init();
    svc.playPreview("bell");
    expect(createAudioPlayer).toHaveBeenCalledTimes(1);
  });

  it("an init still pending when dispose runs does not register", async () => {
    const { Service, created } = loadSound();
    const svc = new Service();
    const pending = svc.init();
    svc.dispose();
    await pending;
    svc.playPreview("bell"); // not initialized → no-op
    expect(created).toHaveLength(0);
  });
});

// ─── Native / render guards (source) ──────────────────────────────

describe("idle-load guards (source)", () => {
  it("TcpServerModule cancels the accept loop on stop and exits once the socket is closed", () => {
    const kt = read(
      "android/app/src/main/java/com/temurappflowstudios/dexapos/tcpserver/TcpServerModule.kt",
    );
    const stop = kt.slice(kt.indexOf("private fun stopServerInternal"));
    expect(stop.slice(0, stop.indexOf("try {"))).toMatch(/acceptJob\?\.cancel\(\)/);
    expect(kt).toMatch(/while \(isActive && !socket\.isClosed\)/);
    expect(kt).toMatch(/delay\(ACCEPT_ERROR_BACKOFF_MS\)/);
  });

  it("CFDProvider never starts the CFD server on a KDS station", () => {
    const src = read("contexts", "CFDProvider.tsx");
    const effect = src.slice(src.indexOf("// Initialize CFD controller"));
    const guard = effect.slice(0, effect.indexOf("setServerStatus('initializing')"));
    expect(guard).toMatch(/selectedStation\?\.station_type === 'kds'/);
  });

  it("focusing a ticket overlays quick actions instead of swapping the header (no height change)", () => {
    const src = read("app", "(main)", "kds.tsx");
    expect(src).not.toMatch(/tapMode === "single-select" && isFocused \? \(/);
    const overlay = src.slice(
      src.indexOf('{tapMode === "single-select" && isFocused && ('),
    );
    expect(overlay.slice(0, overlay.indexOf(">"))).toBeTruthy();
    expect(overlay.slice(0, 600)).toMatch(/position: "absolute"/);
  });

  it("the KDS board header has no perpetual animation", () => {
    const src = read("app", "(main)", "kds.tsx");
    expect(src).not.toMatch(/PulsingDot/);
    const dot = src.slice(src.indexOf("const ConnectedDot"), src.indexOf("// ─── Skeleton"));
    expect(dot).not.toMatch(/loop\(|Animated/);
  });
});
