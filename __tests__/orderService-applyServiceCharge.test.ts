/**
 * OrderService.applyServiceCharge — Wave C client wrapper test.
 *
 * Covers the wrapper's three jobs:
 *   1. Kill switch (EXPO_PUBLIC_SERVICE_CHARGE_ENABLED=0): bail without RPC.
 *   2. Idempotency: pass-through of keyOverride, fresh uuid otherwise.
 *   3. RPC name + param shape: function name and required params reach the
 *      Supabase client unchanged.
 *
 * The deadline wrap (runWithDeadline) and the underlying SQL function are
 * not in scope — the migration's `How to test` block covers staging
 * verification for the server-side behavior.
 */

const mockKillSwitch = { isServiceChargeEnabled: true };

jest.mock("@/lib/serviceCharge", () => ({
  get isServiceChargeEnabled() {
    return mockKillSwitch.isServiceChargeEnabled;
  },
}));

// uuid ships ESM and isn't in transformIgnorePatterns — stub with a
// deterministic but-incrementing v4 so the "distinct keys" assertion still
// fires while side-stepping the SyntaxError on import.
// `mock`-prefixed name is required by jest's hoist rule for factory closures.
jest.mock("uuid", () => {
  let mockUuidSeq = 0;
  return {
    v4: () => {
      mockUuidSeq += 1;
      const tail = String(mockUuidSeq).padStart(12, "0");
      return `00000000-0000-4000-8000-${tail}`;
    },
  };
});

// Bypass deadline wrap — just invoke the call function directly with a
// no-op AbortSignal so we can inspect what the wrapper passes to client.rpc.
jest.mock("@/lib/network/runWithDeadline", () => ({
  runWithDeadline: jest.fn(
    async <T,>(
      _op: string,
      _ms: number,
      call: (signal: AbortSignal) => Promise<{ data: T | null; error: any }>,
    ) => {
      const ac = new AbortController();
      return call(ac.signal);
    },
  ),
}));

import { OrderService } from "@/services/orderService";

type RpcCapture = { name: string; params: Record<string, any> };

function buildClient(response: { data: any; error: any }): {
  client: any;
  captures: RpcCapture[];
} {
  const captures: RpcCapture[] = [];
  const client = {
    rpc: (name: string, params: Record<string, any>) => {
      captures.push({ name, params });
      return {
        abortSignal: (_signal: AbortSignal) => Promise.resolve(response),
      };
    },
  };
  return { client, captures };
}

describe("OrderService.applyServiceCharge", () => {
  beforeEach(() => {
    mockKillSwitch.isServiceChargeEnabled = true;
  });

  test("kill switch off short-circuits — no RPC call", async () => {
    mockKillSwitch.isServiceChargeEnabled = false;
    const { client, captures } = buildClient({ data: null, error: null });

    const result = await OrderService.applyServiceCharge(client, {
      p_order_id: "order-xyz",
      p_party_size: 6,
    });

    expect(captures).toHaveLength(0);
    expect(result).toEqual({ data: null, error: null });
  });

  test("calls apply_service_charge_v1 with required params + generated idempotency key", async () => {
    const { client, captures } = buildClient({
      data: {
        success: true,
        service_charge: 12.34,
        service_charge_rule_id: "rule-1",
        service_charge_rate: 18,
        service_charge_applies_on: "pre_discount",
        service_charge_name: "Auto-Gratuity",
        card_subtotal: 68.55,
        cash_subtotal: 65.12,
        card_total: 80.89,
        cash_total: 77.46,
        eligible: true,
        old_service_charge: 0,
      },
      error: null,
    });

    const result = await OrderService.applyServiceCharge(client, {
      p_order_id: "order-xyz",
      p_party_size: 6,
      p_station_id: "station-7",
    });

    expect(captures).toHaveLength(1);
    expect(captures[0].name).toBe("apply_service_charge_v1");
    expect(captures[0].params.p_order_id).toBe("order-xyz");
    expect(captures[0].params.p_party_size).toBe(6);
    expect(captures[0].params.p_station_id).toBe("station-7");
    expect(typeof captures[0].params.p_idempotency_key).toBe("string");
    // uuidv4 shape — 8-4-4-4-12 hex
    expect(captures[0].params.p_idempotency_key).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
    expect(result.data?.service_charge).toBe(12.34);
    expect(result.error).toBeNull();
  });

  test("keyOverride is honored for retry-stable invocations", async () => {
    const { client, captures } = buildClient({ data: null, error: null });
    const stableKey = "11111111-2222-3333-4444-555555555555";

    await OrderService.applyServiceCharge(
      client,
      { p_order_id: "order-1", p_party_size: 6 },
      { keyOverride: stableKey },
    );

    expect(captures[0].params.p_idempotency_key).toBe(stableKey);
  });

  test("refresh mode — p_party_size NULL passes through", async () => {
    const { client, captures } = buildClient({ data: null, error: null });

    await OrderService.applyServiceCharge(client, {
      p_order_id: "order-1",
      p_party_size: null,
    });

    expect(captures[0].params.p_party_size).toBeNull();
  });

  test("two calls without keyOverride get distinct idempotency keys", async () => {
    const { client, captures } = buildClient({ data: null, error: null });

    await OrderService.applyServiceCharge(client, {
      p_order_id: "order-1",
      p_party_size: 6,
    });
    await OrderService.applyServiceCharge(client, {
      p_order_id: "order-1",
      p_party_size: 6,
    });

    expect(captures).toHaveLength(2);
    expect(captures[0].params.p_idempotency_key).not.toBe(
      captures[1].params.p_idempotency_key,
    );
  });

  test("RPC error is surfaced unchanged", async () => {
    const err = { message: "boom", code: "PGRST123" };
    const { client } = buildClient({ data: null, error: err });

    const result = await OrderService.applyServiceCharge(client, {
      p_order_id: "order-1",
      p_party_size: 6,
    });

    expect(result.error).toBe(err);
    expect(result.data).toBeNull();
  });
});
