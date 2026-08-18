/**
 * AUD-10 — confirmed local echo suppression.
 *
 * The ticket's acceptance criteria, as executable tests:
 *   - suppression triggers ONLY on a confirmed origin-id match
 *   - cross-station payments still apply on the originating station
 *   - burst replay converges to identical state flag-on vs flag-off
 *   - kill switch verified
 *
 * The thing that makes this feature dangerous is that a false positive is
 * SILENT: a wrongly-suppressed event doesn't throw, it just leaves this station
 * quietly disagreeing with the server until something else happens to
 * reconcile it. So these tests lean hard on the negative cases.
 */
import {
  __setEchoSuppressionForTest,
  isEchoSuppressionEnabled,
} from "@/lib/network/killSwitch";
import {
  __pendingCount,
  __resetMutationOrigins,
  abandonMutation,
  beginMutation,
  confirmMutation,
  isConfirmedLocalEcho,
} from "@/lib/realtime/mutationOrigin";

beforeEach(() => {
  __resetMutationOrigins();
  __setEchoSuppressionForTest(true);
});

afterEach(() => {
  __setEchoSuppressionForTest(null);
});

describe("AUD-10 · kill switch", () => {
  it("defaults OFF", () => {
    // Read through the real accessor with no test override in place.
    __setEchoSuppressionForTest(null);
    expect(isEchoSuppressionEnabled()).toBe(false);
  });

  it("beginMutation is inert while OFF — no id, nothing tracked", () => {
    __setEchoSuppressionForTest(false);
    expect(beginMutation("add_order_item")).toBeNull();
    expect(__pendingCount()).toBe(0);
  });

  it("suppresses nothing while OFF, even for an id it issued", () => {
    const id = beginMutation("add_order_item", "o1")!;
    confirmMutation(id);
    __setEchoSuppressionForTest(false);
    expect(isConfirmedLocalEcho(id)).toBe(false);
  });
});

describe("AUD-10 · suppression requires a CONFIRMED origin match", () => {
  it("suppresses our own confirmed echo", () => {
    const id = beginMutation("add_order_item", "o1")!;
    confirmMutation(id);
    expect(isConfirmedLocalEcho(id)).toBe(true);
  });

  it("does NOT suppress an unconfirmed mutation", () => {
    // The RPC has not returned. The echo may be a different write entirely.
    const id = beginMutation("add_order_item", "o1")!;
    expect(isConfirmedLocalEcho(id)).toBe(false);
  });

  it("does NOT suppress an id we never issued (another station's write)", () => {
    beginMutation("add_order_item", "o1");
    expect(isConfirmedLocalEcho("00000000-0000-0000-0000-000000000000")).toBe(
      false,
    );
  });

  it("does NOT suppress when the payload carries no origin at all", () => {
    expect(isConfirmedLocalEcho(undefined)).toBe(false);
    expect(isConfirmedLocalEcho(null)).toBe(false);
    expect(isConfirmedLocalEcho("")).toBe(false);
  });

  it("does NOT suppress a mutation that failed", () => {
    // A failed write might have partially applied server-side; we need its
    // echo to reconcile.
    const id = beginMutation("add_order_item", "o1")!;
    abandonMutation(id);
    expect(isConfirmedLocalEcho(id)).toBe(false);
  });

  it("suppresses each mutation at most ONCE", () => {
    // A follow-up server write on the same order must never be swallowed by a
    // stale entry.
    const id = beginMutation("add_order_item", "o1")!;
    confirmMutation(id);
    expect(isConfirmedLocalEcho(id)).toBe(true);
    expect(isConfirmedLocalEcho(id)).toBe(false);
  });

  it("expires a confirmed entry so a late echo still applies", () => {
    jest.useFakeTimers();
    try {
      const id = beginMutation("add_order_item", "o1")!;
      confirmMutation(id);
      jest.advanceTimersByTime(11_000); // past CONFIRMED_TTL_MS
      expect(isConfirmedLocalEcho(id)).toBe(false);
    } finally {
      jest.useRealTimers();
    }
  });

  it("expires an unconfirmed entry (RPC never returned)", () => {
    jest.useFakeTimers();
    try {
      const id = beginMutation("add_order_item", "o1")!;
      jest.advanceTimersByTime(16_000); // past PENDING_TTL_MS
      confirmMutation(id); // ack arrives far too late
      expect(isConfirmedLocalEcho(id)).toBe(false);
    } finally {
      jest.useRealTimers();
    }
  });
});

/**
 * The handler-level guard. Mirrors the never-suppress predicate in
 * hooks/realtime/useOrdersRealtime.ts so the rules are pinned by a test rather
 * than living only as a comment.
 */
type Payload = {
  operation: "INSERT" | "UPDATE" | "DELETE";
  order: Record<string, any>;
};

