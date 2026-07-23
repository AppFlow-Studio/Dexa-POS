// ============================================================
// Valor Service — semi-integrated terminal command layer
// File: services/terminals/valor-service.ts
// ============================================================
// Singleton that owns the socket to a Valor terminal and speaks the framed
// request/response protocol. Mirrors CastlesService's lifecycle machinery
// (async-mutex command serialization, suspend/resume, connect/disconnect) but
// replaces the message layer with Valor's:
//
//   write <STX>body<ETX>
//     S1  ACK                         {"STATE":"0","MSG":"ACK"}
//     S2  Payload Request Received    {...,"STAN_NO":..,"MSG":"Payload Request Received"}
//     S3  final response              {"STATE":"0"|"-1"|"-2", ...}
//     S4  POS writes a trailing ACK
//
// STAN_NO is captured at S2 (before the card is presented) so a socket death
// after S2 can be recovered authoritatively via TRAN_MODE 90 (transactionStatus).
// Cancel-before-card is sent on a SECOND short-lived socket (port 5001).
// ============================================================

import { Mutex, withTimeout } from "async-mutex";
import type { ITerminalTransport } from "./valor-transport.types";
import { createValorTransport } from "./valor-transport-factory";
import {
  ValorFrameReader,
  classifyValorFrame,
  encodeValorFrame,
  centsToValorAmount,
  valorAmountToCents,
} from "./valor-framing";
import { buildValorTerminalResponse, parseValorState } from "./valor-response-mapper";
import {
  VALOR_TRAN_MODE,
  VALOR_TRAN_CODE,
  VALOR_DEFAULT_PORT,
  VALOR_CANCEL_PORT,
  VALOR_SUCCESS_STATE,
  VALOR_CLEARED_STATE,
  VALOR_ACK_TIMEOUT_MS,
  VALOR_SALE_TIMEOUT_MS,
  VALOR_TERMINAL_QUERY_TIMEOUT_MS,
  VALOR_CANCEL_TIMEOUT_MS,
  VALOR_STATUS_TIMEOUT_MS,
  VALOR_CONNECT_TIMEOUT_MS,
  type ValorConnectionConfig,
  type ValorRawResponse,
  type ValorRequestBody,
  type ValorSaleParams,
  type ValorSaleResult,
  type ValorTerminalQueryResult,
  type ValorRecoveryResult,
  type ValorCancelResult,
  type ValorTxnResult,
  type ValorRefundParams,
  type ValorVoidParams,
  type ValorTipAdjustParams,
} from "@/types/valor";

const VALOR_MUTEX_ACQUIRE_TIMEOUT_MS = 60_000;

/** Phase of the handshake at which a command failed — drives recovery decisions. */
export type ValorCommandPhase = "connect" | "ack" | "payload" | "final";

export class ValorCommandError extends Error {
  readonly phase: ValorCommandPhase;
  /** STAN captured at S2 before the failure (null if the failure was pre-S2). */
  readonly stan: string | null;
  constructor(message: string, phase: ValorCommandPhase, stan: string | null) {
    super(message);
    this.name = "ValorCommandError";
    this.phase = phase;
    this.stan = stan;
  }
}

interface SendOpts {
  finalTimeout: number;
  /** Enforce an ACK within VALOR_ACK_TIMEOUT_MS (transaction commands). Default true. */
  requireAck?: boolean;
  /** Discard final frames whose MER_TXN_ID/REQ_TXN_ID mismatch. Default true. */
  correlate?: boolean;
  /** Write a trailing ACK back to the terminal after the final frame. */
  sendTrailingAck?: boolean;
  /** Called with the STAN captured at S2 (before card presentation). */
  onStan?: (stan: string) => void;
  /**
   * Resolve on the ACK itself instead of waiting for a "final" frame. Real VP
   * terminals answer the TRAN_MODE 96 health/test ping with ONLY an ACK
   * ({"STATE":"0","MSG":"ACK"}) and no follow-up data frame, so the query would
   * otherwise wait for a final that never arrives and time out. Used only by
   * terminalQuery — transaction commands still require the real final frame.
   */
  resolveOnAck?: boolean;
}

