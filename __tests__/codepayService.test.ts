// Unit tests for the CodePay on-terminal service + response mapper.
//
// The service's job is to translate a raw Intent result (response_code +
// biz_data) into a CodePayTxnResult with the right disposition:
//   response_code "000"  → success
//   other code           → clean decline (retryable)
//   RESULT_CANCELED      → aborted (no charge)
//   timedOut / unreadable→ indeterminate (may have charged — never re-charge)
// The mapper's job is to flatten biz_data into the process_payment JSONB using
// the confirmed field names (card_no / auth_code / ref_no / entry_mode).

import type { CodePayIntentResult } from "@/types/codepay";

// Controllable native bridge — the service calls codepayTransact() under the hood.
const mockTransact = jest.fn<Promise<CodePayIntentResult>, unknown[]>();
jest.mock("@/native/CodePayBridge", () => ({
  codepayTransact: (...args: unknown[]) => mockTransact(...args),
  isCodePayBridgeAvailable: () => true,
}));

import { CodePayService } from "@/services/terminals/codepay-service";
import {
  buildCodePayTerminalResponse,
  cardBrandFromPan,
  normalizeCodePayEntryMode,
  parseCodePayBiz,
  isCodePaySuccess,
} from "@/services/terminals/codepay-response-mapper";

function makeService(): CodePayService {
  const s = new CodePayService();
  s.configure({ appId: "app_123", terminalId: "term_1", timeout: 5_000 });
  return s;
}

function intentResult(
  over: Partial<CodePayIntentResult>,
): CodePayIntentResult {
  return {
    resultCode: -1,
    responseCode: null,
    responseMsg: null,
    bizData: null,
    timedOut: false,
    canceled: false,
    ...over,
  };
}

beforeEach(() => mockTransact.mockReset());

// ── Response mapper (pure) ─────────────────────────────────────────

describe("codepay-response-mapper", () => {
  test("cardBrandFromPan derives brand from the BIN", () => {
    expect(cardBrandFromPan("430277****5723")).toBe("Visa");
    expect(cardBrandFromPan("5423 **** 1234")).toBe("Mastercard");
    expect(cardBrandFromPan("371449****1000")).toBe("Amex");
    expect(cardBrandFromPan("6011000000000004")).toBe("Discover");
    expect(cardBrandFromPan("")).toBe("");
    expect(cardBrandFromPan(undefined)).toBe("");
  });

  test("normalizeCodePayEntryMode maps the numeric code", () => {
    expect(normalizeCodePayEntryMode("1")).toBe("swipe");
    expect(normalizeCodePayEntryMode("2")).toBe("chip");
    expect(normalizeCodePayEntryMode("3")).toBe("contactless");
    expect(normalizeCodePayEntryMode("4")).toBe("manual");
    expect(normalizeCodePayEntryMode(undefined)).toBe("unknown");
  });

  test("parseCodePayBiz tolerates junk", () => {
    expect(parseCodePayBiz(null)).toEqual({});
    expect(parseCodePayBiz("not json")).toEqual({});
    expect(parseCodePayBiz('{"trans_no":"TX"}')).toEqual({ trans_no: "TX" });
  });

  test("isCodePaySuccess only accepts 000", () => {
    expect(isCodePaySuccess("000")).toBe(true);
    expect(isCodePaySuccess("001")).toBe(false);
    expect(isCodePaySuccess(null)).toBe(false);
  });

  test("buildCodePayTerminalResponse lifts the confirmed fields", () => {
    const jsonb = buildCodePayTerminalResponse(
      {
        trans_no: "TX1",
        merchant_order_no: "CP_100",
        card_no: "430277****5723",
        auth_code: "A1B2",
        ref_no: "RRN777",
        entry_mode: "2",
        card_holder_name: "JANE DOE",
      },
      "term_1",
      "SN-9",
    );
    expect(jsonb.terminal_type).toBe("codepay");
    expect(jsonb.card_last_four).toBe("5723");
    expect(String(jsonb.card_type).toLowerCase()).toContain("visa");
    expect(jsonb.auth_code).toBe("A1B2");
    expect(jsonb.rrn).toBe("RRN777"); // from ref_no, NOT a bogus rrn key
    expect(jsonb.entry_type).toBe("chip");
    expect(jsonb.transaction_id).toBe("TX1");
    expect(jsonb.serial_number).toBe("SN-9");
    const tx = jsonb.codepay_transaction as Record<string, unknown>;
    expect(tx.merchantOrderNo).toBe("CP_100");
    expect(tx.cardHolderName).toBe("JANE DOE");
  });
});

// ── Service disposition (mocked Intent) ────────────────────────────

