// Auto-batch settlement scheduler — pure decision core + orchestration.
// Verifies: fire-time / day-key (incl. DST), the decideFire skip/wait/fire
// matrix (incl. cross-midnight catch-up), and tickAutoSettlement's safety
// contracts: NEVER auto-cut on a stuck batch, NEVER re-command after
// dbWriteFailed, close-on-truth (post-fire recheck), backoff only on transient,
// and single-fire under concurrency.

jest.mock("@/lib/supabase", () => ({ captureRpcError: jest.fn() }));
jest.mock("@/services/pendingFinalize", () => ({
  drainPendingFinalizes: jest.fn().mockResolvedValue({ attempted: 0, resolved: 0 }),
}));
jest.mock("@/services/settlementService", () => ({
  logSettlementAttempt: jest.fn().mockResolvedValue(undefined),
  // Injected in tests via deps.run / deps.getStats — these stubs are unused.
  runSettlement: jest.fn(),
  getUnsettledPaymentStats: jest.fn(),
}));

import {
  __resetInFlightForTests,
  computeDueInstantMs,
  dayKey,
  decideFire,
  tickAutoSettlement,
  type AutoSettleConfig,
  type AutoSettleProbes,
} from "@/services/autoSettlementScheduler";
import type {
  SettlementOutput,
  UnsettledStats,
} from "@/services/settlementService";
import {
  defaultProgress,
  useAutoSettlementStore,
  type TerminalAutoSettleProgress,
} from "@/stores/useAutoSettlementStore";
import { DateTime } from "luxon";

const TZ = "America/New_York";
const TERM = "term-1";

/** Epoch ms for a wall-clock instant in the location timezone. */
const at = (iso: string): number => DateTime.fromISO(iso, { zone: TZ }).toMillis();

const CFG: AutoSettleConfig = {
  terminalId: TERM,
  merchantId: "m1",
  locationId: "loc1",
  timezone: TZ,
  autoSettle: true,
  settleTime: "23:00",
  terminalType: "castles",
  terminalHost: "1.2.3.4",
  terminalPort: 8080,
  connectionType: "local_socket",
};

const permissiveProbes: AutoSettleProbes = {
  isOnline: () => true,
  isTerminalBusy: () => false,
  isSaleActive: () => false,
};

const prog = (
  over: Partial<TerminalAutoSettleProgress> = {},
): TerminalAutoSettleProgress => ({ ...defaultProgress(), ...over });

const okStats = (over: Partial<UnsettledStats> = {}): UnsettledStats => ({
  count: 3,
  totalAmount: 100,
  grossAmount: 90,
  tipAmount: 10,
  daySpan: 1,
  hasStuckBatch: false,
  ...over,
});

const okOutput = (over: Partial<SettlementOutput> = {}): SettlementOutput => ({
  success: true,
  partialSuccess: false,
  shouldRetry: false,
  requiresSupport: false,
  hosts: [],
  batchUuid: "b-1",
  status: "settled",
  ...over,
});

beforeEach(() => {
  useAutoSettlementStore.setState({ byTerminal: {} });
  __resetInFlightForTests();
  jest.clearAllMocks();
});

// ── time helpers ──────────────────────────────────────────────────

describe("dayKey / computeDueInstantMs", () => {
  it("dayKey is the plain calendar date in the location timezone", () => {
    expect(dayKey(TZ, at("2026-08-16T23:30"))).toBe("2026-08-16");
    // 00:30 local is already the next calendar day (NO business-day rollover).
    expect(dayKey(TZ, at("2026-08-17T00:30"))).toBe("2026-08-17");
  });

  it("computeDueInstantMs resolves settle_time wall-clock to the tz instant", () => {
    const due = computeDueInstantMs("23:00", TZ, at("2026-08-16T10:00"));
    expect(due).toBe(at("2026-08-16T23:00"));
  });

  it("supports HH:MM:SS and rejects garbage", () => {
    expect(computeDueInstantMs("02:05:30", TZ, at("2026-08-16T10:00"))).toBe(
      at("2026-08-16T02:05:30"),
    );
    expect(computeDueInstantMs("nope", TZ, at("2026-08-16T10:00"))).toBeNull();
    expect(computeDueInstantMs("25:00", TZ, at("2026-08-16T10:00"))).toBeNull();
  });

  it("DST spring-forward: a settle_time in the skipped hour still yields a valid instant", () => {
    // 2026-03-08 02:30 ET does not exist (spring forward). Must not be null.
    const due = computeDueInstantMs("02:30", TZ, at("2026-03-08T06:00"));
    expect(due).not.toBeNull();
    expect(Number.isFinite(due as number)).toBe(true);
  });

  it("DST fall-back: a duplicated wall-clock hour resolves", () => {
    const due = computeDueInstantMs("01:30", TZ, at("2026-11-01T06:00"));
    expect(due).not.toBeNull();
  });

  it("dayKey returns null for a bad timezone", () => {
    expect(dayKey("Not/AZone", Date.now())).toBeNull();
  });
});

