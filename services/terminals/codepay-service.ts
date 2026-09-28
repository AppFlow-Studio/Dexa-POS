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
import { AppState } from "react-native";
import {
  CODEPAY_DEFAULT_CURRENCY,
  CODEPAY_DEFAULT_EXPIRES_SEC,
  CODEPAY_EXPIRY_GRACE_MS,
  CODEPAY_LIVE_TRANS_STATUSES,
  CODEPAY_LOOKUP_BUDGET_MS,
  CODEPAY_LOOKUP_RETRY_MS,
  CODEPAY_PAY_SCENARIO,
  CODEPAY_QUERY_TIMEOUT_MS,
  CODEPAY_TOPIC,
  CODEPAY_TRANS_STATUS,
  CODEPAY_TRANS_TYPE,
  codepaySaleTimeoutMs,
  type CodePayBizResult,
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
import type {
  CodePayCloudLookup,
  CodePayStatusLookupFn,
} from "./codepayStatusLookup";

/** Format a dollar amount as a 2-decimal string for biz_data. */
function fmtAmount(n: number): string {
  return (Math.round((n + Number.EPSILON) * 100) / 100).toFixed(2);
}

/** Monotonic ms clock (wall-clock jumps must not skew the expiry check). */
function monotonicNow(): number {
  return typeof performance !== "undefined" && typeof performance.now === "function"
    ? performance.now()
    : Date.now();
}

/**
 * Resolve once Dexa is back in the foreground. CodePay Register runs on top of
 * our activity, so "active" means Register has closed. Event-driven on purpose:
 * JS timers are paused while Register is in front.
 */
function waitForAppActive(): Promise<void> {
  // Only a definite background/inactive state means Register is on top; an
  // unknown state must not wedge the next payment.
  const state = AppState.currentState;
  if (state !== "background" && state !== "inactive") return Promise.resolve();
  return new Promise((resolve) => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        sub.remove();
        resolve();
      }
    });
  });
}

function hasText(v: unknown): boolean {
  return typeof v === "string" && v.trim().length > 0;
}

/**
 * True when a sale result shows no sign that a card was read: no trans_no, no
 * auth code, no card number, no live/settled trans_status, nothing paid.
 */
