// Fire-and-forget trigger for the `email-batch-summary` Edge Function
// (DexaPOS-Website PR #246). Contract: invoke the right function with the right
// body, forward whatever the function returns, and NEVER throw — every failure
// mode (invoke error / thrown / empty body) resolves to { success: false }.
import { sendBatchSummaryEmail } from "@/services/messaging/sendBatchSummaryEmail";
import type { SupabaseClient } from "@supabase/supabase-js";

function clientWith(invoke: jest.Mock): SupabaseClient {
  return { functions: { invoke } } as unknown as SupabaseClient;
}

describe("sendBatchSummaryEmail", () => {
  beforeEach(() => {
    jest.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => jest.restoreAllMocks());

  it("POSTs settlement_batch_id to the email-batch-summary function", async () => {
    const invoke = jest
      .fn()
      .mockResolvedValue({ data: { success: true }, error: null });

    const res = await sendBatchSummaryEmail({
      client: clientWith(invoke),
      settlementBatchId: "batch-uuid-123",
    });

    expect(invoke).toHaveBeenCalledWith("email-batch-summary", {
      body: { settlement_batch_id: "batch-uuid-123" },
    });
    expect(res.success).toBe(true);
  });

  it("passes through a server-side skip result", async () => {
    const invoke = jest
      .fn()
      .mockResolvedValue({ data: { success: true, skipped: "disabled" }, error: null });

    const res = await sendBatchSummaryEmail({
      client: clientWith(invoke),
      settlementBatchId: "batch-uuid-123",
    });

    expect(res).toEqual({ success: true, skipped: "disabled" });
  });

  it("short-circuits without invoking when the batch id is missing", async () => {
    const invoke = jest.fn();

    const res = await sendBatchSummaryEmail({
      client: clientWith(invoke),
      settlementBatchId: "",
    });

    expect(invoke).not.toHaveBeenCalled();
    expect(res.success).toBe(false);
  });

  it("swallows an invoke error (never throws)", async () => {
    const invoke = jest
      .fn()
      .mockResolvedValue({ data: null, error: { message: "function not found" } });

    const res = await sendBatchSummaryEmail({
      client: clientWith(invoke),
      settlementBatchId: "batch-uuid-123",
    });

    expect(res.success).toBe(false);
    expect(res.message).toBe("function not found");
  });

  it("swallows a thrown network error (never throws)", async () => {
    const invoke = jest.fn().mockRejectedValue(new Error("Network request failed"));

    await expect(
      sendBatchSummaryEmail({
        client: clientWith(invoke),
        settlementBatchId: "batch-uuid-123",
      })
    ).resolves.toEqual({ success: false, message: "Network request failed" });
  });
});