// ── pure decision ─────────────────────────────────────────────────

describe("decideFire", () => {
  const now = at("2026-08-16T23:30"); // past today's 23:00 due
  const beforeDue = at("2026-08-16T10:00");

  it("fires the scheduled settle when past due and unsettled today", () => {
    const d = decideFire(CFG, prog(), permissiveProbes, now);
    expect(d).toMatchObject({ action: "fire", mode: "scheduled", day: "2026-08-16" });
  });

  it("skips when already resolved today", () => {
    const d = decideFire(
      CFG,
      prog({ resolvedDueDay: "2026-08-16" }),
      permissiveProbes,
      now,
    );
    expect(d).toMatchObject({ action: "skip", reason: "already_settled" });
  });

  it("waits before due when no prior day was missed", () => {
    const d = decideFire(
      CFG,
      prog({ resolvedDueDay: "2026-08-15" }),
      permissiveProbes,
      beforeDue,
    );
    expect(d).toMatchObject({ action: "wait", reason: "before_due" });
  });

  it("CATCH-UP: fires before due when a prior day was missed (tablet was off)", () => {
    const d = decideFire(
      CFG,
      prog({ resolvedDueDay: "2026-08-13" }), // last settle 3 days ago
      permissiveProbes,
      beforeDue,
    );
    expect(d).toMatchObject({ action: "fire", mode: "catchup", day: "2026-08-16" });
  });

  it("does not repeat a catch-up sweep already done today", () => {
    const d = decideFire(
      CFG,
      prog({ resolvedDueDay: "2026-08-13", catchupDay: "2026-08-16" }),
      permissiveProbes,
      beforeDue,
    );
    expect(d).toMatchObject({ action: "skip", reason: "catchup_done" });
  });

  it("defers (does not consume the day) while busy / sale-active / offline", () => {
    expect(
      decideFire(CFG, prog(), { ...permissiveProbes, isSaleActive: () => true }, now),
    ).toMatchObject({ action: "wait", reason: "sale_active" });
    expect(
      decideFire(CFG, prog(), { ...permissiveProbes, isTerminalBusy: () => true }, now),
    ).toMatchObject({ action: "wait", reason: "terminal_busy" });
    expect(
      decideFire(CFG, prog(), { ...permissiveProbes, isOnline: () => false }, now),
    ).toMatchObject({ action: "wait", reason: "offline" });
  });

  it("respects terminal type and the server auto_settle column (no client flag)", () => {
    expect(
      decideFire({ ...CFG, terminalType: "valor" }, prog(), permissiveProbes, now),
    ).toMatchObject({ action: "skip", reason: "not_castles" });
    expect(
      decideFire({ ...CFG, autoSettle: false }, prog(), permissiveProbes, now),
    ).toMatchObject({ action: "skip", reason: "auto_settle_off" });
  });

  it("honors backoff window and the daily attempt cap", () => {
    expect(
      decideFire(
        CFG,
        prog({ attemptDay: "2026-08-16", nextRetryAtMs: now + 60_000 }),
        permissiveProbes,
        now,
      ),
    ).toMatchObject({ action: "wait", reason: "backoff" });
    expect(
      decideFire(
        CFG,
        prog({ attemptDay: "2026-08-16", attemptCountToday: 4 }),
        permissiveProbes,
        now,
      ),
    ).toMatchObject({ action: "skip", reason: "attempt_cap" });
  });

  it("skips while a settle is in flight (client mirror of the server 10-min guard)", () => {
    const d = decideFire(
      CFG,
      prog({ phase: "settling", settlingSince: now - 60_000 }),
      permissiveProbes,
      now,
    );
    expect(d).toMatchObject({ action: "skip", reason: "in_flight" });
  });
});