function isNoCardRead(biz: CodePayBizResult): boolean {
  if (hasText(biz.trans_no) || hasText(biz.auth_code) || hasText(biz.card_no)) {
    return false;
  }
  if (biz.trans_status != null && String(biz.trans_status).trim() !== "") {
    const status = Number(biz.trans_status);
    if (!Number.isFinite(status) || CODEPAY_LIVE_TRANS_STATUSES.includes(status)) {
      return false;
    }
  }
  const paid = Number(biz.paid_amount);
  if (Number.isFinite(paid) && paid > 0) return false;
  return true;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Does a host-approved sale match what we charged? Amounts are required — an
 * approval we can't match is held for staff rather than recorded.
 */
function cloudMatchesSale(
  r: CodePayCloudLookup,
  sale: { referenceId: string; amount: number; tipAmount?: number },
): boolean {
  if (r.merchant_order_no && r.merchant_order_no !== sale.referenceId) return false;
  if (r.trans_type != null && r.trans_type !== "" && String(r.trans_type) !== CODEPAY_TRANS_TYPE.SALE) {
    return false;
  }
  if (r.order_amount == null || r.order_amount === "") return false;
  const tip = sale.tipAmount ?? 0;
  if (fmtAmount(Number(r.order_amount)) !== fmtAmount(sale.amount)) return false;
  if (r.tip_amount != null && r.tip_amount !== "" && fmtAmount(Number(r.tip_amount)) !== fmtAmount(tip)) {
    return false;
  }
  const total = fmtAmount(sale.amount + tip);
  for (const v of [r.paid_amount, r.trans_amount]) {
    if (v != null && v !== "" && Number(v) > 0 && fmtAmount(Number(v)) !== total) return false;
  }
  return true;
}

export interface CodePaySaleOptions {
  /** Cloud status lookup for this location (kiosk). Absent = on-device only. */
  statusLookup?: CodePayStatusLookupFn;
  /**
   * Previous attempt's merchant_order_no ("Need more time?" relaunch): looked
   * up first, so a late host approval is recorded instead of charging again.
   */
  priorReferenceId?: string;
  /** Fired when an unknown / lapsed sale is being verified with the host. */
  onVerifying?: () => void;
}

interface SaleTiming {
  /** The window the caller asked for; expiry classification only runs when set. */
  expiresSec?: number;
  elapsedMs: number;
}

export class CodePayService {
  private _config: CodePayConnectionConfig | null = null;
  private readonly _mutex = new Mutex();
  /**
   * Set when a call's native watchdog elapsed: Register may still be on screen
   * (the bridge has already dropped its promise), so the next Intent must wait
   * until Dexa is foregrounded again rather than stack a second Register
   * activity on the live one (they share one request code).
   */
  private _awaitingForeground = false;

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

  /** True when a command Intent is in flight (mutex held). */
  isLocked(): boolean {
    return this._mutex.isLocked();
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
  async processSale(
    params: CodePaySaleParams,
    opts: CodePaySaleOptions = {},
  ): Promise<CodePayTxnResult> {
    const trail: NonNullable<CodePayTxnResult["cloudLookups"]> = [];

    // Relaunch after "Need more time?": if the host actually approved the
    // previous attempt, record that instead of charging the customer again.
    if (opts.statusLookup && opts.priorReferenceId) {
      const prior = await this._lookupOnce(opts.statusLookup, opts.priorReferenceId, trail);
      if (
        prior.status === "approved" &&
        cloudMatchesSale(prior, { ...params, referenceId: opts.priorReferenceId })
      ) {
        console.warn("[CodePayService] prior attempt approved on host — recording it", {
          priorReferenceId: opts.priorReferenceId,
          transNo: prior.trans_no,
        });
        return {
          ...this._successFromCloud(prior, opts.priorReferenceId),
          contradictedRegister: true,
          cloudLookups: trail,
        };
      }
    }

    const result = await this._runSale(params);
    if (!result.indeterminate && !result.expired) return result;

    // Outcome unknown (watchdog / unreadable) or the window lapsed. Ask the
    // host first — it doesn't depend on Register, the thing that just failed.
    if (opts.statusLookup) {
      opts.onVerifying?.();
      const resolved = await this._resolveViaCloud(params, result, opts.statusLookup, trail);
      if (resolved) {
        return {
          ...resolved,
          elapsedMs: result.elapsedMs,
          resultCode: result.resultCode,
          errorCode: resolved.errorCode ?? result.errorCode,
          cloudLookups: trail,
        };
      }
    }

    // Host couldn't decide (or isn't configured): ask Register for this
    // merchant_order_no before handing off to a manual review / the prompt —
    // mirrors Valor's TRAN_MODE 90 recovery. Can only UPGRADE to success.
    const recovered = await this._recoverSale(params.referenceId, params.amount);
    const withTrail = trail.length > 0 ? { cloudLookups: trail } : {};
    return recovered
      ? { ...recovered, elapsedMs: result.elapsedMs, recoveredVia: "device_query", ...withTrail }
      : { ...result, ...withTrail };
  }

  /** One host lookup, recorded on the trail. Never throws. */
  private async _lookupOnce(
    lookup: CodePayStatusLookupFn,
    ref: string,
    trail: NonNullable<CodePayTxnResult["cloudLookups"]>,
  ): Promise<CodePayCloudLookup> {
    let r: CodePayCloudLookup;
    try {
      r = await lookup(ref);
    } catch (e) {
      r = { status: "unavailable", reason: e instanceof Error ? e.message : "error" };
    }
    trail.push({ ref, status: r.status, reason: r.reason, latencyMs: r.latencyMs });
    console.log("[CodePayService] cloud lookup", { ref, status: r.status, reason: r.reason });
    return r;
  }

  /**
   * Resolve an unknown / lapsed sale with the host. Returns a final result, or
   * null when the host can't decide (unconfigured, unreachable) so the caller
   * falls back to Register's own query.
   *
   *  - Watchdog / unreadable: wait until Dexa is foregrounded (Register closed
   *    — before that a "not found" proves nothing), then require TWO no-charge
   *    answers at least CODEPAY_LOOKUP_RETRY_MS apart.
   *  - Lapsed window (Register already returned): one no-charge answer is
   *    enough, and an unreachable host means trust Register.
   *  - A sale the host still reports in progress at the end of the budget is
   *    never treated as uncharged — it's held.
   */
  private async _resolveViaCloud(
    params: CodePaySaleParams,
    result: CodePayTxnResult,
    lookup: CodePayStatusLookupFn,
    trail: NonNullable<CodePayTxnResult["cloudLookups"]>,
  ): Promise<CodePayTxnResult | null> {
    const afterWatchdog = !!result.indeterminate;
    if (afterWatchdog) await waitForAppActive();
    const needed = afterWatchdog ? 2 : 1;
    const deadline = monotonicNow() + CODEPAY_LOOKUP_BUDGET_MS;
    let noChargeHits = 0;
    let lastNoChargeAt = 0;
    let sawPending = false;

    for (;;) {
      const r = await this._lookupOnce(lookup, params.referenceId, trail);
      if (r.status === "unconfigured") return null;
      if (r.status === "unavailable" && !afterWatchdog) return null;

      if (r.status === "approved") {
        if (cloudMatchesSale(r, params)) {
          return this._successFromCloud(r, params.referenceId);
        }
        return {
          success: false,
          indeterminate: true,
          indeterminateCause: "cloud_mismatch",
          error: "CodePay reports an approval that doesn't match this sale.",
          merchantOrderNo: params.referenceId,
          transNo: r.trans_no,
        };
      }

      if (r.status === "failed" || r.status === "not_found") {
        const now = monotonicNow();
        if (noChargeHits === 0 || now - lastNoChargeAt >= CODEPAY_LOOKUP_RETRY_MS) {
          noChargeHits += 1;
          lastNoChargeAt = now;
        }
        if (noChargeHits >= needed) {
          return {
            success: false,
            expired: true,
            noChargeConfirmed: true,
            error: "Payment wasn't completed — no charge.",
            errorCode: r.code,
            merchantOrderNo: params.referenceId,
          };
        }
      }
      if (r.status === "pending") sawPending = true;

      if (monotonicNow() + CODEPAY_LOOKUP_RETRY_MS > deadline) break;
      await sleep(CODEPAY_LOOKUP_RETRY_MS);
    }

    if (sawPending) {
      return {
        success: false,
        indeterminate: true,
        indeterminateCause: "cloud_pending",
        error: "CodePay still reports this payment in progress.",
        merchantOrderNo: params.referenceId,
      };
    }
    return null;
  }

  /** A success result built from a host-confirmed approval. */
  private _successFromCloud(r: CodePayCloudLookup, referenceId: string): CodePayTxnResult {
    const biz: CodePayBizResult = {
      trans_no: r.trans_no,
      merchant_order_no: referenceId,
      trans_type: r.trans_type,
      trans_status: r.trans_status,
      order_amount: r.order_amount,
      tip_amount: r.tip_amount,
      trans_amount: r.trans_amount,
      paid_amount: r.paid_amount,
      auth_code: r.auth_no,
      card_no: r.card_no,
      ref_no: r.ref_no,
      entry_mode: r.entry_mode,
      pay_method_id: r.pay_method_id,
      terminal_sn: r.terminal_sn,
      trans_end_time: r.trans_time,
      merchant_no: r.merchant_no,
      recovered_via: "cloud_lookup",
    };
    const terminalResponse = buildCodePayTerminalResponse(
      biz,
      this._config?.terminalId,
      this._config?.terminalSn,
    );
    terminalResponse.recovered_via = "cloud_lookup";
    (terminalResponse.codepay_transaction as Record<string, unknown>).recoveredVia =
      "cloud_lookup";
    return {
      success: true,
      raw: biz,
      terminalResponse,
      transNo: r.trans_no,
      merchantOrderNo: referenceId,
      rrn: r.ref_no,
      recoveredVia: "cloud_lookup",
    };
  }

  /**
   * Look up an indeterminate sale by merchant_order_no. Returns a success result
   * ONLY when Register confirms a completed sale for this exact order; anything
   * else (lookup failed, not found, other status) returns null so the caller
   * keeps the indeterminate hold — we never infer "no charge" from a lookup.
   */
  private async _recoverSale(
    referenceId: string,
    amount: number,
  ): Promise<CodePayTxnResult | null> {
    try {
      const q = await this.query({ merchantOrderNo: referenceId });
      const raw = q.raw;
      if (!q.success || !raw) return null;
      if (Number(raw.trans_status) !== CODEPAY_TRANS_STATUS.COMPLETED) return null;
      if (raw.merchant_order_no != null && raw.merchant_order_no !== referenceId) {
        return null;
      }
      if (raw.trans_type != null && String(raw.trans_type) !== CODEPAY_TRANS_TYPE.SALE) {
        return null;
      }
      if (raw.order_amount != null && fmtAmount(Number(raw.order_amount)) !== fmtAmount(amount)) {
        return null;
      }
      console.log("[CodePayService] indeterminate sale recovered via query", {
        referenceId,
        transNo: q.transNo,
      });
      return { ...q, merchantOrderNo: referenceId };
    } catch (e) {
      console.warn("[CodePayService] sale recovery query failed:", e);
      return null;
    }
  }

  private async _runSale(params: CodePaySaleParams): Promise<CodePayTxnResult> {
    const cfg = this.requireConfig();
    const expiresSec = params.expiresSec ?? CODEPAY_DEFAULT_EXPIRES_SEC;
    // A caller-chosen window gets its own watchdog (expiry + margin) so
    // Register's own expiry always returns first; otherwise keep the config's.
    let timeoutMs =
      params.expiresSec != null ? codepaySaleTimeoutMs(expiresSec) : cfg.timeout;
    // DEV-only: force an early watchdog to exercise the unknown-result path on
    // a real terminal. Never honoured in release builds.
    if (__DEV__) {
      const debugMs = Number(process.env.EXPO_PUBLIC_CODEPAY_DEBUG_WATCHDOG_MS);
      if (Number.isFinite(debugMs) && debugMs > 0) timeoutMs = debugMs;
    }
    return this._mutex.runExclusive(async () => {
      const biz: Record<string, unknown> = {
        trans_type: CODEPAY_TRANS_TYPE.SALE,
        merchant_order_no: params.referenceId,
        order_amount: fmtAmount(params.amount),
        price_currency: CODEPAY_DEFAULT_CURRENCY,
        pay_scenario: params.payScenario ?? CODEPAY_PAY_SCENARIO.SWIPE_CARD,
        expires: expiresSec,
        on_screen_tip: params.onScreenTip ?? false,
        on_screen_signature: params.onScreenSignature ?? true,
      };
      if (params.tipAmount != null && params.tipAmount > 0) {
        biz.tip_amount = fmtAmount(params.tipAmount);
      }
      if (params.receiptPrintMode != null) {
        biz.receipt_print_mode = params.receiptPrintMode;
      }
      await this._awaitForegroundIfOrphaned();
      const startedAt = monotonicNow();
      const res = await this._dispatch(
        CODEPAY_TOPIC.ORDER,
        biz,
        timeoutMs,
        "sale",
      );
      return this._interpret(res, "sale", params.referenceId, {
        expiresSec: params.expiresSec,
        elapsedMs: Math.round(monotonicNow() - startedAt),
      });
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
      await this._awaitForegroundIfOrphaned();
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

  /**
   * After a watchdog timeout, hold the next Intent until Dexa is foregrounded
   * (i.e. the orphaned Register activity has closed). No-op otherwise.
   */
  private async _awaitForegroundIfOrphaned(): Promise<void> {
    if (!this._awaitingForeground) return;
    await waitForAppActive();
    this._awaitingForeground = false;
  }

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
    timing?: SaleTiming,
  ): CodePayTxnResult {
    const biz = parseCodePayBiz(res.bizData);
    const transNo =
      typeof biz.trans_no === "string" ? biz.trans_no : undefined;
    const elapsedMs = timing?.elapsedMs;
    const resultCode = res.resultCode;

    // Native watchdog elapsed — no result came back. The card MAY have been
    // charged; the caller must reconcile via query(), never blind re-charge.
    // Register may still be on screen, so the next Intent waits for foreground.
    if (res.timedOut) {
      this._awaitingForeground = true;
      return {
        success: false,
        indeterminate: true,
        indeterminateCause: "watchdog",
        error: res.responseMsg ?? `No response from CodePay (${op})`,
        merchantOrderNo: referenceId,
        transNo,
        elapsedMs,
        resultCode,
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
      resultCode,
      responseCode,
      responseMsg,
      transNo,
      transStatus: biz.trans_status,
      canceled: res.canceled,
      elapsedMs,
    });

    // An approval wins over everything else — including RESULT_CANCELED (e.g.
    // Back pressed on Register's result screen after the host approved).
    // Checked BEFORE the cancel branch so an approved card is never voided.
    if (isCodePaySuccess(responseCode)) {
      return {
        success: true,
        raw: biz,
        terminalResponse: buildCodePayTerminalResponse(
          biz,
          this._config?.terminalId,
          this._config?.terminalSn,
        ),
        transNo,
        merchantOrderNo:
          (typeof biz.merchant_order_no === "string"
            ? biz.merchant_order_no
            : undefined) ?? referenceId,
        rrn: typeof biz.ref_no === "string" ? biz.ref_no : undefined,
        elapsedMs,
        resultCode,
      };
    }

    // The caller's window ran out with no card read: the customer didn't
    // finish in time. Only when the caller asked for a window, only at the
    // deadline, and only with no sign of a card read — a real decline or
    // cancel earlier in the window keeps its normal meaning.
    if (
      timing?.expiresSec != null &&
      timing.elapsedMs >= timing.expiresSec * 1000 - CODEPAY_EXPIRY_GRACE_MS &&
      (res.canceled || res.bizData != null || responseCode != null) &&
      isNoCardRead(biz)
    ) {
      return {
        success: false,
        expired: true,
        error: responseMsg ?? "Payment window expired — no charge.",
        errorCode: responseCode ?? undefined,
        merchantOrderNo: referenceId,
        elapsedMs,
        resultCode,
      };
    }

    // Cardholder backed out on the terminal — no card read, no charge.
    if (res.canceled) {
      return {
        success: false,
        aborted: true,
        error: responseMsg ?? "Cancelled on terminal — no charge.",
        merchantOrderNo: referenceId,
        elapsedMs,
        resultCode,
      };
    }

    // We got an activity result but couldn't read a verdict (no response_code
    // and no biz payload) — treat as indeterminate rather than a clean decline.
    if (responseCode == null && !res.bizData) {
      return {
        success: false,
        indeterminate: true,
        indeterminateCause: "unreadable",
        error: `Unreadable CodePay result (${op})`,
        merchantOrderNo: referenceId,
        transNo,
        elapsedMs,
        resultCode,
      };
    }

    return {
      success: false,
      raw: biz,
      terminalResponse: buildCodePayTerminalResponse(
        biz,
        this._config?.terminalId,
        this._config?.terminalSn,
      ),
      transNo,
      merchantOrderNo: referenceId,
      error:
        responseMsg ?? `${op} declined (code ${responseCode ?? "?"})`,
      errorCode: responseCode ?? undefined,
      elapsedMs,
      resultCode,
    };
  }
}

let _shared: CodePayService | null = null;
export function getSharedCodePayService(): CodePayService {
  if (!_shared) _shared = new CodePayService();
  return _shared;
}
