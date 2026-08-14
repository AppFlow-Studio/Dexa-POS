/**
 * rpcVersionFallback — the guard that lets the client adopt a new RPC before
 * every environment has the migration.
 *
 * The dangerous failure is falling back on the WRONG error: masking a
 * permissions failure or a deadline by silently re-running the old function
 * hides the real fault and doubles the latency of every failure.
 */
import {
  __resetRpcFallbackMemo,
  isMissingFunctionError,
  rpcWithVersionFallback,
} from "@/lib/network/rpcVersionFallback";

const ok = (data: any) => async () => ({ data, error: null });
const fail = (code: string) => async () => ({
  data: null,
  error: { code, message: `boom ${code}` },
});

beforeEach(() => __resetRpcFallbackMemo());

describe("isMissingFunctionError", () => {
  it("recognises both missing-function codes", () => {
    // 42883 = Postgres undefined_function, PGRST202 = PostgREST schema cache
    expect(isMissingFunctionError({ code: "42883" })).toBe(true);
    expect(isMissingFunctionError({ code: "PGRST202" })).toBe(true);
  });

  it("does NOT treat real failures as a missing function", () => {
    expect(isMissingFunctionError({ code: "42501" })).toBe(false); // permission denied
    expect(isMissingFunctionError({ code: "DEADLINE_EXCEEDED" })).toBe(false);
    expect(isMissingFunctionError({ code: "23505" })).toBe(false); // unique violation
    expect(isMissingFunctionError(null)).toBe(false);
    expect(isMissingFunctionError(undefined)).toBe(false);
  });
});

describe("rpcWithVersionFallback", () => {
  it("uses the preferred RPC and never calls legacy when it succeeds", async () => {
    const legacy = jest.fn(ok("legacy"));
    const res = await rpcWithVersionFallback("fn_a", ok("new"), legacy);

    expect(res.data).toBe("new");
    expect(res.usedFallback).toBe(false);
    expect(legacy).not.toHaveBeenCalled();
  });

  it("falls back when the preferred function is not deployed", async () => {
    const res = await rpcWithVersionFallback(
      "fn_b",
      fail("PGRST202"),
      ok("legacy"),
    );

    expect(res.data).toBe("legacy");
    expect(res.usedFallback).toBe(true);
  });

  it("propagates a REAL error instead of masking it with the legacy path", async () => {
    const legacy = jest.fn(ok("legacy"));
    const res = await rpcWithVersionFallback("fn_c", fail("42501"), legacy);

    // Permission denied must surface, not silently downgrade.
    expect((res.error as any).code).toBe("42501");
    expect(res.data).toBeNull();
    expect(res.usedFallback).toBe(false);
    expect(legacy).not.toHaveBeenCalled();
  });

  it("probes a missing function only ONCE per session, then goes straight to legacy", async () => {
    const preferred = jest.fn(fail("42883"));
    const legacy = jest.fn(ok("legacy"));

    for (let i = 0; i < 5; i++) {
      await rpcWithVersionFallback("fn_d", preferred, legacy);
    }

    // Without the memo the KDS board would pay a doomed round-trip every
    // 15-30s poll, forever, on any environment missing the new RPC.
    expect(preferred).toHaveBeenCalledTimes(1);
    expect(legacy).toHaveBeenCalledTimes(5);
  });

  it("memoises per function name, not globally", async () => {
    const preferredE = jest.fn(fail("42883"));
    const preferredF = jest.fn(ok("f-new"));

    await rpcWithVersionFallback("fn_e", preferredE, ok("legacy"));
    const res = await rpcWithVersionFallback("fn_f", preferredF, ok("legacy"));

    // fn_e being absent must not stop fn_f from being tried.
    expect(res.data).toBe("f-new");
    expect(res.usedFallback).toBe(false);
    expect(preferredF).toHaveBeenCalledTimes(1);
  });
});