// ── orchestration ─────────────────────────────────────────────────

describe("tickAutoSettlement", () => {
  const now = at("2026-08-16T23:30");
  const today = "2026-08-16";

  const tick = (over: Partial<Parameters<typeof tickAutoSettlement>[0]>) =>
    tickAutoSettlement({
      supabase: {} as any,
      cfg: CFG,
      probes: permissiveProbes,
      nowMs: now,
      ...over,
    });

  it("settles on success + zero unsettled remaining (close-on-truth)", async () => {
    const run = jest.fn().mockResolvedValue(okOutput());
    const getStats = jest
      .fn()
      .mockResolvedValueOnce(okStats({ count: 3 })) // preflight
      .mockResolvedValueOnce(okStats({ count: 0 })); // post-fire recheck
    await tick({ run, getStats });
    const p = useAutoSettlementStore.getState().getProgress(TERM);
    expect(run).toHaveBeenCalledTimes(1);
    expect(p.phase).toBe("settled");
    expect(p.resolvedDueDay).toBe(today);
    expect(p.lastSettledDay).toBe(today);
    // initiatedBy must be the auto marker so the RPC stamps origin=pos_auto.
    expect(run.mock.calls[0][0]).toMatchObject({ initiatedBy: "pos_auto" });
  });

  it("NEVER auto-cuts when a prior batch is stuck — escalates to manual", async () => {
    const run = jest.fn();
    const getStats = jest
      .fn()
      .mockResolvedValue(okStats({ hasStuckBatch: true, stuckBatchStatus: "pending" }));
    await tick({ run, getStats });
    const p = useAutoSettlementStore.getState().getProgress(TERM);
    expect(run).not.toHaveBeenCalled();
    expect(p.phase).toBe("needs_manual");
    expect(p.resolvedDueDay).toBe(today); // won't re-fire today
  });

  it("closes the day WITHOUT touching the terminal when nothing is unsettled", async () => {
    const run = jest.fn();
    const getStats = jest.fn().mockResolvedValue(okStats({ count: 0 }));
    await tick({ run, getStats });
    const p = useAutoSettlementStore.getState().getProgress(TERM);
    expect(run).not.toHaveBeenCalled();
    expect(p.phase).toBe("settled");
    expect(p.lastResultStatus).toBe("nothing_to_settle");
    expect(p.resolvedDueDay).toBe(today);
  });

  it("dbWriteFailed → finalize_pending, runs ONCE, and never re-commands the terminal", async () => {
    const run = jest
      .fn()
      .mockResolvedValue(okOutput({ success: false, dbWriteFailed: true }));
    const getStats = jest.fn().mockResolvedValue(okStats({ count: 3 }));
    await tick({ run, getStats });
    let p = useAutoSettlementStore.getState().getProgress(TERM);
    expect(p.phase).toBe("finalize_pending");
    expect(p.resolvedDueDay).toBe(today);
    // A second tick the same day must NOT fire again (marker advanced).
    await tick({ run, getStats });
    p = useAutoSettlementStore.getState().getProgress(TERM);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("partial/requiresSupport → needs_manual (no all-night spin)", async () => {
    const run = jest
      .fn()
      .mockResolvedValue(okOutput({ success: false, partialSuccess: true }));
    const getStats = jest.fn().mockResolvedValue(okStats({ count: 3 }));
    await tick({ run, getStats });
    expect(useAutoSettlementStore.getState().getProgress(TERM).phase).toBe(
      "needs_manual",
    );
  });

  it("hard decline → needs_manual, does not advance backoff", async () => {
    const run = jest
      .fn()
      .mockResolvedValue(okOutput({ success: false, error: "declined" }));
    const getStats = jest.fn().mockResolvedValue(okStats({ count: 3 }));
    await tick({ run, getStats });
    const p = useAutoSettlementStore.getState().getProgress(TERM);
    expect(p.phase).toBe("needs_manual");
    expect(p.nextRetryAtMs).toBeNull();
  });

  it("shouldRetry → backoff with a future nextRetryAtMs (marker NOT advanced)", async () => {
    const run = jest
      .fn()
      .mockResolvedValue(okOutput({ success: false, shouldRetry: true }));
    const getStats = jest.fn().mockResolvedValue(okStats({ count: 3 }));
    await tick({ run, getStats });
    const p = useAutoSettlementStore.getState().getProgress(TERM);
    expect(p.phase).toBe("failed");
    expect(p.nextRetryAtMs).toBeGreaterThan(now);
    expect(p.resolvedDueDay).toBeNull();
  });

  it("a thrown connect (terminal unreachable) is transient → backoff", async () => {
    const run = jest.fn().mockRejectedValue(new Error("connect timeout"));
    const getStats = jest.fn().mockResolvedValue(okStats({ count: 3 }));
    await tick({ run, getStats });
    const p = useAutoSettlementStore.getState().getProgress(TERM);
    expect(p.phase).toBe("failed");
    expect(p.nextRetryAtMs).toBeGreaterThan(now);
  });

  it("success but payments remain → needs_manual (partial acquirer)", async () => {
    const run = jest.fn().mockResolvedValue(okOutput());
    const getStats = jest
      .fn()
      .mockResolvedValueOnce(okStats({ count: 3 }))
      .mockResolvedValueOnce(okStats({ count: 1 })); // still unsettled after
    await tick({ run, getStats });
    expect(useAutoSettlementStore.getState().getProgress(TERM).phase).toBe(
      "needs_manual",
    );
  });

  it("cross-midnight catch-up sweeps a missed day and does NOT consume today's scheduled settle", async () => {
    // Seed: last scheduled settle was 3 days ago; tablet booting this morning.
    useAutoSettlementStore.setState({
      byTerminal: { [TERM]: prog({ resolvedDueDay: "2026-08-13" }) },
    });
    const run = jest.fn().mockResolvedValue(okOutput());
    const getStats = jest
      .fn()
      .mockResolvedValueOnce(okStats({ count: 5 }))
      .mockResolvedValueOnce(okStats({ count: 0 }));
    await tick({ run, getStats, nowMs: at("2026-08-16T09:00") }); // before today's 23:00 due
    const p = useAutoSettlementStore.getState().getProgress(TERM);
    expect(run).toHaveBeenCalledTimes(1);
    expect(p.catchupDay).toBe(today); // catch-up marker advanced
    expect(p.resolvedDueDay).toBe("2026-08-13"); // scheduled marker UNTOUCHED
  });

  it("serializes concurrent ticks — fires exactly once", async () => {
    let resolvePreflight: (v: UnsettledStats) => void = () => {};
    const getStats = jest.fn().mockImplementation(
      () =>
        new Promise<UnsettledStats>((res) => {
          resolvePreflight = res;
        }),
    );
    const run = jest.fn().mockResolvedValue(okOutput());
    const p1 = tick({ run, getStats });
    const p2 = tick({ run, getStats }); // arrives while p1 holds inFlight
    resolvePreflight(okStats({ count: 0 })); // let the first preflight resolve
    await Promise.all([p1, p2]);
    // Only one tick did network work; the other short-circuited on inFlight.
    expect(getStats).toHaveBeenCalledTimes(1);
  });

  it("does not fire when the pure gate says skip (e.g. server auto_settle off)", async () => {
    const run = jest.fn();
    const getStats = jest.fn();
    await tick({ run, getStats, cfg: { ...CFG, autoSettle: false } });
    expect(run).not.toHaveBeenCalled();
    expect(getStats).not.toHaveBeenCalled();
    expect(useAutoSettlementStore.getState().getProgress(TERM).lastReason).toBe(
      "auto_settle_off",
    );
  });
});