describe("CodePayService.processSale disposition", () => {
  test("response_code 000 → success with mapped fields", async () => {
    mockTransact.mockResolvedValue(
      intentResult({
        responseCode: "000",
        bizData: JSON.stringify({
          trans_no: "TX9",
          merchant_order_no: "CP_9",
          card_no: "430277****5723",
          auth_code: "AUTH1",
          ref_no: "RRN9",
        }),
      }),
    );
    const r = await makeService().processSale({ amount: 10, referenceId: "CP_9" });
    expect(r.success).toBe(true);
    expect(r.indeterminate).toBeFalsy();
    expect(r.transNo).toBe("TX9");
    expect(r.rrn).toBe("RRN9");
    expect(r.merchantOrderNo).toBe("CP_9");
    expect(r.terminalResponse?.codepay_transaction).toBeDefined();
  });

  test("non-000 → clean decline carrying the message + code", async () => {
    mockTransact.mockResolvedValue(
      intentResult({
        responseCode: "051",
        responseMsg: "Insufficient funds",
        bizData: "{}",
      }),
    );
    const r = await makeService().processSale({ amount: 10, referenceId: "CP_x" });
    expect(r.success).toBe(false);
    expect(r.aborted).toBeFalsy();
    expect(r.indeterminate).toBeFalsy();
    expect(r.error).toBe("Insufficient funds");
    expect(r.errorCode).toBe("051");
  });

  test("RESULT_CANCELED → aborted (no charge)", async () => {
    mockTransact.mockResolvedValue(
      intentResult({ resultCode: 0, canceled: true }),
    );
    const r = await makeService().processSale({ amount: 10, referenceId: "CP_c" });
    expect(r.aborted).toBe(true);
    expect(r.success).toBe(false);
    expect(r.indeterminate).toBeFalsy();
  });

  test("timeout → indeterminate (may have charged)", async () => {
    mockTransact.mockResolvedValue(
      intentResult({ resultCode: 0, timedOut: true, responseMsg: "timeout" }),
    );
    const r = await makeService().processSale({ amount: 10, referenceId: "CP_t" });
    expect(r.indeterminate).toBe(true);
    expect(r.success).toBe(false);
    expect(r.aborted).toBeFalsy();
  });

  test("RESULT_OK with no readable verdict → indeterminate, not a decline", async () => {
    mockTransact.mockResolvedValue(
      intentResult({ responseCode: null, bizData: null }),
    );
    const r = await makeService().processSale({ amount: 10, referenceId: "CP_u" });
    expect(r.indeterminate).toBe(true);
    expect(r.success).toBe(false);
  });

  test("response_code nested in biz_data is still honored", async () => {
    mockTransact.mockResolvedValue(
      intentResult({
        responseCode: null,
        bizData: JSON.stringify({ response_code: "000", trans_no: "TXn" }),
      }),
    );
    const r = await makeService().processSale({ amount: 10, referenceId: "CP_n" });
    expect(r.success).toBe(true);
    expect(r.transNo).toBe("TXn");
  });

  test("sale biz_data carries the documented request fields", async () => {
    mockTransact.mockResolvedValue(intentResult({ responseCode: "000", bizData: "{}" }));
    await makeService().processSale({
      amount: 12.5,
      tipAmount: 2,
      referenceId: "CP_req",
    });
    const [topic, appId, bizJson] = mockTransact.mock.calls[0] as [
      string,
      string,
      string,
      number,
    ];
    expect(topic).toBe("ecrhub.pay.order");
    expect(appId).toBe("app_123");
    const biz = JSON.parse(bizJson);
    expect(biz.trans_type).toBe("1");
    expect(biz.merchant_order_no).toBe("CP_req");
    expect(biz.order_amount).toBe("12.50");
    expect(biz.tip_amount).toBe("2.00");
    expect(biz.pay_scenario).toBe("SWIPE_CARD");
  });
});

// ── Referenced reversal payloads ───────────────────────────────────

