// ============================================================
// ATOM Service — on-device REST terminal command layer
// File: services/terminals/atom-service.ts
// ============================================================
// Singleton that talks to the on-device LandiGlobal ATOM payment app over
// loopback HTTPS. Unlike Valor/Castles (raw TCP sockets with a stateful
// handshake), ATOM is a plain REST API — one request, one response — so there
// is no framing, STAN, or trailing-ACK machinery. We keep a mutex to serialize
// commands: ATOM foregrounds itself for the card read, so overlapping sales are
// nonsensical.
//
// v1 surface: ping, status, processSale (authorize + capture in one step).
// Refund / void / cancel / tipAdjust / lookupPayment / batch are v2 stubs.
// ============================================================

import { Mutex } from "async-mutex";
import {
  ATOM_API_BASE,
  ATOM_DEFAULT_CURRENCY,
  ATOM_PING_TIMEOUT_MS,
  ATOM_STATUS_TIMEOUT_MS,
  type AtomConnectionConfig,
  type AtomAuthorizationRequest,
  type AtomDeviceStatusResponse,
  type AtomErrorResponse,
  type AtomPaymentResponse,
  type AtomPingResponse,
  type AtomSaleParams,
  type AtomTipAdjustParams,
  type AtomRefundParams,
  type AtomCancelParams,
  type AtomTxnResult,
} from "@/types/atom";
import {
  atomBaseUrl,
  atomFetch,
  atomTransportReady,
} from "./atom-transport";
import {
  buildAtomTerminalResponse,
  parseAtomCategory,
} from "./atom-response-mapper";

export class AtomService {
  private _config: AtomConnectionConfig | null = null;
  private readonly _mutex = new Mutex();

  /** True when the native loopback transport is present on this build. */
  static isAvailable(): boolean {
    return atomTransportReady();
  }

  configure(config: AtomConnectionConfig): void {
    this._config = config;
  }

  isConfigured(): boolean {
    return !!this._config;
  }

  private base(hostOverride?: string, portOverride?: number): string {
    const host = hostOverride ?? this._config?.host;
    const port = portOverride ?? this._config?.port;
    if (!host || !port) {
      throw new Error("AtomService not configured (missing host/port)");
    }
    return atomBaseUrl(host, port);
  }

  // ── Health ──

