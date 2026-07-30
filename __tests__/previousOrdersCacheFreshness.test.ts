import { isCacheFresh } from "@/stores/previousOrdersOfflineCache";

const cached = (patch: Record<string, any> = {}) => ({
  count: 42,
  latestUpdatedAt: "2026-07-28T10:00:00.000Z",
  windowLabel: "today" as const,
  cachedAt: Date.now(),
  ...patch,
});

describe("isCacheFresh", () => {
  it("is fresh when both the count and the newest updated_at match", () => {
    expect(
      isCacheFresh(
        cached(),
        { count: 42, latestUpdatedAt: "2026-07-28T10:00:00.000Z" },
        "today",
      ),
    ).toBe(true);
  });

  it("is stale when an order was added or removed", () => {
    expect(
      isCacheFresh(
        cached(),
        { count: 43, latestUpdatedAt: "2026-07-28T10:00:00.000Z" },
        "today",
      ),
    ).toBe(false);
  });

  it("is stale when an existing order was edited but the count did not change", () => {
    // The case a count-only check would miss: a refund, void, tip adjust or
    // check reopen mutates a row without changing how many rows there are.
    expect(
      isCacheFresh(
        cached(),
        { count: 42, latestUpdatedAt: "2026-07-28T11:30:00.000Z" },
        "today",
      ),
    ).toBe(false);
  });

  it("is stale when the date window differs from the cached one", () => {
    expect(
      isCacheFresh(
        cached({ windowLabel: "yesterday" }),
        { count: 42, latestUpdatedAt: "2026-07-28T10:00:00.000Z" },
        "today",
      ),
    ).toBe(false);
  });

  it("is stale with no cached signature at all", () => {
    expect(
      isCacheFresh(null, { count: 0, latestUpdatedAt: null }, "today"),
    ).toBe(false);
  });

  it("treats an unknown count on either side as stale rather than assuming a match", () => {
    expect(
      isCacheFresh(
        cached({ count: null }),
        { count: 42, latestUpdatedAt: "2026-07-28T10:00:00.000Z" },
        "today",
      ),
    ).toBe(false);
    expect(
      isCacheFresh(
        cached(),
        { count: null, latestUpdatedAt: "2026-07-28T10:00:00.000Z" },
        "today",
      ),
    ).toBe(false);
  });

  it("treats a genuinely empty window as fresh", () => {
    // No rows means no newest updated_at — null on both sides is a real match,
    // not missing information.
    expect(
      isCacheFresh(
        cached({ count: 0, latestUpdatedAt: null }),
        { count: 0, latestUpdatedAt: null },
        "today",
      ),
    ).toBe(true);
  });
});