export class ValorService {
  private _transport: ITerminalTransport | null = null;
  private _config: ValorConnectionConfig | null = null;
  private readonly _mutex = new Mutex();
  private _suspended = false;

  // ── Lifecycle ──

  isConnected(): boolean {
    return !!this._transport?.isOpen && !this._suspended;
  }

  isSuspended(): boolean {
    return this._suspended;
  }

  async connect(config: ValorConnectionConfig): Promise<void> {
    this._config = config;
    this._suspended = false;
    await this._runExclusive(() => this._connectInner(config));
  }

  disconnect(): void {
    const t = this._transport;
    this._transport = null;
    if (t) {
      try { t.removeAllListeners(); } catch { /* ignore */ }
      try { t.disconnect(); } catch { /* ignore */ }
    }
  }

  /** AppState-background teardown — force-close the socket, keep config for resume(). */
  async suspend(): Promise<void> {
    this._suspended = true;
    this.disconnect();
  }

  /** Clear the suspended flag; the next command lazily reconnects. */
  resume(config?: ValorConnectionConfig): void {
    if (config) this._config = config;
    this._suspended = false;
  }

  private async _connectInner(config: ValorConnectionConfig): Promise<void> {
    const host = config.host;
    const port = config.port ?? VALOR_DEFAULT_PORT;

    // Reuse an already-open socket to the same endpoint.
    if (this._transport?.isOpen && this._sameEndpoint(config)) return;

    if (this._transport) {
      try { this._transport.removeAllListeners(); } catch { /* ignore */ }
      try { this._transport.disconnect(); } catch { /* ignore */ }
      this._transport = null;
    }

    const transport = createValorTransport({
      connectionType: config.connectionType ?? "local_socket",
      host,
      port,
      cancelPort: config.cancelPort ?? VALOR_CANCEL_PORT,
      connectTimeoutMs: VALOR_CONNECT_TIMEOUT_MS,
    });
    await transport.connect();
    this._transport = transport;
  }

  private _sameEndpoint(config: ValorConnectionConfig): boolean {
    if (!this._config) return false;
    if ((config.connectionType ?? "local_socket") === "usb") return true;
    return (
      this._config.host === config.host &&
      (this._config.port ?? VALOR_DEFAULT_PORT) === (config.port ?? VALOR_DEFAULT_PORT)
    );
  }

  private async _ensureConnectedInner(): Promise<void> {
    if (this._transport?.isOpen) return;
    if (!this._config) throw new ValorCommandError("Not configured", "connect", null);
    await this._connectInner(this._config);
  }

  private _runExclusive<T>(fn: () => Promise<T>): Promise<T> {
    return withTimeout(this._mutex, VALOR_MUTEX_ACQUIRE_TIMEOUT_MS).runExclusive(fn);
  }

  // ── Transaction commands ──

