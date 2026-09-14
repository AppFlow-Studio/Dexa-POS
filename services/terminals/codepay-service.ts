// ============================================================
// CodePay Service — on-terminal (Intent) command layer
// File: services/terminals/codepay-service.ts
// ============================================================
// Singleton that drives the on-terminal CodePay Register app via the native
// Intent bridge (native/CodePayBridge.ts → CodePayBridgeModule.kt). Unlike
// Valor/Castles (raw TCP) or ATOM (loopback HTTPS), CodePay is app-to-app: one
// Intent out, one onActivityResult back. There is no socket, no framing, no RSA
// signing (that's the cloud REST path) — just a topic + biz_data payload.
//
// A mutex serializes commands: the terminal foregrounds itself for the card
// read, so overlapping transactions are nonsensical AND the native bridge only
// allows one in-flight Intent at a time (it rejects a second with BUSY).
//
// Surface: processSale, refund, void, query, tipAdjust, batchClose.
// ============================================================

import { Mutex } from "async-mutex";
import {
  CODEPAY_DEFAULT_CURRENCY,
  CODEPAY_DEFAULT_EXPIRES_SEC,
  CODEPAY_PAY_SCENARIO,
  CODEPAY_QUERY_TIMEOUT_MS,
  CODEPAY_TOPIC,
  CODEPAY_TRANS_TYPE,
  type CodePayBatchCloseParams,
  type CodePayConnectionConfig,
  type CodePayIntentResult,
  type CodePayQueryParams,
  type CodePayRefundParams,
  type CodePaySaleParams,
  type CodePayTipAdjustParams,
  type CodePayTxnResult,
  type CodePayVoidParams,
} from "@/types/codepay";
import { codepayTransact, isCodePayBridgeAvailable } from "@/native/CodePayBridge";
import {
  buildCodePayTerminalResponse,
  isCodePaySuccess,
  parseCodePayBiz,
} from "./codepay-response-mapper";

/** Format a dollar amount as a 2-decimal string for biz_data. */
function fmtAmount(n: number): string {
  return (Math.round((n + Number.EPSILON) * 100) / 100).toFixed(2);
}

export class CodePayService {
  private _config: CodePayConnectionConfig | null = null;
  private readonly _mutex = new Mutex();

  /** True when the native Intent bridge is present in this build. */
  static isAvailable(): boolean {
    return isCodePayBridgeAvailable();
  }

  configure(config: CodePayConnectionConfig): void {
    this._config = config;
  }

  isConfigured(): boolean {
    return !!this._config;
  }

  private requireConfig(): CodePayConnectionConfig {
    if (!this._config) throw new Error("CodePayService not configured");
    return this._config;
  }

  // ── Sale ──

  /**
   * Sale (trans_type 1, topic ecrhub.pay.order). Base `amount` in DOLLARS; the
   * terminal adds the tip on top when `onScreenTip` is set, otherwise pass a
   * pre-known `tipAmount`. `referenceId` becomes merchant_order_no (idempotency).
   */
  async processSale(params: CodePaySaleParams): Promise<CodePayTxnResult> {
    const cfg = this.requireConfig();
    return this._mutex.runExclusive(async () => {
      const biz: Record<string, unknown> = {
        trans_type: CODEPAY_TRANS_TYPE.SALE,
        merchant_order_no: params.referenceId,
        order_amount: fmtAmount(params.amount),
        price_currency: CODEPAY_DEFAULT_CURRENCY,
        pay_scenario: params.payScenario ?? CODEPAY_PAY_SCENARIO.SWIPE_CARD,
        expires: CODEPAY_DEFAULT_EXPIRES_SEC,
        on_screen_tip: params.onScreenTip ?? false,
        on_screen_signature: params.onScreenSignature ?? true,
      };
      if (params.tipAmount != null && params.tipAmount > 0) {
        biz.tip_amount = fmtAmount(params.tipAmount);
      }
      if (params.receiptPrintMode != null) {
        biz.receipt_print_mode = params.receiptPrintMode;
      }
      const res = await this._dispatch(
        CODEPAY_TOPIC.ORDER,
        biz,
        cfg.timeout,
        "sale",
      );
      return this._interpret(res, "sale", params.referenceId);
    });
  }

  // ── Refund / Void ──

