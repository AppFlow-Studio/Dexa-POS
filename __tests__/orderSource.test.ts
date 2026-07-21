/**
 * Online-order source taxonomy: process_online_order derives order_source from
 * the provider ('orderout' | 'online_store'; legacy rows carry 'online'). The
 * POS must surface all of them as online orders — a strict === 'online' filter
 * silently hides every new online order (Kanban + right-edge drawer regression,
 * 2026-07). Unit-tests the predicate + source-asserts the load-bearing wiring.
 */
import { isOnlineOrderSource, ONLINE_ORDER_SOURCES } from "@/lib/orderSource";
import fs from "fs";
import path from "path";

describe("isOnlineOrderSource", () => {
  it("accepts every online channel, case-insensitively", () => {
    expect(isOnlineOrderSource("online")).toBe(true); // legacy rows
    expect(isOnlineOrderSource("orderout")).toBe(true); // OrderOut aggregator
    expect(isOnlineOrderSource("online_store")).toBe(true); // website / app
    expect(isOnlineOrderSource("OrderOut")).toBe(true);
    expect(isOnlineOrderSource("ONLINE_STORE")).toBe(true);
  });

  it("rejects POS-originated and absent sources", () => {
    expect(isOnlineOrderSource("pos")).toBe(false);
    expect(isOnlineOrderSource("in_store")).toBe(false);
    expect(isOnlineOrderSource("phone")).toBe(false);
    expect(isOnlineOrderSource("")).toBe(false);
    expect(isOnlineOrderSource(null)).toBe(false);
    expect(isOnlineOrderSource(undefined)).toBe(false);
  });

  it("exports the taxonomy for server-side .in() filters", () => {
    expect([...ONLINE_ORDER_SOURCES]).toEqual([
      "online",
      "orderout",
      "online_store",
    ]);
  });
});

describe("wiring — surfacing paths use the predicate, not === 'online' (source)", () => {
  const read = (rel: string) =>
    fs.readFileSync(path.join(process.cwd(), rel), "utf8");

  it("online-order selectors filter via isOnlineOrderSource", () => {
    const source = read("stores/selectors/orderSelectors.ts");
    expect(source).toContain('import { isOnlineOrderSource } from "@/lib/orderSource"');
    // No surviving strict comparison in the selectors
    expect(source).not.toMatch(/order_source\s*[!=]==\s*["']online["']/);
  });

  it("KDS online-orders bootstrap queries all online sources server-side", () => {
    const source = read("hooks/pos/useKdsOnlineOrdersBootstrap.ts");
    expect(source).toContain('.in("order_source", [...ONLINE_ORDER_SOURCES])');
    expect(source).not.toContain('.eq("order_source", "online")');
  });

  it("KDS-mode broadcast feed into the order store uses the predicate", () => {
    const source = read("app/(main)/_layout.tsx");
    expect(source).toContain("isOnlineOrderSource(order.order_source)");
  });
});