describe("CodePayService.processSale indeterminate recovery (query)", () => {
  const timedOut = intentResult({ resultCode: 0, timedOut: true, responseMsg: "timeout" });
  const queryBiz = (over: Record<string, unknown>) =>
    intentResult({
      responseCode: "000",
      bizData: JSON.stringify({
        merchant_order_no: "CP_r",
        trans_type: "1",
        trans_status: "2",
        order_amount: "10.00",
        trans_no: "TX9",
        card_no: "430277****5723",
        auth_code: "A1",
        ...over,
      }),
    });

  test("query confirms a completed sale for this order → success", async () => {
    mockTransact.mockResolvedValueOnce(timedOut).mockResolvedValueOnce(queryBiz({}));
    const r = await makeService().processSale({ amount: 10, referenceId: "CP_r" });
    expect(r.success).toBe(true);
    expect(r.indeterminate).toBeFalsy();
    expect(r.transNo).toBe("TX9");
    expect(r.merchantOrderNo).toBe("CP_r");
    // Second Intent is the query, keyed on our merchant_order_no.
    expect(mockTransact.mock.calls[1][0]).toBe("ecrhub.pay.query");
    expect(JSON.parse(mockTransact.mock.calls[1][2] as string)).toEqual({ merchant_order_no: "CP_r" });
  });

  test("trans_status as a number is honored", async () => {
    mockTransact.mockResolvedValueOnce(timedOut).mockResolvedValueOnce(queryBiz({ trans_status: 2 }));
    const r = await makeService().processSale({ amount: 10, referenceId: "CP_r" });
    expect(r.success).toBe(true);
  });

  test.each([
    ["non-completed status", { trans_status: "1" }],
    ["different merchant_order_no", { merchant_order_no: "CP_other" }],
    ["not a sale", { trans_type: "3" }],
    ["amount mismatch", { order_amount: "12.00" }],
  ])("%s → stays indeterminate (never inferred)", async (_label, over) => {
    mockTransact.mockResolvedValueOnce(timedOut).mockResolvedValueOnce(queryBiz(over));
    const r = await makeService().processSale({ amount: 10, referenceId: "CP_r" });
    expect(r.success).toBe(false);
    expect(r.indeterminate).toBe(true);
  });

  test("query declined / not found → stays indeterminate", async () => {
    mockTransact
      .mockResolvedValueOnce(timedOut)
      .mockResolvedValueOnce(intentResult({ responseCode: "404", responseMsg: "not found", bizData: "{}" }));
    const r = await makeService().processSale({ amount: 10, referenceId: "CP_r" });
    expect(r.indeterminate).toBe(true);
  });

  test("query launch rejects → stays indeterminate (no throw)", async () => {
    mockTransact.mockResolvedValueOnce(timedOut).mockRejectedValueOnce(new Error("BUSY"));
    const r = await makeService().processSale({ amount: 10, referenceId: "CP_r" });
    expect(r.indeterminate).toBe(true);
  });

  test("definitive results never trigger a query", async () => {
    mockTransact.mockResolvedValueOnce(intentResult({ resultCode: 0, canceled: true }));
    await makeService().processSale({ amount: 10, referenceId: "CP_r" });
    expect(mockTransact).toHaveBeenCalledTimes(1);
  });
});

describe("CodePay sale watchdog", () => {
  test("outlasts the Register order expiry", () => {
    const { CODEPAY_SALE_TIMEOUT_MS, CODEPAY_DEFAULT_EXPIRES_SEC } = jest.requireActual("@/types/codepay");
    expect(CODEPAY_SALE_TIMEOUT_MS).toBeGreaterThanOrEqual(CODEPAY_DEFAULT_EXPIRES_SEC * 1000 + 30_000);
  });
});

describe("CodePayService refund/void payloads", () => {
  test("referenced refund sends trans_type 3 + orig_merchant_order_no", async () => {
    mockTransact.mockResolvedValue(intentResult({ responseCode: "000", bizData: "{}" }));
    await makeService().refund({
      referenceId: "CPRF_1",
      origMerchantOrderNo: "CP_9",
      amount: 5,
    });
    const biz = JSON.parse(mockTransact.mock.calls[0][2] as string);
    expect(biz.trans_type).toBe("3");
    expect(biz.orig_merchant_order_no).toBe("CP_9");
    expect(biz.order_amount).toBe("5.00");
  });

  test("void sends trans_type 2 + orig_merchant_order_no (no trans_no)", async () => {
    mockTransact.mockResolvedValue(intentResult({ responseCode: "000", bizData: "{}" }));
    await makeService().void({
      referenceId: "CPVD_1",
      origMerchantOrderNo: "CP_9",
      amount: 10,
    });
    const biz = JSON.parse(mockTransact.mock.calls[0][2] as string);
    expect(biz.trans_type).toBe("2");
    expect(biz.orig_merchant_order_no).toBe("CP_9");
    expect(biz.trans_no).toBeUndefined();
  });

  test("tip adjust references the original by merchant_order_no", async () => {
    mockTransact.mockResolvedValue(intentResult({ responseCode: "000", bizData: "{}" }));
    await makeService().tipAdjust({
      referenceId: "CPTA_1",
      origMerchantOrderNo: "CP_9",
      tipAmount: 3,
    });
    const [topic, , bizJson] = mockTransact.mock.calls[0] as [string, string, string, number];
    expect(topic).toBe("ecrhub.pay.tip.adjustment");
    const biz = JSON.parse(bizJson);
    expect(biz.merchant_order_no).toBe("CP_9");
    expect(biz.tip_adjustment_amount).toBe("3.00");
  });
});