  async processSale(params: ValorSaleParams): Promise<ValorSaleResult> {
    const body: ValorRequestBody = {
      TRAN_MODE: VALOR_TRAN_MODE.CREDIT,
      TRAN_CODE: VALOR_TRAN_CODE.SALE,
      AMOUNT: centsToValorAmount(params.amount),
      REQ_TXN_ID: params.referenceId,
      TIP_ENTRY: params.tipEntry ? "1" : "0",
      SIGNATURE: params.signature ? "1" : "0",
      MOBILE_ENTRY: "0",
      CANCEL_CONFIRMATION: "0",
      EARLY_RESPONSE: (params.earlyResponse ?? true) ? "1" : "0",
      ...(params.tipAmount ? { TIP_AMOUNT: centsToValorAmount(params.tipAmount) } : {}),
    };

    let capturedStan: string | null = null;
    try {
      const final = await this._runExclusive(async () => {
        await this._ensureConnectedInner();
        return this._sendOnTransport(this._transport!, body, {
          finalTimeout: this._config?.timeout ?? VALOR_SALE_TIMEOUT_MS,
          requireAck: true,
          correlate: true,
          sendTrailingAck: true,
          onStan: (s) => {
            capturedStan = s;
            params.onStan?.(s);
          },
        });
      });
      return this._interpretSaleFinal(final, capturedStan);
    } catch (err) {
      if (err instanceof ValorCommandError) {
        // Post-S2 failure (STAN captured) → INDETERMINATE. The terminal may have
        // charged; re-query authoritatively via TRAN_MODE 90.
        const stan = err.stan ?? capturedStan;
        if (stan) {
          const recovered = await this.transactionStatus(stan);
          if (recovered.outcome === "approved" && recovered.raw) {
            return this._interpretSaleFinal(recovered.raw, stan);
          }
          if (recovered.outcome === "declined") {
            return { success: false, stan, error: err.message, errorCode: recovered.raw?.ERROR_CODE };
          }
          // unknown — leave indeterminate for the caller's manual-reconcile path.
          return { success: false, indeterminate: true, stan, error: err.message };
        }
        // Pre-S2 failure — the request never reached card entry; safe to treat as a clean failure.
        return { success: false, error: err.message };
      }
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  private _interpretSaleFinal(final: ValorRawResponse, stan: string | null): ValorSaleResult {
    const state = String(final.STATE ?? "");
    const partial = String(final.PARTIAL ?? "0") === "1";
    const base = {
      raw: final,
      terminalResponse: buildValorTerminalResponse(final, this._config?.terminalId),
      stan: stan ?? (final.STAN_NO != null ? String(final.STAN_NO) : undefined),
      tranNo: final.TRAN_NO != null ? String(final.TRAN_NO) : undefined,
      rrn: final.RRN != null ? String(final.RRN) : undefined,
    };

    if (state === VALOR_SUCCESS_STATE) {
      if (partial) {
        return { success: true, partial: true, approvedAmount: valorAmountToCents(final.AMOUNT), ...base };
      }
      return { success: true, ...base };
    }
    if (state === VALOR_CLEARED_STATE) {
      // Final STATE "-2" — indeterminate; caller routes to manual reconcile.
      return { success: false, indeterminate: true, ...base };
    }
    return {
      success: false,
      error: final.ERROR_MSG ?? "Declined",
      errorCode: final.ERROR_CODE,
      ...base,
    };
  }

  /** Lightweight health/test ping (TRAN_MODE 96). Castles-getData analog. */
  async terminalQuery(): Promise<ValorTerminalQueryResult> {
    try {
      const final = await this._runExclusive(async () => {
        await this._ensureConnectedInner();
        return this._sendOnTransport(
          this._transport!,
          { TRAN_MODE: VALOR_TRAN_MODE.TERMINAL_QUERY },
          {
            finalTimeout: VALOR_TERMINAL_QUERY_TIMEOUT_MS,
            requireAck: false,
            correlate: false,
            // VP terminals answer 96 with only an ACK — treat that as the result.
            resolveOnAck: true,
          },
        );
      });
      if (String(final.STATE ?? "0") === VALOR_SUCCESS_STATE || final.SERIAL_NO) {
        return {
          success: true,
          data: {
            serialNumber: final.SERIAL_NO,
            epi: final.EPI,
            appVersion: final.APP_VERSION,
            dateTime: final.DATETIME,
          },
          raw: final,
        };
      }
      return { success: false, raw: final, error: final.ERROR_MSG ?? "Terminal query failed" };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  /** Alias for parity with the Castles service method name. */
  getTerminalData(): Promise<ValorTerminalQueryResult> {
    return this.terminalQuery();
  }

  /**
   * TRAN_MODE 90 status re-query — the in-flight recovery primitive. Re-queries
   * the terminal for the authoritative outcome of a transaction by its STAN.
   */
  async transactionStatus(stan: string): Promise<ValorRecoveryResult> {
    try {
      const final = await this._runExclusive(async () => {
        await this._ensureConnectedInner();
        return this._sendOnTransport(
          this._transport!,
          { TRAN_MODE: VALOR_TRAN_MODE.TRANSACTION_STATUS, STAN_NO: stan },
          { finalTimeout: VALOR_STATUS_TIMEOUT_MS, requireAck: false, correlate: false },
        );
      });
      const state = String(final.STATE ?? "");
      if (state === VALOR_SUCCESS_STATE) {
        return {
          outcome: "approved",
          raw: final,
          terminalResponse: buildValorTerminalResponse(final, this._config?.terminalId),
        };
      }
      const msg = String(final.ERROR_MSG ?? "").toLowerCase();
      if (msg.includes("not found") || msg.includes("no record") || final.ERROR_CODE) {
        return { outcome: "unknown", raw: final };
      }
      return { outcome: "declined", raw: final };
    } catch {
      // Could not reach the terminal to confirm — the caller falls back to manual reconcile.
      return { outcome: "unknown" };
    }
  }

  /**
   * Cancel-before-card on the SECOND socket (port 5001). Fire-and-DON'T-trust:
   * the authoritative outcome is always the primary socket's final frame or
   * TRAN_MODE 90 on the captured STAN. Only effective before card presentation.
   */
  async cancelInFlight(referenceId: string): Promise<ValorCancelResult> {
    const cfg = this._config;
    if (!cfg?.host) return { cleared: false, error: "No host configured" };

    const cancelPort = cfg.cancelPort ?? VALOR_CANCEL_PORT;
    const transport = createValorTransport({
      connectionType: "local_socket",
      host: cfg.host,
      port: cancelPort,
      connectTimeoutMs: VALOR_CONNECT_TIMEOUT_MS,
    });
    try {
      await transport.connect();
      const final = await this._sendOnTransport(
        transport,
        { TRAN_MODE: VALOR_TRAN_MODE.CANCEL, REQ_TXN_ID: referenceId },
        { finalTimeout: VALOR_CANCEL_TIMEOUT_MS, requireAck: false, correlate: false },
      );
      const msg = String(final.ERROR_MSG ?? "").toUpperCase();
      const cleared = msg.includes("CLEARED SUCCESSFULLY") || String(final.STATE ?? "") === "-2";
      return { cleared, raw: final };
    } catch (err) {
      return { cleared: false, error: err instanceof Error ? err.message : String(err) };
    } finally {
      try { transport.disconnect(); } catch { /* ignore */ }
    }
  }

  // ── Reversals / adjustments ──

  /** Card-present credit refund (TRAN_MODE 1 / TRAN_CODE 5). */
  async processRefund(params: ValorRefundParams): Promise<ValorTxnResult> {
    return this._runTxnCommand(
      {
        TRAN_MODE: VALOR_TRAN_MODE.CREDIT,
        TRAN_CODE: VALOR_TRAN_CODE.REFUND,
        AMOUNT: centsToValorAmount(params.amount),
        REQ_TXN_ID: params.referenceId,
        MOBILE_ENTRY: "0",
        PAPER_RECEIPT: "0",
      },
      "refund",
    );
  }

  /**
   * Void a prior transaction. References the original by TRAN_NO (the
   * charge-slip "Trans" number) or CARD_NO (last-4) — NOT rrn/stan.
   */
  async processVoid(params: ValorVoidParams): Promise<ValorTxnResult> {
    if (!params.tranNo && !params.cardNo) {
      return { success: false, error: "Void requires TRAN_NO or CARD_NO" };
    }
    return this._runTxnCommand(
      {
        TRAN_MODE: VALOR_TRAN_MODE.FETCH,
        TRAN_CODE: VALOR_TRAN_CODE.VOID,
        REQ_TXN_ID: params.referenceId,
        ...(params.tranNo ? { TRAN_NO: params.tranNo } : { CARD_NO: params.cardNo }),
        VOID_CONFIRMATION: params.voidConfirmation ? "1" : "0",
        MOBILE_ENTRY: "0",
        PAPER_RECEIPT: "0",
      },
      "void",
    );
  }

  /**
   * Adjust the tip on a prior transaction. References by TRAN_NO or CARD_NO.
   */
  async tipAdjust(params: ValorTipAdjustParams): Promise<ValorTxnResult> {
    if (!params.tranNo && !params.cardNo) {
      return { success: false, error: "Tip adjust requires TRAN_NO or CARD_NO" };
    }
    return this._runTxnCommand(
      {
        TRAN_MODE: VALOR_TRAN_MODE.FETCH,
        TRAN_CODE: VALOR_TRAN_CODE.TIP_ADJUSTMENT,
        TIP_AMOUNT: centsToValorAmount(params.tipAmount),
        REQ_TXN_ID: params.referenceId,
        ...(params.tranNo ? { TRAN_NO: params.tranNo } : { CARD_NO: params.cardNo }),
        TIP_CONFIRMATION: "0",
        WARNING_CONFIRM: "0",
        PAPER_RECEIPT: "0",
      },
      "tipAdjust",
    );
  }

  /** Shared runner for reversal/adjustment commands (non-sale). */
  private async _runTxnCommand(
    body: ValorRequestBody,
    label: string,
  ): Promise<ValorTxnResult> {
    try {
      const final = await this._runExclusive(async () => {
        await this._ensureConnectedInner();
        return this._sendOnTransport(this._transport!, body, {
          finalTimeout: this._config?.timeout ?? VALOR_SALE_TIMEOUT_MS,
          requireAck: true,
          correlate: true,
          sendTrailingAck: true,
        });
      });
      const { success, indeterminate } = parseValorState(final.STATE);
      const base = {
        raw: final,
        terminalResponse: buildValorTerminalResponse(final, this._config?.terminalId),
        tranNo: final.TRAN_NO != null ? String(final.TRAN_NO) : undefined,
        rrn: final.RRN != null ? String(final.RRN) : undefined,
        stan: final.STAN_NO != null ? String(final.STAN_NO) : undefined,
      };
      if (success) return { success: true, ...base };
      if (indeterminate) return { success: false, indeterminate: true, ...base };
      return {
        success: false,
        error: final.ERROR_MSG ?? `${label} failed`,
        errorCode: final.ERROR_CODE,
        ...base,
      };
    } catch (err) {
      if (err instanceof ValorCommandError) {
        return {
          success: false,
          indeterminate: !!err.stan,
          stan: err.stan ?? undefined,
          error: err.message,
        };
      }
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  // ── Core send / handshake state machine ──

  /**
   * Write a framed request on `transport` and drive the ACK → Payload-Received →
   * final handshake. Resolves with the final response frame; throws a
   * ValorCommandError (carrying phase + captured STAN) on any failure.
   */
  private _sendOnTransport(
    transport: ITerminalTransport,
    body: ValorRequestBody,
    opts: SendOpts,
  ): Promise<ValorRawResponse> {
    if (!transport.isOpen) {
      return Promise.reject(new ValorCommandError("Transport is not open", "connect", null));
    }
    const referenceId = String(body.REQ_TXN_ID ?? "");
    const requireAck = opts.requireAck ?? true;
    const correlate = opts.correlate ?? true;
    const reader = new ValorFrameReader();

    // Framing is transport-specific:
    //  - TCP: BARE JSON. The VP terminal ignores STX/ETX-framed TCP requests
    //    (ACK'd but the txn never starts) — verified on-device.
    //  - USB CDC serial: LITERAL text markers "<STX> " + JSON + " <ETX>", matching
    //    Valor's USB semi-integration sample code VERBATIM. The samples write the
    //    5-char ASCII text "<STX>"/"<ETX>" (with surrounding spaces) via
    //    `ser.write(payload.encode())` / `port.write(...)` — NOT the 0x02/0x03
    //    control bytes. Sending raw control bytes reproduces the same failure as
    //    STX/ETX-framed TCP: the terminal boundary-detects enough to ACK but its
    //    dispatcher can't parse the payload, so it never prompts for card
    //    ("always ACK, never processed"). The terminal must ALSO be in "USB
    //    Listening mode" (Parameter Download → USB Listening screen, or Start USB)
    //    and run app 3.0.44+/1.0.36RT+ or it won't answer any command.
    // Responses are read identically either way (ValorFrameReader scans by
    // brace-depth and ignores anything — control bytes or literal text — outside
    // the JSON object).
    const isUsb = this._config?.connectionType === "usb";
    const toWire = (b: ValorRequestBody): string =>
      isUsb ? `<STX> ${encodeValorFrame(b)} <ETX>` : encodeValorFrame(b);

    return new Promise<ValorRawResponse>((resolve, reject) => {
      let stan: string | null = null;
      let sawAck = false;
      let settled = false;
      const timers: ReturnType<typeof setTimeout>[] = [];

      const cleanup = () => {
        for (const t of timers) clearTimeout(t);
        transport.offData(onData);
        transport.offClose(onClose);
        transport.offError(onError);
      };
      const done = (fn: () => void) => {
        if (settled) return;
        settled = true;
        cleanup();
        fn();
      };

      if (requireAck) {
        timers.push(
          setTimeout(() => {
            if (!sawAck) {
              done(() => reject(new ValorCommandError("No ACK from terminal", "ack", null)));
            }
          }, VALOR_ACK_TIMEOUT_MS),
        );
      }
      timers.push(
        setTimeout(() => {
          done(() =>
            reject(
              new ValorCommandError(
                "Timed out waiting for final response",
                stan ? "final" : sawAck ? "payload" : "ack",
                stan,
              ),
            ),
          );
        }, opts.finalTimeout),
      );

      const onData = (chunk: string) => {
        // TEMP DIAGNOSTIC (Valor USB bring-up): log raw bytes received.
        try {
          console.log(
            `[ValorService] RAW RX (${chunk.length}B): ` +
              chunk.replace(/\x02/g, "<STX>").replace(/\x03/g, "<ETX>"),
          );
        } catch { /* best-effort */ }
        for (const frame of reader.push(chunk)) {
          const kind = classifyValorFrame(frame);
          if (kind === "ack") {
            sawAck = true;
            // For the health/test ping the ACK is the whole response — the
            // terminal sends no final frame — so resolve on it directly.
            if (opts.resolveOnAck) {
              done(() => resolve(frame));
              return;
            }
            continue;
          }
          if (kind === "payload_received") {
            sawAck = true;
            const s = frame.STAN_NO != null ? String(frame.STAN_NO) : null;
            if (s) {
              stan = s;
              opts.onStan?.(s);
            } else {
              console.warn("[ValorService] Payload-Received frame missing STAN_NO — recovery degraded");
            }
            continue;
          }
          // final / status frame
          if (correlate && referenceId) {
            const echoed = String(frame.MER_TXN_ID ?? frame.REQ_TXN_ID ?? "");
            if (echoed && echoed !== referenceId) {
              console.warn(
                `[ValorService] Discarding stale frame (MER_TXN_ID=${echoed} != ${referenceId})`,
              );
              continue;
            }
          }
          const captured = stan;
          if (opts.sendTrailingAck) {
            transport
              .write(toWire({ STATE: "0", MSG: "ACK" }))
              .catch(() => { /* best-effort trailing ACK */ });
          }
          done(() => resolve(frame));
          return;
        }
      };
      const onClose = () => {
        done(() =>
          reject(
            new ValorCommandError(
              "Socket closed before final response",
              stan ? "final" : sawAck ? "payload" : "ack",
              stan,
            ),
          ),
        );
      };
      const onError = (err: Error) => {
        done(() => reject(new ValorCommandError(err.message, stan ? "final" : "ack", stan)));
      };

      transport.onData(onData);
      transport.onClose(onClose);
      transport.onError(onError);

      // TEMP DIAGNOSTIC (Valor USB bring-up): log exactly what goes on the wire.
      const _wire = toWire(body);
      try {
        console.log(
          `[ValorService] RAW TX (${_wire.length}B): ` +
            _wire.replace(/\x02/g, "<STX>").replace(/\x03/g, "<ETX>"),
        );
      } catch { /* best-effort */ }
      transport.write(_wire).catch((err: Error) => {
        done(() => reject(new ValorCommandError(`Write failed: ${err.message}`, "connect", null)));
      });
    });
  }
}

// ============================================================
// Singleton
// ============================================================

let _shared: ValorService | null = null;

export function getSharedValorService(): ValorService {
  if (!_shared) _shared = new ValorService();
  return _shared;
}
