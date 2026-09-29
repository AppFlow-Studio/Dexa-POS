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
  classifyCodePayReversalDecline,
  nextCodePayReversalOperation,
} from "@/services/terminals/codepay-reversal";
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

// ── Reversals: void while in the batch, refund after (CodePay docs) ─────────

describe("CodePay reversal payloads match the documented samples", () => {
  test("refund and void both carry pay_scenario SWIPE_CARD", async () => {
    mockTransact.mockResolvedValue(intentResult({ responseCode: "000", bizData: "{}" }));
    const s = makeService();
    await s.refund({ referenceId: "CPRF_1", origMerchantOrderNo: "CP_9", amount: 2.15 });
    await s.void({ referenceId: "CPVD_1", origMerchantOrderNo: "CP_9", amount: 2.15 });
    const refund = JSON.parse(mockTransact.mock.calls[0][2] as string);
    const voided = JSON.parse(mockTransact.mock.calls[1][2] as string);
    expect(mockTransact.mock.calls[0][0]).toBe("ecrhub.pay.order");
    expect(refund).toMatchObject({
      trans_type: "3",
      merchant_order_no: "CPRF_1",
      orig_merchant_order_no: "CP_9",
      pay_scenario: "SWIPE_CARD",
      order_amount: "2.15",
    });
    expect(voided).toMatchObject({
      trans_type: "2",
      merchant_order_no: "CPVD_1",
      orig_merchant_order_no: "CP_9",
      pay_scenario: "SWIPE_CARD",
      order_amount: "2.15",
    });
    expect(voided.tip_amount).toBeUndefined();
  });
});

describe("classifyCodePayReversalDecline", () => {
  test.each([
    ["ET008", "Reversal not allowed, the transaction was settled", "void_not_allowed"],
    ["CF008", "Authorized completed transactions do not support void, please use the refund function", "void_not_allowed"],
    ["TS-D0004", "Reversal Not Allowed", "void_not_allowed"],
    ["942", "Void/Full Reversal request unable to process due to settlement already occurred.", "void_not_allowed"],
    ["TS-D0005", "Return Not Allowed", "refund_not_allowed"],
    ["D0091", "Return Not Allowed (Backend)", "refund_not_allowed"],
    ["999", "The transaction has not been settled", "refund_not_allowed"],
    ["ET003", "The transaction does not exist", "not_found"],
    ["E04111", "Merchant order number is invalid", "not_found"],
    ["E04126", "Refund amount exceeds the limit", "amount_exceeds"],
    ["E04132", "Partial refund is not allowed for this transaction", "partial_not_allowed"],
    ["E04112", "Merchant order number repeat", "duplicate_reference"],
    ["334", "Already reversed", "already_reversed"],
    ["TS-D0094", "Return not allowed, Card number requested does not match with original transaction card number", "card_mismatch"],
  ])("%s %s → %s", (code, msg, kind) => {
    expect(classifyCodePayReversalDecline(code, msg)).toBe(kind);
  });

  test("gateway and configuration errors are never a verdict on the sale", () => {
    // E07303's text contains "does not exist"; SYS012 is a missing parameter.
    expect(classifyCodePayReversalDecline("E07303", "The API is not authorized or does not exist")).toBe("unknown");
    expect(classifyCodePayReversalDecline("SYS012", "parameter cannot be empty:pay_scenario")).toBe("unknown");
    expect(classifyCodePayReversalDecline(null, "[SYS012] the transaction was settled")).toBe("unknown");
  });

  test("declines, timeouts and unknown codes stay unknown", () => {
    expect(classifyCodePayReversalDecline("TS-D2012", "Insufficient Funds")).toBe("unknown");
    expect(classifyCodePayReversalDecline("950", "System malfunction or timeout")).toBe("unknown");
    expect(classifyCodePayReversalDecline(undefined, undefined)).toBe("unknown");
  });

  test("the other operation is only tried for a batch-state decline", () => {
    expect(nextCodePayReversalOperation("void", "void_not_allowed", true)).toBe("refund");
    expect(nextCodePayReversalOperation("refund", "refund_not_allowed", true)).toBe("void");
    // A void can't stand in for part of a sale.
    expect(nextCodePayReversalOperation("refund", "refund_not_allowed", false)).toBeNull();
    expect(nextCodePayReversalOperation("void", "not_found", true)).toBeNull();
    expect(nextCodePayReversalOperation("void", "unknown", true)).toBeNull();
    expect(nextCodePayReversalOperation("refund", "void_not_allowed", true)).toBeNull();
  });
});