  /**
   * Refund (trans_type 3, topic ecrhub.pay.order). With `origMerchantOrderNo`
   * it's a referenced refund (no card tap); without, an unreferenced refund
   * (cardholder must tap/insert). Omit `amount` for a full refund.
   */
  async refund(params: CodePayRefundParams): Promise<CodePayTxnResult> {
    const cfg = this.requireConfig();
    return this._mutex.runExclusive(async () => {
      const biz: Record<string, unknown> = {
        trans_type: CODEPAY_TRANS_TYPE.REFUND,
        merchant_order_no: params.referenceId,
        price_currency: CODEPAY_DEFAULT_CURRENCY,
      };
      if (params.origMerchantOrderNo) {
        biz.orig_merchant_order_no = params.origMerchantOrderNo;
      }
      if (params.amount != null) biz.order_amount = fmtAmount(params.amount);
      if (params.tipAmount != null) biz.tip_amount = fmtAmount(params.tipAmount);
      const res = await this._dispatch(
        CODEPAY_TOPIC.ORDER,
        biz,
        cfg.timeout,
        "refund",
      );
      return this._interpret(res, "refund", params.referenceId);
    });
  }

  /**
   * Void / cancel (trans_type 2, topic ecrhub.pay.order). Reverses a sale that
   * is still in the OPEN batch (once the batch closes, void is rejected — use
   * refund). References the original by orig_merchant_order_no.
   */
  async void(params: CodePayVoidParams): Promise<CodePayTxnResult> {
    const cfg = this.requireConfig();
    return this._mutex.runExclusive(async () => {
      const biz: Record<string, unknown> = {
        trans_type: CODEPAY_TRANS_TYPE.VOID,
        merchant_order_no: params.referenceId,
      };
      if (params.origMerchantOrderNo) {
        biz.orig_merchant_order_no = params.origMerchantOrderNo;
      }
      if (params.amount != null) biz.order_amount = fmtAmount(params.amount);
      const res = await this._dispatch(
        CODEPAY_TOPIC.ORDER,
        biz,
        cfg.timeout,
        "void",
      );
      return this._interpret(res, "void", params.referenceId);
    });
  }

  // ── Query / Retrieve ──

  /**
   * Query (topic ecrhub.pay.query) — look up a prior transaction's status.
   * Used to reconcile an INDETERMINATE sale (Intent timed out) before deciding
   * whether to re-charge. Non-card op → short timeout.
   */
  async query(params: CodePayQueryParams): Promise<CodePayTxnResult> {
    this.requireConfig();
    return this._mutex.runExclusive(async () => {
      const biz: Record<string, unknown> = {};
      if (params.transNo) biz.trans_no = params.transNo;
      if (params.merchantOrderNo) biz.merchant_order_no = params.merchantOrderNo;
      const res = await this._dispatch(
        CODEPAY_TOPIC.QUERY,
        biz,
        CODEPAY_QUERY_TIMEOUT_MS,
        "query",
      );
      return this._interpret(
        res,
        "query",
        params.merchantOrderNo ?? params.transNo ?? "",
      );
    });
  }

  // ── Tip adjust ──

  /**
   * Tip adjust (topic ecrhub.pay.tip.adjustment). Sets/changes the tip on a
   * completed transaction via biz_data.tip_adjustment_amount. Per the spec the
   * ORIGINAL payment is referenced by its own merchant_order_no.
   */
  async tipAdjust(params: CodePayTipAdjustParams): Promise<CodePayTxnResult> {
    return this._mutex.runExclusive(async () => {
      const origRef = params.origMerchantOrderNo ?? params.referenceId;
      const biz: Record<string, unknown> = {
        merchant_order_no: origRef,
        tip_adjustment_amount: fmtAmount(params.tipAmount),
      };
      if (params.transNo) biz.trans_no = params.transNo;
      const res = await this._dispatch(
        CODEPAY_TOPIC.TIP_ADJUST,
        biz,
        CODEPAY_QUERY_TIMEOUT_MS,
        "tipAdjust",
      );
      return this._interpret(res, "tipAdjust", origRef);
    });
  }

  // ── Batch close (settlement) ──