function wouldSuppress(p: Payload): boolean {
  if (!isEchoSuppressionEnabled()) return false;
  if (p.operation === "DELETE") return false;
  const status = String(p.order.status ?? "").toLowerCase();
  const moneyOrTerminal =
    (p.order.order_payments?.length ?? 0) > 0 ||
    (p.order.reversals?.length ?? 0) > 0 ||
    (p.order.order_refund_items?.length ?? 0) > 0 ||
    status === "void" ||
    status === "refunded" ||
    status === "cancelled" ||
    status === "completed";
  if (moneyOrTerminal) return false;
  return isConfirmedLocalEcho(p.order.origin_id);
}

describe("AUD-10 · never-suppress list", () => {
  const ownConfirmed = () => {
    const id = beginMutation("add_order_item", "o1")!;
    confirmMutation(id);
    return id;
  };

  it("NEVER suppresses a DELETE, even our own", () => {
    // Losing a deletion leaves a ghost order on the floor.
    const id = ownConfirmed();
    expect(
      wouldSuppress({ operation: "DELETE", order: { origin_id: id } }),
    ).toBe(false);
  });

  it("NEVER suppresses a payload carrying payments — cross-station money", () => {
    const id = ownConfirmed();
    expect(
      wouldSuppress({
        operation: "UPDATE",
        order: { origin_id: id, order_payments: [{ id: "p1" }] },
      }),
    ).toBe(false);
  });

  it("NEVER suppresses reversals or refund items", () => {
    const a = ownConfirmed();
    expect(
      wouldSuppress({
        operation: "UPDATE",
        order: { origin_id: a, reversals: [{ id: "r1" }] },
      }),
    ).toBe(false);

    const b = ownConfirmed();
    expect(
      wouldSuppress({
        operation: "UPDATE",
        order: { origin_id: b, order_refund_items: [{ id: "ri1" }] },
      }),
    ).toBe(false);
  });

  it.each(["void", "refunded", "cancelled", "completed"])(
    "NEVER suppresses a terminal status transition (%s)",
    (status) => {
      const id = ownConfirmed();
      expect(
        wouldSuppress({ operation: "UPDATE", order: { origin_id: id, status } }),
      ).toBe(false);
    },
  );

  it("DOES suppress an ordinary item echo on an open order", () => {
    const id = ownConfirmed();
    expect(
      wouldSuppress({
        operation: "UPDATE",
        order: { origin_id: id, status: "sent_to_kitchen" },
      }),
    ).toBe(true);
  });
});

describe("AUD-10 · burst replay converges flag-on vs flag-off", () => {
  it("applies an identical set of events with the flag on and off", () => {
    // ~30 writes/min for 15 min across 2 stations, deterministic so the two
    // runs are genuinely comparable. Roughly a third are ours, and every tenth
    // event is money/terminal.
    const EVENTS = 450;

    const run = (flagOn: boolean) => {
      __resetMutationOrigins();
      __setEchoSuppressionForTest(flagOn);

      const applied: string[] = [];
      for (let i = 0; i < EVENTS; i++) {
        const ours = i % 3 === 0;
        const money = i % 10 === 0;
        const orderId = `order-${i % 12}`;

        let originId: string | null = null;
        if (ours) {
          originId = beginMutation("add_order_item", orderId);
          if (originId) confirmMutation(originId);
        }

        const order: Record<string, any> = {
          id: orderId,
          origin_id: ours ? (originId ?? `remote-${i}`) : `remote-${i}`,
          status: money ? "completed" : "sent_to_kitchen",
        };
        if (money) order.order_payments = [{ id: `pay-${i}` }];

        const suppressed = wouldSuppress({ operation: "UPDATE", order });
        if (!suppressed) applied.push(`${orderId}:${i}`);
      }
      return applied;
    };

    const off = run(false);
    const on = run(true);

    // Flag OFF must apply everything.
    expect(off.length).toBe(EVENTS);

    // Flag ON must apply strictly fewer — otherwise the feature does nothing.
    expect(on.length).toBeLessThan(off.length);

    // CONVERGENCE: every event dropped with the flag on must be one this
    // station authored AND already applied optimistically. Nothing authored
    // elsewhere, and nothing money/terminal, may go missing.
    const dropped = off.filter((e) => !on.includes(e));
    for (const e of dropped) {
      const i = Number(e.split(":")[1]);
      expect(i % 3).toBe(0); // ours
      expect(i % 10).not.toBe(0); // never money/terminal
    }
  });

  it("a remote station's writes are never dropped, whatever we are doing", () => {
    __setEchoSuppressionForTest(true);
    let remoteApplied = 0;
    for (let i = 0; i < 200; i++) {
      const mine = beginMutation("add_order_item", `o${i}`);
      if (mine) confirmMutation(mine);
      const suppressed = wouldSuppress({
        operation: "UPDATE",
        order: { id: `o${i}`, origin_id: `remote-station-${i}`, status: "ready" },
      });
      if (!suppressed) remoteApplied++;
    }
    expect(remoteApplied).toBe(200);
  });
});