describe("CodePayService.reverse", () => {
  const sale = {
    origMerchantOrderNo: "CP_sale",
    amount: 9.74,
    saleAmount: 9.74,
    saleTipAmount: 1.46,
    referenceSuffix: "pay-cb79",
  };
  const approved = (over: Record<string, unknown> = {}) =>
    intentResult({
      responseCode: "000",
      bizData: JSON.stringify({ trans_no: "T1", auth_code: "A1", ref_no: "R1", ...over }),
    });
  const declined = (code: string, msg: string) =>
    intentResult({ responseCode: code, responseMsg: msg, bizData: "{}" });
  const timedOut = intentResult({ timedOut: true });
  const sent = (i: number) => JSON.parse(mockTransact.mock.calls[i][2] as string);

  test("whole sale still in the batch → void carrying the sale's amounts", async () => {
    mockTransact.mockResolvedValueOnce(approved());
    const r = await makeService().reverse({ ...sale, coversWholeSale: true, inOpenBatch: true });
    expect(r.success).toBe(true);
    expect(r.operation).toBe("void");
    expect(mockTransact).toHaveBeenCalledTimes(1);
    expect(sent(0)).toMatchObject({
      trans_type: "2",
      orig_merchant_order_no: "CP_sale",
      order_amount: "9.74",
      tip_amount: "1.46",
    });
    expect(sent(0).merchant_order_no).toMatch(/^CPVD_\d+_cb79$/);
    expect(sent(0).merchant_order_no.length).toBeLessThanOrEqual(32);
    expect((r.terminalResponse as any).codepay_reversal.operation).toBe("void");
    expect((r.terminalResponse as any).result_code).toBe("000");
  });

  test("batched out → referenced refund for the amount, tip left alone", async () => {
    mockTransact.mockResolvedValueOnce(approved());
    const r = await makeService().reverse({ ...sale, coversWholeSale: true, inOpenBatch: false });
    expect(r.operation).toBe("refund");
    expect(sent(0)).toMatchObject({
      trans_type: "3",
      orig_merchant_order_no: "CP_sale",
      order_amount: "9.74",
    });
    expect(sent(0).tip_amount).toBeUndefined();
    expect(sent(0).merchant_order_no).toMatch(/^CPRF_/);
  });

  test("part of a sale is always a refund, even in the open batch", async () => {
    mockTransact.mockResolvedValueOnce(approved());
    const r = await makeService().reverse({
      ...sale,
      amount: 4,
      coversWholeSale: false,
      inOpenBatch: true,
    });
    expect(r.operation).toBe("refund");
    expect(sent(0).order_amount).toBe("4.00");
  });

  test("void turned down because the batch closed → refund, once", async () => {
    mockTransact
      .mockResolvedValueOnce(declined("ET008", "Reversal not allowed, the transaction was settled"))
      .mockResolvedValueOnce(approved());
    const r = await makeService().reverse({ ...sale, coversWholeSale: true, inOpenBatch: true });
    expect(r.success).toBe(true);
    expect(r.operation).toBe("refund");
    expect(mockTransact).toHaveBeenCalledTimes(2);
    expect(sent(0).trans_type).toBe("2");
    expect(sent(1).trans_type).toBe("3");
    expect(r.attempts.map((a) => [a.operation, a.outcome, a.declineKind])).toEqual([
      ["void", "declined", "void_not_allowed"],
      ["refund", "approved", undefined],
    ]);
  });

  test("refund turned down because the batch is open → void, for a whole sale", async () => {
    mockTransact
      .mockResolvedValueOnce(declined("TS-D0005", "Return Not Allowed"))
      .mockResolvedValueOnce(approved());
    const r = await makeService().reverse({ ...sale, coversWholeSale: true, inOpenBatch: false });
    expect(r.success).toBe(true);
    expect(r.operation).toBe("void");
    expect(sent(1).trans_type).toBe("2");
  });

  test("a partial refund on an open batch stops and says to batch out", async () => {
    mockTransact.mockResolvedValueOnce(declined("TS-D0005", "Return Not Allowed"));
    const r = await makeService().reverse({
      ...sale,
      amount: 4,
      coversWholeSale: false,
      inOpenBatch: true,
    });
    expect(r.success).toBe(false);
    expect(mockTransact).toHaveBeenCalledTimes(1);
    expect(r.declineKind).toBe("refund_not_allowed");
    expect(r.error).toMatch(/hasn't been batched out/);
    expect(r.error).toMatch(/D0005/);
  });

  test("both operations turned down → fails with the last answer", async () => {
    mockTransact
      .mockResolvedValueOnce(declined("ET008", "Reversal not allowed, the transaction was settled"))
      .mockResolvedValueOnce(declined("ET003", "The transaction does not exist"));
    const r = await makeService().reverse({ ...sale, coversWholeSale: true, inOpenBatch: true });
    expect(r.success).toBe(false);
    expect(r.declineKind).toBe("not_found");
    expect(mockTransact).toHaveBeenCalledTimes(2);
  });

  test("any other decline never triggers the other operation", async () => {
    mockTransact.mockResolvedValueOnce(declined("950", "System malfunction or timeout"));
    const r = await makeService().reverse({ ...sale, coversWholeSale: true, inOpenBatch: true });
    expect(r.success).toBe(false);
    expect(mockTransact).toHaveBeenCalledTimes(1);
    expect(r.error).toMatch(/System malfunction/);
  });

  test("cancelled on the terminal → nothing else is sent", async () => {
    mockTransact.mockResolvedValueOnce(intentResult({ resultCode: 0, canceled: true }));
    const r = await makeService().reverse({ ...sale, coversWholeSale: true, inOpenBatch: true });
    expect(r.success).toBe(false);
    expect(r.aborted).toBe(true);
    expect(mockTransact).toHaveBeenCalledTimes(1);
  });

  test("unknown outcome: Register confirms the refund → success", async () => {
    mockTransact.mockResolvedValueOnce(timedOut).mockImplementationOnce(async (...args) => {
      const asked = JSON.parse(args[2] as string).merchant_order_no;
      return approved({
        merchant_order_no: asked,
        trans_type: "3",
        trans_status: "2",
        order_amount: "9.74",
      });
    });
    const r = await makeService().reverse({ ...sale, coversWholeSale: true, inOpenBatch: false });
    expect(r.success).toBe(true);
    expect(r.recoveredVia).toBe("device_query");
    expect(mockTransact.mock.calls[1][0]).toBe("ecrhub.pay.query");
    expect(sent(1).merchant_order_no).toBe(sent(0).merchant_order_no);
    expect(r.attempts[0].outcome).toBe("recovered");
  });

  test("unknown outcome Register can't confirm → unconfirmed, no second operation", async () => {
    mockTransact
      .mockResolvedValueOnce(timedOut)
      .mockResolvedValueOnce(declined("E04111", "Merchant order number is invalid"));
    const r = await makeService().reverse({ ...sale, coversWholeSale: true, inOpenBatch: false });
    expect(r.success).toBe(false);
    expect(r.indeterminate).toBe(true);
    expect(mockTransact).toHaveBeenCalledTimes(2); // the refund + one lookup
    expect(r.error).toMatch(/couldn't be confirmed/);
    expect(r.error).toContain(sent(0).merchant_order_no);
  });

  test("a lookup for a different amount does not confirm a refund", async () => {
    mockTransact.mockResolvedValueOnce(timedOut).mockImplementationOnce(async (...args) =>
      approved({
        merchant_order_no: JSON.parse(args[2] as string).merchant_order_no,
        trans_type: "3",
        trans_status: "2",
        order_amount: "1.00",
      }),
    );
    const r = await makeService().reverse({ ...sale, coversWholeSale: true, inOpenBatch: false });
    expect(r.success).toBe(false);
    expect(r.indeterminate).toBe(true);
  });

  test("unknown void: the sale reading void confirms it", async () => {
    mockTransact
      .mockResolvedValueOnce(timedOut)
      .mockResolvedValueOnce(declined("E04111", "Merchant order number is invalid"))
      .mockResolvedValueOnce(
        approved({ merchant_order_no: "CP_sale", trans_type: "1", trans_status: 3 }),
      );
    const r = await makeService().reverse({ ...sale, coversWholeSale: true, inOpenBatch: true });
    expect(r.success).toBe(true);
    expect(r.operation).toBe("void");
    expect(sent(2).merchant_order_no).toBe("CP_sale");
  });

  test("each reference is handed over before its Intent goes out", async () => {
    const seen: string[] = [];
    mockTransact.mockImplementationOnce(async (...args) => {
      // By the time the Intent is sent the reference is already on record.
      expect(seen).toEqual([JSON.parse(args[2] as string).merchant_order_no]);
      return approved();
    });
    await makeService().reverse({
      ...sale,
      coversWholeSale: true,
      inOpenBatch: false,
      onAttempt: (a) => seen.push(a.referenceId),
    });
    expect(seen).toHaveLength(1);
  });
});