  /**
   * Batch close (topic ecrhub.pay.batch.close) — submit the open batch for
   * settlement. No biz_data required.
   */
  async batchClose(
    params: CodePayBatchCloseParams = {},
  ): Promise<CodePayTxnResult> {
    this.requireConfig();
    return this._mutex.runExclusive(async () => {
      const biz: Record<string, unknown> = {};
      if (params.referenceId) biz.merchant_order_no = params.referenceId;
      const res = await this._dispatch(
        CODEPAY_TOPIC.BATCH_CLOSE,
        biz,
        CODEPAY_QUERY_TIMEOUT_MS,
        "batchClose",
      );
      return this._interpret(res, "batchClose", params.referenceId ?? "");
    });
  }

  // ── Internals ──

  /** Serialize biz_data and fire the Intent through the native bridge. */
  private async _dispatch(
    topic: string,
    biz: Record<string, unknown>,
    timeoutMs: number,
    op: string,
  ): Promise<CodePayIntentResult> {
    const cfg = this.requireConfig();
    const bizJson = JSON.stringify(biz);
    console.log(`[CodePayService] ${op} →`, { topic, biz });
    return codepayTransact(topic, cfg.appId, bizJson, timeoutMs);
  }

  /**
   * Interpret the Intent result into a CodePayTxnResult.
   *   - timedOut / RESULT_OK-with-no-readable-result → indeterminate (may have charged)
   *   - RESULT_CANCELED → aborted (no charge, retryable)
   *   - response_code "000" → success
   *   - otherwise → clean decline
   */
  private _interpret(
    res: CodePayIntentResult,
    op: string,
    referenceId: string,
  ): CodePayTxnResult {
    const biz = parseCodePayBiz(res.bizData);
    const transNo =
      typeof biz.trans_no === "string" ? biz.trans_no : undefined;

    // Native watchdog elapsed — no result came back. The card MAY have been
    // charged; the caller must reconcile via query(), never blind re-charge.
    if (res.timedOut) {
      return {
        success: false,
        indeterminate: true,
        error: res.responseMsg ?? `No response from CodePay (${op})`,
        merchantOrderNo: referenceId,
        transNo,
      };
    }

    // Cardholder backed out on the terminal — no card read, no charge.
    if (res.canceled) {
      return {
        success: false,
        aborted: true,
        error: res.responseMsg ?? "Cancelled on terminal — no charge.",
        merchantOrderNo: referenceId,
      };
    }

    // response_code is the top-level envelope field (Intent extra). Fall back to
    // a biz-level copy in case a terminal build packs it inside biz_data.
    const responseCode =
      res.responseCode ??
      (typeof biz.response_code === "string" ? biz.response_code : null);
    const responseMsg =
      res.responseMsg ??
      (typeof biz.response_msg === "string" ? biz.response_msg : null);

    console.log(`[CodePayService] ${op} result`, {
      resultCode: res.resultCode,
      responseCode,
      responseMsg,
      transNo,
      transStatus: biz.trans_status,
    });

    // We got an activity result but couldn't read a verdict (no response_code
    // and no biz payload) — treat as indeterminate rather than a clean decline.
    if (responseCode == null && !res.bizData) {
      return {
        success: false,
        indeterminate: true,
        error: `Unreadable CodePay result (${op})`,
        merchantOrderNo: referenceId,
        transNo,
      };
    }

    const terminalResponse = buildCodePayTerminalResponse(
      biz,
      this._config?.terminalId,
      this._config?.terminalSn,
    );

    if (isCodePaySuccess(responseCode)) {
      return {
        success: true,
        raw: biz,
        terminalResponse,
        transNo,
        merchantOrderNo:
          (typeof biz.merchant_order_no === "string"
            ? biz.merchant_order_no
            : undefined) ?? referenceId,
        rrn: typeof biz.ref_no === "string" ? biz.ref_no : undefined,
      };
    }

    return {
      success: false,
      raw: biz,
      terminalResponse,
      transNo,
      merchantOrderNo: referenceId,
      error:
        responseMsg ?? `${op} declined (code ${responseCode ?? "?"})`,
      errorCode: responseCode ?? undefined,
    };
  }
}

let _shared: CodePayService | null = null;
export function getSharedCodePayService(): CodePayService {
  if (!_shared) _shared = new CodePayService();
  return _shared;
}