  /**
   * GET /ping — cheap reachability probe. Returns true on any 2xx.
   * Accepts an explicit host/port so the loopback detector can probe candidate
   * ports before a config is set.
   */
  async ping(host?: string, port?: number): Promise<boolean> {
    if (!atomTransportReady()) return false;
    try {
      const res = await atomFetch<AtomPingResponse>(this.base(host, port), {
        method: "GET",
        path: `${ATOM_API_BASE}/ping`,
        timeoutMs: ATOM_PING_TIMEOUT_MS,
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  /** GET /status — richer health (deviceReady / gatewayOnline / currentBatch). */
  async status(host?: string, port?: number): Promise<AtomDeviceStatusResponse | null> {
    if (!atomTransportReady()) return null;
    const res = await atomFetch<AtomDeviceStatusResponse>(this.base(host, port), {
      method: "GET",
      path: `${ATOM_API_BASE}/status`,
      timeoutMs: ATOM_STATUS_TIMEOUT_MS,
    });
    return res.ok ? (res.data ?? null) : null;
  }

  // ── Sale ──

  /**
   * POST /authorize with completeThisAuthorization:true — Sale (auth + capture
   * in one step). Amounts are DOLLARS (not cents).
   *
   * Tip: pass EITHER `tipPrompt` (Flow A — the terminal collects the tip on its
   * own screen before the card read and returns it in paymentResults.tipAmount)
   * OR `tipAmount` (Flow B — pre-known tip baked into the auth). They are
   * mutually exclusive; tipPrompt wins if both are somehow supplied.
   */
  async processSale(params: AtomSaleParams): Promise<AtomTxnResult> {
    if (!this._config) {
      return { success: false, error: "AtomService not configured" };
    }
    return this._mutex.runExclusive(async () => {
      const tipFields = params.tipPrompt
        ? { tipPrompt: params.tipPrompt }
        : params.tipAmount != null && params.tipAmount > 0
          ? { tipAmount: params.tipAmount }
          : {};
      const body: AtomAuthorizationRequest = {
        posReferenceNumber: params.referenceId,
        totalAmountToAuthorize: params.amount,
        currency: ATOM_DEFAULT_CURRENCY,
        completeThisAuthorization: true,
        ...tipFields,
        ...(params.posData ? { posData: params.posData } : {}),
      };

      const res = await atomFetch<AtomPaymentResponse | AtomErrorResponse>(
        this.base(),
        {
          method: "POST",
          path: `${ATOM_API_BASE}/authorize`,
          body,
          timeoutMs: this._config!.timeout,
        },
      );

      // No response was received — the charge MAY have landed. Indeterminate.
      if (res.status === 0) {
        return {
          success: false,
          indeterminate: true,
          error: res.error ?? "No response from ATOM",
        };
      }

      // HTTP error (400 validation / 500 device) — a clean failure, not a charge.
      if (!res.ok) {
        const err = res.data as AtomErrorResponse | undefined;
        // Inline tip-prompt cancel (DEV008) / timeout (DEV009): the cardholder
        // aborted at the tip screen — NO card read, NO charge. Retryable abort.
        const aborted =
          err?.errorCode === "DEV008" || err?.errorCode === "DEV009";
        return {
          success: false,
          aborted,
          error: aborted
            ? err?.errorCode === "DEV009"
              ? "Tip prompt timed out — no charge. Try again."
              : "Payment cancelled at the tip screen — no charge."
            : (err?.error ?? `ATOM HTTP ${res.status}`),
          errorCode: err?.errorCode,
        };
      }

      const pr = res.data as AtomPaymentResponse;
      const { success } = parseAtomCategory(pr.paymentResults?.responseCategory);
      const terminalResponse = buildAtomTerminalResponse(
        pr,
        this._config?.terminalId,
      );

      if (success) {
        return {
          success: true,
          raw: pr,
          terminalResponse,
          paymentId: pr.paymentId,
          rrn: pr.paymentResults?.processorReferenceNumber,
        };
      }

      return {
        success: false,
        raw: pr,
        terminalResponse,
        paymentId: pr.paymentId,
        error:
          pr.paymentResults?.responseMessage ??
          pr.paymentResults?.responseCategory ??
          "Declined",
      };
    });
  }

  // ── Tip adjust ──

  /**
   * POST /tipAdjust — set/adjust the tip on a prior payment (by paymentId) AND
   * capture it. Amounts are DOLLARS. Returns the updated PaymentResponse mapped
   * into a terminalResponse blob.
   */
  async tipAdjust(params: AtomTipAdjustParams): Promise<AtomTxnResult> {
    if (!this._config) {
      return { success: false, error: "AtomService not configured" };
    }
    return this._mutex.runExclusive(async () => {
      const body = {
        paymentId: params.paymentId,
        posReferenceNumber: params.referenceId,
        tipAmount: params.tipAmount,
        newFinalTotalAmount: params.newFinalTotalAmount,
      };
      const res = await atomFetch<AtomPaymentResponse | AtomErrorResponse>(
        this.base(),
        {
          method: "POST",
          path: `${ATOM_API_BASE}/tipAdjust`,
          body,
          timeoutMs: this._config!.timeout,
        },
      );
      return this._interpretMutation(res, "tipAdjust");
    });
  }

  // ── Refund / void ──

  /**
   * POST /refund — linked refund of a prior payment by paymentId. Omit `amount`
   * for a full refund (ATOM auto-voids if the batch is open — cheapest path).
   * Amounts are DOLLARS.
   */
  async refund(params: AtomRefundParams): Promise<AtomTxnResult> {
    if (!this._config) {
      return { success: false, error: "AtomService not configured" };
    }
    return this._mutex.runExclusive(async () => {
      const body: Record<string, unknown> = {
        paymentId: params.paymentId,
        posReferenceNumber: params.referenceId,
      };
      if (params.amount != null) body.amount = params.amount;
      const res = await atomFetch<AtomPaymentResponse | AtomErrorResponse>(
        this.base(),
        {
          method: "POST",
          path: `${ATOM_API_BASE}/refund`,
          body,
          timeoutMs: this._config!.timeout,
        },
      );
      return this._interpretMutation(res, "refund");
    });
  }

  /**
   * POST /cancel — FULL reversal of a prior payment by paymentId. ATOM auto-routes
   * by the original txn's state: COMPLETED (captured) → Return, APPROVED (auth-only)
   * → Void. Prefer this over /refund with an omitted amount, which ATOM rejects
   * (NOT_ALLOWED) on a captured sale. Amount is implicit (full).
   */
  async cancel(params: AtomCancelParams): Promise<AtomTxnResult> {
    if (!this._config) {
      return { success: false, error: "AtomService not configured" };
    }
    return this._mutex.runExclusive(async () => {
      const body = {
        paymentId: params.paymentId,
        posReferenceNumber: params.referenceId,
      };
      const res = await atomFetch<AtomPaymentResponse | AtomErrorResponse>(
        this.base(),
        {
          method: "POST",
          path: `${ATOM_API_BASE}/cancel`,
          body,
          timeoutMs: this._config!.timeout,
        },
      );
      return this._interpretMutation(res, "cancel");
    });
  }

  /** Shared interpreter for tipAdjust/refund/cancel PaymentResponse outcomes. */
  private _interpretMutation(
    res: {
      ok: boolean;
      status: number;
      data?: AtomPaymentResponse | AtomErrorResponse;
      error?: string;
    },
    op: string,
  ): AtomTxnResult {
    if (res.status === 0) {
      return {
        success: false,
        indeterminate: true,
        error: res.error ?? `No response from ATOM (${op})`,
      };
    }
    if (!res.ok) {
      const err = res.data as AtomErrorResponse | undefined;
      return {
        success: false,
        error: err?.error ?? `ATOM HTTP ${res.status} (${op})`,
        errorCode: err?.errorCode,
      };
    }
    const pr = res.data as AtomPaymentResponse;
    const { success } = parseAtomCategory(pr.paymentResults?.responseCategory);
    // Diagnostic: surface ATOM's exact verdict for reversals (tipAdjust/refund),
    // which have been returning DECLINED/NOT_ALLOWED on captured sales.
    console.log(`[AtomService] ${op} result`, {
      status: res.status,
      responseCategory: pr.paymentResults?.responseCategory,
      responseMessage: pr.paymentResults?.responseMessage,
      transactionStatus: pr.paymentResults?.transactionStatus,
      hostResponseCode: pr.paymentResults?.hostResponseCode,
      paymentId: pr.paymentId,
    });
    const terminalResponse = buildAtomTerminalResponse(
      pr,
      this._config?.terminalId,
    );
    return {
      success,
      raw: pr,
      terminalResponse,
      paymentId: pr.paymentId,
      rrn: pr.paymentResults?.processorReferenceNumber,
      error: success
        ? undefined
        : (pr.paymentResults?.responseMessage ??
          pr.paymentResults?.responseCategory ??
          `${op} failed`),
    };
  }

  // ── v2 seams (not implemented) ──

  async lookupPayment(_paymentId: string): Promise<never> {
    throw new Error("AtomService.lookupPayment not implemented (v2)");
  }
}

let _shared: AtomService | null = null;
export function getSharedAtomService(): AtomService {
  if (!_shared) _shared = new AtomService();
  return _shared;
}
