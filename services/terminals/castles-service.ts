// ============================================================
// Castles Payment Terminal Service
// File: services/terminals/castles-service.ts
// ============================================================
// POS is TCP client. Castles terminal is TCP server at IP:port.
// Socket kept alive between transactions (persistent connection).
// One request at a time — mutex guards concurrent calls.
// ============================================================
// Transport abstraction: CastlesService talks to ICastlesTransport,
// never raw sockets. See castles-transport.types.ts.
// ============================================================

import { updateRefundJournal } from "@/services/refundJournal";
import { useTerminalConnectionStore } from "@/stores/useTerminalConnectionStore";
import {
    CastlesEmptyResponseError,
    CastlesWedgedError,
    getCastlesConnectionSupervisor,
} from "./castlesConnectionSupervisor";
import type {
    CastlesAuthCompleteRequest,
    CastlesAuthCompleteResult,
    CastlesAuthIncrementalRequest,
    CastlesAuthIncrementalResult,
    CastlesConnectionConfig,
    CastlesGetDataRequest,
    CastlesGetDataResponse,
    CastlesGetDataResult,
    CastlesPreAuthRequest,
    CastlesPreAuthResult,
    CastlesRefundRequest,
    CastlesRefundResult,
    CastlesReturn2IdleRequest,
    CastlesSaleRequest,
    CastlesSaleResult,
    CastlesSettlementHostInfo,
    CastlesSettlementHostResult,
    CastlesSettlementRawResponse,
    CastlesSettlementRequest,
    CastlesSettlementResult,
    CastlesTipAdjustRequest,
    CastlesTipAdjustResult,
    CastlesVoidRequest,
    CastlesVoidResult,
} from "@/types/castles";
import {
    CASTLES_CONNECT_MAX_RETRIES,
    CASTLES_CONNECT_RETRY_DELAY_MS,
    CASTLES_CONNECT_TIMEOUT_MS,
    CASTLES_GET_DATA_TIMEOUT_MS,
    CASTLES_RETURN2IDLE_TIMEOUT_MS,
    CASTLES_SETTLEMENT_TIMEOUT_MS,
    CASTLES_SOCKET_TIMEOUT_MS,
    CASTLES_SUCCESS_CODE,
} from "@/types/castles";
import * as Sentry from "@sentry/react-native";
import { Mutex } from "async-mutex";
import {
    type CastlesRawResponse,
    buildCastlesTerminalResponse,
    parseCastlesReturnCode,
} from "./castles-response-mapper";
import { createCastlesTransport } from "./castles-transport-factory";
import type {
    CastlesTransportConfig,
    ICastlesTransport,
} from "./castles-transport.types";

export type CastlesStatusCallback = (notification: {
  txnStatus?: string;
  txnStatusMessage?: string;
}) => void;

/**
 * Max seconds without data before connection is considered stale.
 * Lowered from 60s → 15s so a WiFi hiccup of 5–30s triggers half-open
 * detection on the next sale instead of letting the singleton queue a
 * command onto a dead socket.
 */
const STALE_CONNECTION_THRESHOLD_S = 15;

/**
 * Connect-time getData handshake timeout. On a healthy terminal getData
 * responds in <500ms. We use a tight 3s here so the wedge signature (no
 * bytes ever come back) is detected within ~3s on the first attempt
 * instead of burning the full live-transaction socket timeout (which
 * stays at CASTLES_SOCKET_TIMEOUT_MS for actual sales).
 */
const CASTLES_HANDSHAKE_TIMEOUT_MS = 3_000;

/** Errors matching these patterns are connection-level (retriable) */
function isConnectionError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return (
    msg.includes("Transport not available") ||
    msg.includes("Transport is not open") ||
    msg.includes("Transport closed before response") ||
    msg.includes("Write failed") ||
    msg.includes("Connection timed out") ||
    msg.includes("not open")
  );
}

/**
 * Discriminated reason for probeCastlesTerminal outcomes. Lets the banner
 * render specific recovery copy instead of dumping the raw error string.
 */
export type CastlesProbeReason =
  | "online"
  | "tcp_timeout"
  | "tcp_refused"
  | "tcp_unreachable"
  | "no_ip_configured"
  | "usb_disconnected"
  | "terminal_unresponsive"
  | "possible_dhcp_drift"
  | "unknown";

export interface CastlesProbeResult {
  online: boolean;
  reason: CastlesProbeReason;
  /** Raw error message (kept for logs/Sentry) */
  error?: string;
}

/** Classify a TCP-layer connect error from its message. */
function classifyTcpError(err: unknown): CastlesProbeReason {
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
  if (msg.includes("connection timed out") || msg.includes("etimedout")) {
    return "tcp_timeout";
  }
  if (msg.includes("econnrefused") || msg.includes("refused")) {
    return "tcp_refused";
  }
  if (
    msg.includes("ehostunreach") ||
    msg.includes("enetunreach") ||
    msg.includes("no route to host") ||
    msg.includes("network is unreachable")
  ) {
    return "tcp_unreachable";
  }
  return "unknown";
}

export class CastlesService {
  private transport: ICastlesTransport | null = null;
  private config: CastlesConnectionConfig | null = null;
  private readonly _mutex = new Mutex();
  private _onStatusNotification: CastlesStatusCallback | null = null;

  // ── Connection tuning ──
  private _skipReturn2Idle = false;
  private _postConnectDelayMs = 0;

  // ── Watchdog state ──
  private _watchdogTimer: ReturnType<typeof setInterval> | null = null;
  private _watchdogConsecutiveFailures = 0;

  // ── Suspend state ──
  private _suspended = false;

  // ============================================================
  // CONNECTION
  // ============================================================

  /**
   * Connect to the Castles terminal and verify CastlesPay is responsive.
   * TCP connect may succeed before the CastlesPay app is ready (~5s startup).
   * We retry the full cycle: TCP connect → getData handshake.
   *
   * Mutex-guarded to prevent concurrent connect attempts from stomping
   * each other's transport.
   */
  async connect(config: CastlesConnectionConfig): Promise<void> {
    if (this._suspended) {
      throw new Error("CastlesService is suspended; call resume() first");
    }
    await this._mutex.runExclusive(() => this._connectInner(config));
    // Start the heartbeat watchdog for TCP connections so half-open sockets
    // are detected proactively (every 30s) instead of waiting for the next
    // sale to time out. USB doesn't suffer from half-open sockets, so we
    // skip the watchdog there to avoid unnecessary command queue traffic.
    const isTcp =
      (config.connectionType ?? "local_socket") === "local_socket";
    if (isTcp) {
      this.startWatchdog();
      // We just verified the connection (return2Idle + getData handshake in
      // _connectInner). Publish quality so the header pill clears.
      useTerminalConnectionStore.getState().setQuality("ok");
    } else {
      this.stopWatchdog();
      useTerminalConnectionStore.getState().reset();
    }
  }

  private async _connectInner(config: CastlesConnectionConfig): Promise<void> {
    // If already connected to same host:port, verify with getData
    if (
      this.transport?.isOpen &&
      this.config?.host === config.host &&
      this.config?.port === config.port
    ) {
      try {
        await this._sendAndReceive<Record<string, unknown>>(
          { txnPosTxnId: "000000", txnType: "getData" },
          5000,
        );
        return;
      } catch {
        console.warn(
          "[CastlesService] Existing connection stale, reconnecting...",
        );
        await this._gracefulDisconnectInner();
      }
    }

    // Graceful disconnect gives terminal time to release previous session
    if (this.transport?.isOpen) {
      await this._gracefulDisconnectInner();
    } else {
      this._disconnectInner();
    }
    this.config = config;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= CASTLES_CONNECT_MAX_RETRIES; attempt++) {
      // Escalation: attempts 2+ assume the terminal is in a stuck app-layer
      // state (the empty-buffer / response-timeout symptom). One return2Idle
      // and a fresh socket weren't enough — we send return2Idle multiple
      // times with gaps so the terminal's UI stack can unwind a stuck modal
      // or a half-processed transaction state. This is the in-app equivalent
      // of toggling WiFi on the terminal.
      const isEscalated = attempt >= 2;

      try {
        this._createTransport(config);
        await this.transport!.connect();

        if (this._postConnectDelayMs > 0) {
          console.log(
            `[CastlesService] Post-connect delay: ${this._postConnectDelayMs}ms`,
          );
          await this._delay(this._postConnectDelayMs);
        }

        // Clear any stuck state from previous session
        if (!this._skipReturn2Idle) {
          const idleSends = isEscalated ? 3 : 1;
          const idleTimeoutMs = isEscalated ? 4_000 : 3_000;
          for (let i = 0; i < idleSends; i++) {
            try {
              await this._sendAndReceive<Record<string, unknown>>(
                { txnPosTxnId: "000000", txnType: "return2Idle" },
                idleTimeoutMs,
              );
              console.log(
                `[CastlesService] return2Idle #${i + 1}/${idleSends} accepted${isEscalated ? " (escalated recovery)" : ""}`,
              );
              // Got a response — terminal is awake, no need to keep pushing.
              break;
            } catch {
              console.log(
                `[CastlesService] return2Idle #${i + 1}/${idleSends} no response (terminal may be idle, or stuck — continuing)`,
              );
            }
            if (i < idleSends - 1) await this._delay(1_000);
          }

          await this._delay(500);
        } else {
          console.log(
            "[CastlesService] Skipping return2Idle (diagnostic override)",
          );
        }

        // Verify CastlesPay is responsive. Use the tight handshake timeout
        // so the wedge signature is detected fast — on a healthy terminal
        // getData responds in <500ms, and on a wedged one no amount of
        // waiting helps.
        try {
          await this._sendAndReceive<Record<string, unknown>>(
            { txnPosTxnId: "000000", txnType: "getData" },
            CASTLES_HANDSHAKE_TIMEOUT_MS,
          );
        } catch (handshakeErr) {
          console.warn(
            `[CastlesService] getData handshake failed (attempt ${attempt}):`,
            handshakeErr instanceof Error
              ? handshakeErr.message
              : String(handshakeErr),
          );
          this._disconnectInner();
          throw handshakeErr;
        }

        console.log(
          `[CastlesService] Connected + verified: ${config.host}:${config.port} (attempt ${attempt})`,
        );
        // Defensive: clear any lingering wedge state if we ended up here
        // through a probe-driven recovery rather than the supervisor's own
        // probe loop. Cheap no-op when not wedged.
        getCastlesConnectionSupervisor().notifySuccess();
        return;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        console.warn(
          `[CastlesService] Attempt ${attempt}/${CASTLES_CONNECT_MAX_RETRIES} failed:`,
          lastError.message,
        );
        // NOTE: react-native-tcp-socket does NOT expose setLinger, so this is
        // a graceful FIN close — not an RST. The terminal-side TCP stack may
        // hold its half-open in CLOSE_WAIT for a while. We can't avoid that
        // without patching the native module.
        this._disconnectInner();

        // Wedge signature detected: TCP up, write resolved, but 0 bytes ever
        // came back. No amount of retrying will help — CastlesPay isn't
        // reading from any socket. Notify the supervisor so it owns the
        // recovery via background probe loop, and throw a typed error so
        // callers (testConnection / processSale / etc.) can render the
        // power-cycle modal instead of a cryptic timeout string.
        if (err instanceof CastlesEmptyResponseError) {
          getCastlesConnectionSupervisor().notifyEmptyBuffer({
            connectionType: config.connectionType ?? "local_socket",
            host: config.host,
            port: config.port,
          });
          throw new CastlesWedgedError(
            `Castles terminal appears wedged (no response on attempt ${attempt}). Power-cycle required.`,
          );
        }

        if (attempt < CASTLES_CONNECT_MAX_RETRIES) {
          // Give the terminal at least 3s before reconnecting so CastlesPay
          // has some chance to time out its own session state internally.
          // This is best-effort — the app-layer freeze symptom (empty buffer
          // on every command) can't be cured by a longer pause if CastlesPay
          // has stopped reading from the socket entirely.
          const baseDelay = CASTLES_CONNECT_RETRY_DELAY_MS * Math.pow(2, attempt - 1);
          const minRecoveryDelay = 3_000;
          const delay = Math.min(Math.max(baseDelay, minRecoveryDelay), 10_000);
          console.log(`[CastlesService] Retrying in ${delay}ms...`);
          await this._delay(delay);
        }
      }
    }

    const connectErr = new Error(
      `[CastlesService] Failed to connect after ${CASTLES_CONNECT_MAX_RETRIES} attempts: ${lastError?.message}`,
    );
    Sentry.captureException(connectErr, {
      tags: {
        terminal_ip: config.host,
        terminal_port: String(config.port ?? 8080),
        source: "castles_connect",
      },
    });
    throw connectErr;
  }

  /** Disconnect and clean up the transport (no mutex). */
  private _disconnectInner(): void {
    if (this.transport) {
      this.transport.disconnect();
      this.transport = null;
    }
    console.log("[CastlesService] Disconnected");
  }

  /** Public disconnect — safe to call from outside. */
  disconnect(): void {
    this.stopWatchdog();
    this._disconnectInner();
    // Reset quality so the header pill doesn't keep showing 'lost' after
    // an intentional disconnect (station switch, app background).
    useTerminalConnectionStore.getState().reset();
  }

  /**
   * Graceful disconnect (no mutex): send return2Idle, then close.
   * Gives CastlesPay time to release the session.
   */
  private async _gracefulDisconnectInner(): Promise<void> {
    if (this.transport?.isOpen) {
      console.log(
        "[CastlesService] Graceful disconnect: sending return2Idle before close...",
      );
      try {
        const payload = JSON.stringify({
          txnPosTxnId: "000000",
          txnType: "return2Idle",
        });
        await this.transport.write(payload).catch(() => {});
        await this._delay(1000);
      } catch {
        // Best-effort — terminal may already be idle
      }
    }
    this._disconnectInner();
    await this._delay(500);
  }

  /** Public graceful disconnect. */
  async gracefulDisconnect(): Promise<void> {
    this.stopWatchdog();
    await this._gracefulDisconnectInner();
    useTerminalConnectionStore.getState().reset();
  }

  isConnected(): boolean {
    return this.transport?.isOpen ?? false;
  }

  isSuspended(): boolean {
    return this._suspended;
  }

  /**
   * Put the service into a "suspended" state.
   *
   * Always tears down the transport, regardless of mutex state. If a command
   * is in flight, the tear-down causes the native socket to emit 'close', which
   * fires our onClose listeners in _sendAndReceive and cleanly rejects the
   * in-flight promise with a "Transport closed" error. The mutex releases
   * naturally when the in-flight runExclusive callback returns.
   *
   * Previously, suspend() bailed early when _mutex.isLocked() — leaving a dead
   * socket open while the in-flight command waited for a 60+ second timeout.
   * That was the upstream amplifier for the "retry loop crashes on stale socket"
   * bug (castles-transport-tcp.ts disconnect() race).
   *
   * Safe to call from an AppState listener — never throws, never blocks long.
   */
  async suspend(): Promise<void> {
    if (this._suspended) return;
    this._suspended = true;
    this.stopWatchdog();

    // Tear down the transport directly, without acquiring the mutex.
    // Any in-flight _sendAndReceive will receive a close event and reject.
    if (this.transport) {
      try {
        this.transport.disconnect();
      } catch (e) {
        console.warn(
          "[CastlesService] suspend: disconnect failed (non-fatal)",
          e instanceof Error ? e.message : String(e),
        );
      }
      this.transport = null;
    }

    console.log("[CastlesService] suspended");
  }

  /**
   * Exit the "suspended" state and optionally pre-warm a new connection.
   * - Clears the flag so lazy-reconnect from command path is allowed again.
   * - If `config` is provided, fire-and-forget a connect() attempt to put the
   *   socket back online before the first user action (invisible latency).
   */
  resume(config?: CastlesConnectionConfig): void {
    if (!this._suspended) return;
    this._suspended = false;
    const cfg = config ?? this.config;
    if (!cfg) return;
    // Fire-and-forget pre-warm; failure is non-fatal (lazy path will retry).
    this.connect(cfg).catch((e) => {
      console.warn(
        "[CastlesService] resume pre-warm failed (non-fatal):",
        e instanceof Error ? e.message : String(e),
      );
    });
  }

  setOnStatusNotification(callback: CastlesStatusCallback | null): void {
    this._onStatusNotification = callback;
  }

  getOnStatusNotification(): CastlesStatusCallback | null {
    return this._onStatusNotification;
  }

  // ── Tuning setters ──
  setSkipReturn2Idle(skip: boolean): void {
    this._skipReturn2Idle = skip;
  }
  setPostConnectDelay(ms: number): void {
    this._postConnectDelayMs = ms;
  }

  // ============================================================
  // TCP DIAGNOSTICS
  // ============================================================

  async diagnoseTcpConnection(config: CastlesConnectionConfig): Promise<{
    tcpConnected: boolean;
    dataReceived: boolean;
    delimiterUsed?: string;
    rawResponse?: string;
    error?: string;
    log: string[];
  }> {
    const log: string[] = [];
    const addLog = (msg: string) => {
      const ts = new Date().toISOString().slice(11, 23);
      log.push(`[${ts}] ${msg}`);
      console.log(`[CastlesDiag] ${msg}`);
    };

    addLog(`Connecting to ${config.host}:${config.port}...`);
    try {
      this._disconnectInner();
      this.config = config;
      this._createTransport(config);
      await this.transport!.connect();
      addLog("TCP connection established successfully");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      addLog(`TCP connection FAILED: ${msg}`);
      return { tcpConnected: false, dataReceived: false, error: msg, log };
    }

    if (!this.transport?.isOpen) {
      addLog("Transport is not open after connect — unexpected");
      return {
        tcpConnected: false,
        dataReceived: false,
        error: "Transport not open",
        log,
      };
    }

    // Try getData with raw JSON (no delimiter, per Castles spec)
    const request = JSON.stringify({
      txnPosTxnId: "000001",
      txnType: "getData",
    });

    addLog(`Sending getData: ${request}`);
    const result = await this._diagSend(request, 8000);

    if (result.received) {
      addLog(
        `SUCCESS! Received ${result.data.length} bytes: ${result.data.slice(0, 300)}`,
      );
      return {
        tcpConnected: true,
        dataReceived: true,
        delimiterUsed: "none (raw)",
        rawResponse: result.data,
        log,
      };
    }

    addLog(`No response after 8s. Buffer: "${result.data || "(empty)"}"`);
    addLog("Terminal accepted TCP but did not respond to getData");
    return {
      tcpConnected: true,
      dataReceived: false,
      error: "Terminal accepted TCP connection but did not respond",
      log,
    };
  }

  private _diagSend(
    payload: string,
    timeoutMs: number,
  ): Promise<{ received: boolean; data: string }> {
    return new Promise((resolve) => {
      if (!this.transport?.isOpen) {
        resolve({ received: false, data: "" });
        return;
      }

      const transport = this.transport;
      let buffer = "";
      let settled = false;

      const timer = setTimeout(() => {
        if (!settled) {
          settled = true;
          cleanup();
          resolve({ received: false, data: buffer });
        }
      }, timeoutMs);

      const onData = (chunk: string) => {
        buffer += chunk;
        setTimeout(() => {
          if (!settled) {
            settled = true;
            cleanup();
            resolve({ received: true, data: buffer });
          }
        }, 500);
      };

      const onError = () => {
        if (!settled) {
          settled = true;
          cleanup();
          resolve({ received: false, data: buffer });
        }
      };

      const onClose = () => {
        if (!settled) {
          settled = true;
          cleanup();
          resolve({ received: buffer.length > 0, data: buffer });
        }
      };

      const cleanup = () => {
        clearTimeout(timer);
        transport.offData(onData);
        transport.offError(onError);
        transport.offClose(onClose);
      };

      transport.onData(onData);
      transport.onError(onError);
      transport.onClose(onClose);

      transport.write(payload).catch(() => {
        if (!settled) {
          settled = true;
          cleanup();
          resolve({ received: false, data: "" });
        }
      });
    });
  }

  // ============================================================
  // SALE
  // ============================================================

  async processSale(params: {
    amount: number;
    tipAmount?: number;
    referenceId: string;
  }): Promise<CastlesSaleResult> {
    return this._withRetry(async () => {
      return this._mutex.runExclusive(async () => {
        await this._ensureConnected();

        try {
          const request: CastlesSaleRequest = {
            txnPosTxnId: params.referenceId,
            txnType: "sale",
            txnAmtBase: params.amount.toFixed(2),
            txnAmtTip: (params.tipAmount ?? 0).toFixed(2),
          };

          const timeout = this.config?.timeout ?? CASTLES_SOCKET_TIMEOUT_MS;
          const raw = await this._sendAndReceive<CastlesRawResponse>(
            request as unknown as Record<string, unknown>,
            timeout,
          );

          const isApproved = raw.txnReturnCode === CASTLES_SUCCESS_CODE;
          const errorMsg = isApproved
            ? undefined
            : raw.txnStatusMessage ||
              parseCastlesReturnCode(raw.txnReturnCode).message;

          console.log("[CastlesService] processSale response:", {
            txnRrn: raw.txnRrn,
            txnRRN: raw.txnRRN,
            txnStan: raw.txnStan,
            txnPosTxnId: raw.txnPosTxnId,
            txnReturnCode: raw.txnReturnCode,
          });

          // Defer return2Idle — don't block the payment result for up to 8s
          // The terminal will dismiss its result screen asynchronously
          this._deferReturn2Idle();
          return {
            success: isApproved,
            raw,
            terminalResponse: buildCastlesTerminalResponse(
              raw,
              this.config?.terminalId,
            ),
            error: errorMsg,
          };
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          console.error("[CastlesService] processSale error:", message);
          // Error path: force return2Idle synchronously (reconnect + reset)
          await this._forceReturn2Idle();
          return {
            success: false,
            error: message,
          };
        }
      });
    });
  }

  // ============================================================
  // TIP ADJUSTMENT
  // ============================================================

  async tipAdjust(params: {
    tipAmount: number;
    rrn: string;
    referenceId: string;
  }): Promise<CastlesTipAdjustResult> {
    return this._withRetry(async () => {
      return this._mutex.runExclusive(async () => {
        await this._ensureConnected();

        try {
          const request: CastlesTipAdjustRequest = {
            txnPosTxnId: params.referenceId,
            txnType: "tipAdjustment",
            txnAmtTip: params.tipAmount.toFixed(2),
            txnRrn: params.rrn,
          };

          const timeout = this.config?.timeout ?? CASTLES_SOCKET_TIMEOUT_MS;
          const raw = await this._sendAndReceive<CastlesRawResponse>(
            request as unknown as Record<string, unknown>,
            timeout,
          );

          console.log("[CastlesService] tipAdjust response:", {
            txnRrn: raw.txnRrn,
            txnRRN: raw.txnRRN,
            txnStan: raw.txnStan,
            txnPosTxnId: raw.txnPosTxnId,
            txnReturnCode: raw.txnReturnCode,
          });

          const isApproved = raw.txnReturnCode === CASTLES_SUCCESS_CODE;
          const errorMsg = isApproved
            ? undefined
            : raw.txnStatusMessage ||
              parseCastlesReturnCode(raw.txnReturnCode).message;

          await this._tryReturn2Idle();
          return {
            success: isApproved,
            raw,
            terminalResponse: buildCastlesTerminalResponse(
              raw,
              this.config?.terminalId,
            ),
            error: errorMsg,
          };
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          console.error("[CastlesService] tipAdjust error:", message);
          await this._forceReturn2Idle();
          return { success: false, error: message };
        }
      });
    });
  }

  // ============================================================
  // VOID
  // ============================================================

  async processVoid(params: {
    rrn?: string;
    stan?: string;
    referenceId: string;
    journalId?: string;
  }): Promise<CastlesVoidResult> {
    if (!params.rrn && !params.stan) {
      return {
        success: false,
        error: "At least one of rrn or stan is required for void",
      };
    }

    return this._withRetry(async () => {
      return this._mutex.runExclusive(async () => {
        await this._ensureConnected();

        try {
          const request: CastlesVoidRequest = {
            txnPosTxnId: params.referenceId,
            txnType: "void",
            ...(params.rrn ? { txnRrn: params.rrn } : {}),
            ...(params.stan ? { txnStan: params.stan } : {}),
          };

          // Wave R-3: write-ahead before TCP send (TCP-in-flight durability)
          if (params.journalId) {
            updateRefundJournal(params.journalId, {
              status: "initiated",
              terminalTxnId: params.rrn ?? params.stan,
            });
          }

          const timeout = this.config?.timeout ?? CASTLES_SOCKET_TIMEOUT_MS;
          const raw = await this._sendAndReceive<CastlesRawResponse>(
            request as unknown as Record<string, unknown>,
            timeout,
          );

          console.log("[CastlesService] processVoid response:", {
            txnRrn: raw.txnRrn,
            txnRRN: raw.txnRRN,
            txnStan: raw.txnStan,
            txnPosTxnId: raw.txnPosTxnId,
            txnReturnCode: raw.txnReturnCode,
          });

          const isApproved = raw.txnReturnCode === CASTLES_SUCCESS_CODE;
          const errorMsg = isApproved
            ? undefined
            : raw.txnStatusMessage ||
              parseCastlesReturnCode(raw.txnReturnCode).message;

          // Wave R-3: advance journal to terminal_approved on success
          if (params.journalId && isApproved) {
            updateRefundJournal(params.journalId, {
              status: "terminal_approved",
              terminalTxnId:
                raw.txnRrn ?? raw.txnRRN ?? params.rrn ?? params.stan,
            });
          }

          await this._tryReturn2Idle();
          return {
            success: isApproved,
            raw,
            terminalResponse: buildCastlesTerminalResponse(
              raw,
              this.config?.terminalId,
            ),
            error: errorMsg,
          };
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          console.error("[CastlesService] processVoid error:", message);
          await this._forceReturn2Idle();
          return { success: false, error: message };
        }
      });
    });
  }

  // ============================================================
  // REFUND
  // ============================================================

  async processRefund(params: {
    amount: number;
    referenceId: string;
    journalId?: string;
  }): Promise<CastlesRefundResult> {
    return this._withRetry(async () => {
      return this._mutex.runExclusive(async () => {
        await this._ensureConnected();

        try {
          const request: CastlesRefundRequest = {
            txnPosTxnId: params.referenceId,
            txnType: "refund",
            txnAmtTrans: params.amount.toFixed(2),
          };

          // Wave R-3: write-ahead before TCP send
          if (params.journalId) {
            updateRefundJournal(params.journalId, {
              status: "initiated",
              terminalTxnId: params.referenceId,
            });
          }

          const timeout = this.config?.timeout ?? CASTLES_SOCKET_TIMEOUT_MS;
          const raw = await this._sendAndReceive<CastlesRawResponse>(
            request as unknown as Record<string, unknown>,
            timeout,
          );

          const isApproved = raw.txnReturnCode === CASTLES_SUCCESS_CODE;
          const errorMsg = isApproved
            ? undefined
            : raw.txnStatusMessage ||
              parseCastlesReturnCode(raw.txnReturnCode).message;

          // Wave R-3: advance journal to terminal_approved on success
          if (params.journalId && isApproved) {
            updateRefundJournal(params.journalId, {
              status: "terminal_approved",
              terminalTxnId: raw.txnRrn ?? raw.txnRRN ?? params.referenceId,
            });
          }

          await this._tryReturn2Idle();
          return {
            success: isApproved,
            raw,
            terminalResponse: buildCastlesTerminalResponse(
              raw,
              this.config?.terminalId,
            ),
            error: errorMsg,
          };
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          console.error("[CastlesService] processRefund error:", message);
          await this._forceReturn2Idle();
          return { success: false, error: message };
        }
      });
    });
  }

  // ============================================================
  // SETTLEMENT
  // ============================================================

  /**
   * Initiate batch settlement on the terminal.
   *
   * Settlement is NOT idempotent — no _withRetry wrapper.
   * Uses a long timeout (5 min) because the terminal contacts multiple hosts.
   * Response may have per-host results in txnSettleInfo[].
   * Top-level txnReturnCode may indicate partial success even when
   * individual hosts succeeded — always check per-host results.
   */
  async processSettlement(params: {
    referenceId: string;
  }): Promise<CastlesSettlementResult> {
    // No _withRetry — settlement is not idempotent
    return this._mutex.runExclusive(async () => {
      await this._ensureConnected();

      try {
        const request: CastlesSettlementRequest = {
          txnPosTxnId: params.referenceId,
          txnType: "settlement",
        };

        const raw = await this._sendAndReceive<CastlesSettlementRawResponse>(
          request as unknown as Record<string, unknown>,
          CASTLES_SETTLEMENT_TIMEOUT_MS,
        );

        // Parse per-host results
        const hosts = (raw.txnSettleInfo ?? []).map(parseSettlementHostResult);

        // Determine overall success
        const topLevelOk = raw.txnReturnCode === CASTLES_SUCCESS_CODE;
        const anyHostSucceeded = hosts.some((h) => h.success);
        const allHostsSucceeded =
          hosts.length > 0 && hosts.every((h) => h.success);

        const success = topLevelOk || allHostsSucceeded;
        const partialSuccess = !success && anyHostSucceeded;

        const error =
          success || partialSuccess
            ? undefined
            : buildSettlementErrorMessage(raw, hosts);

        await this._tryReturn2Idle();

        return { success, partialSuccess, raw, hosts, error };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error("[CastlesService] processSettlement error:", message);
        await this._forceReturn2Idle();
        return {
          success: false,
          partialSuccess: false,
          hosts: [],
          error: message,
        };
      }
    });
  }

  // ============================================================
  // PRE-AUTH
  // ============================================================

  async processPreAuth(params: {
    amount: number;
    referenceId: string;
  }): Promise<CastlesPreAuthResult> {
    return this._withRetry(async () => {
      return this._mutex.runExclusive(async () => {
        await this._ensureConnected();

        try {
          const request: CastlesPreAuthRequest = {
            txnPosTxnId: params.referenceId,
            txnType: "preAuth",
            txnAmtBase: params.amount.toFixed(2),
          };

          const timeout = this.config?.timeout ?? CASTLES_SOCKET_TIMEOUT_MS;
          const raw = await this._sendAndReceive<CastlesRawResponse>(
            request as unknown as Record<string, unknown>,
            timeout,
          );

          const isApproved = raw.txnReturnCode === CASTLES_SUCCESS_CODE;
          const errorMsg = isApproved
            ? undefined
            : raw.txnStatusMessage ||
              parseCastlesReturnCode(raw.txnReturnCode).message;

          await this._tryReturn2Idle();
          return {
            success: isApproved,
            raw,
            terminalResponse: buildCastlesTerminalResponse(
              raw,
              this.config?.terminalId,
            ),
            error: errorMsg,
          };
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          console.error("[CastlesService] processPreAuth error:", message);
          await this._forceReturn2Idle();
          return {
            success: false,
            error: message,
          };
        }
      });
    });
  }

  // ============================================================
  // AUTH INCREMENTAL
  // ============================================================

  async processAuthIncremental(params: {
    amount: number;
    referenceId: string;
    rrn?: string;
    stan?: string;
  }): Promise<CastlesAuthIncrementalResult> {
    if (!params.rrn && !params.stan) {
      return {
        success: false,
        error: "At least one of rrn or stan is required for incremental auth",
      };
    }

    return this._withRetry(async () => {
      return this._mutex.runExclusive(async () => {
        await this._ensureConnected();

        try {
          const request: CastlesAuthIncrementalRequest = {
            txnPosTxnId: params.referenceId,
            txnType: "authIncremental",
            txnAmtBase: params.amount.toFixed(2),
            ...(params.rrn ? { txnRrn: params.rrn } : {}),
            ...(params.stan ? { txnStan: params.stan } : {}),
          };

          const timeout = this.config?.timeout ?? CASTLES_SOCKET_TIMEOUT_MS;
          const raw = await this._sendAndReceive<CastlesRawResponse>(
            request as unknown as Record<string, unknown>,
            timeout,
          );

          const isApproved = raw.txnReturnCode === CASTLES_SUCCESS_CODE;
          const errorMsg = isApproved
            ? undefined
            : raw.txnStatusMessage ||
              parseCastlesReturnCode(raw.txnReturnCode).message;

          await this._tryReturn2Idle();
          return {
            success: isApproved,
            raw,
            terminalResponse: buildCastlesTerminalResponse(
              raw,
              this.config?.terminalId,
            ),
            error: errorMsg,
          };
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          console.error(
            "[CastlesService] processAuthIncremental error:",
            message,
          );
          await this._forceReturn2Idle();
          return {
            success: false,
            error: message,
          };
        }
      });
    });
  }

  // ============================================================
  // AUTH COMPLETE (CAPTURE)
  // ============================================================

  async processAuthComplete(params: {
    captureAmount: number;
    referenceId: string;
    rrn?: string;
    stan?: string;
  }): Promise<CastlesAuthCompleteResult> {
    if (!params.rrn && !params.stan) {
      return {
        success: false,
        error: "At least one of rrn or stan is required for auth complete",
      };
    }

    return this._withRetry(async () => {
      return this._mutex.runExclusive(async () => {
        await this._ensureConnected();

        try {
          const request: CastlesAuthCompleteRequest = {
            txnPosTxnId: params.referenceId,
            txnType: "authComplete",
            txnAmtAuthComplete: params.captureAmount.toFixed(2),
            ...(params.rrn ? { txnRrn: params.rrn } : {}),
            ...(params.stan ? { txnStan: params.stan } : {}),
          };

          const timeout = this.config?.timeout ?? CASTLES_SOCKET_TIMEOUT_MS;
          const raw = await this._sendAndReceive<CastlesRawResponse>(
            request as unknown as Record<string, unknown>,
            timeout,
          );

          const isApproved = raw.txnReturnCode === CASTLES_SUCCESS_CODE;
          const errorMsg = isApproved
            ? undefined
            : raw.txnStatusMessage ||
              parseCastlesReturnCode(raw.txnReturnCode).message;

          await this._tryReturn2Idle();
          return {
            success: isApproved,
            raw,
            terminalResponse: buildCastlesTerminalResponse(
              raw,
              this.config?.terminalId,
            ),
            error: errorMsg,
          };
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          console.error("[CastlesService] processAuthComplete error:", message);
          await this._forceReturn2Idle();
          return {
            success: false,
            error: message,
          };
        }
      });
    });
  }

  // ============================================================
  // GET DATA
  // ============================================================

  async getTerminalData(referenceId: string): Promise<CastlesGetDataResult> {
    return this._withRetry(async () => {
      return this._mutex.runExclusive(async () => {
        await this._ensureConnected();

        try {
          const request: CastlesGetDataRequest = {
            txnPosTxnId: referenceId,
            txnType: "getData",
          };

          const raw = await this._sendAndReceive<CastlesGetDataResponse>(
            request as unknown as Record<string, unknown>,
            CASTLES_GET_DATA_TIMEOUT_MS,
          );

          const isSuccess =
            raw.txnReturnCode === CASTLES_SUCCESS_CODE ||
            (raw.txnReturnCode == null && raw.txnType === "getData");

          if (!isSuccess && raw.txnReturnCode) {
            const parsed = parseCastlesReturnCode(raw.txnReturnCode);
            return { success: false, data: raw, error: parsed.message };
          }

          return {
            success: isSuccess,
            data: raw,
            error: isSuccess ? undefined : "getData failed (no return code)",
          };
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          console.error("[CastlesService] getTerminalData error:", message);
          await this._forceReturn2Idle();
          return { success: false, error: message };
        }
      });
    });
  }

  // ============================================================
  // TERMINAL RECOVERY
  // ============================================================

  /**
   * Schedule return2Idle to run AFTER the current mutex-exclusive block releases.
   * This avoids blocking the caller (e.g. processSale) for up to 8s while the
   * terminal dismisses its result screen. The deferred call re-acquires the mutex
   * so it won't conflict with subsequent commands.
   */
  private _deferReturn2Idle(): void {
    queueMicrotask(() => {
      this._mutex
        .runExclusive(async () => {
          await this._tryReturn2Idle();
        })
        .catch((err) => {
          console.warn("[CastlesService] Deferred return2Idle failed:", err);
        });
    });
  }

  /**
   * Send return2Idle on the EXISTING transport (situation 1 per spec §3.8).
   * Called while mutex IS held.
   */
  private async _tryReturn2Idle(startup = false): Promise<boolean> {
    if (!this.transport?.isOpen) return false;

    try {
      const request: CastlesReturn2IdleRequest = {
        txnPosTxnId: "000000",
        txnType: "return2Idle",
      };

      const timeout = startup ? 3_000 : CASTLES_RETURN2IDLE_TIMEOUT_MS;

      await this._sendAndReceive<Record<string, unknown>>(
        request as unknown as Record<string, unknown>,
        timeout,
      );

      console.log("[CastlesService] return2Idle succeeded");
      return true;
    } catch (err) {
      if (startup) {
        console.log(
          "[CastlesService] Startup reset: terminal likely already idle",
        );
      } else {
        console.warn(
          "[CastlesService] return2Idle failed:",
          err instanceof Error ? err.message : String(err),
        );
      }
      return false;
    }
  }

  /**
   * Force return2Idle on a NEW socket (situation 2 per spec §3.8).
   * Called while mutex IS held.
   */
  private async _forceReturn2Idle(): Promise<boolean> {
    if (!this.config) return false;
    if (this._suspended) {
      console.log("[CastlesService] _forceReturn2Idle: suspended — skipping");
      return false;
    }

    const config = this.config;
    console.log(
      "[CastlesService] Force return2Idle: closing transport and reconnecting...",
    );

    this._disconnectInner();
    // Let the native executor drain any pending Runnable from the disconnect
    // before we reconnect. 250ms (bumped from 50ms) gives Android's native
    // socket teardown enough time even under load — 50ms was racy on lower-end
    // tablets and could cause the reconnect to land on a partially-destroyed
    // socket.
    await this._delay(250);

    try {
      this._createTransport(config);
      await this.transport!.connect();
    } catch (err) {
      console.warn(
        "[CastlesService] Force return2Idle: reconnect failed:",
        err instanceof Error ? err.message : String(err),
      );
      return false;
    }

    try {
      const request: CastlesReturn2IdleRequest = {
        txnPosTxnId: "000000",
        txnType: "return2Idle",
      };

      await this._sendAndReceive<Record<string, unknown>>(
        request as unknown as Record<string, unknown>,
        CASTLES_RETURN2IDLE_TIMEOUT_MS,
      );

      console.log("[CastlesService] Force return2Idle succeeded");
      return true;
    } catch {
      console.log(
        "[CastlesService] Force return2Idle: no response (terminal may already be idle)",
      );
      return true;
    }
  }

  /**
   * Public recovery: acquire mutex and send return2Idle.
   * Call after fresh connect to clear any stuck-busy state.
   */
  async resetTerminalState(): Promise<boolean> {
    return this._mutex.runExclusive(() => this._tryReturn2Idle(true));
  }

  isLocked(): boolean {
    return this._mutex.isLocked();
  }

  // ============================================================
  // CONNECTION WATCHDOG
  // ============================================================

  /**
   * Start periodic health pings to keep the connection warm
   * and detect staleness before the next real command.
   * Runs outside the mutex — if mutex is held, skips the ping.
   */
  startWatchdog(intervalMs = 30_000): void {
    this.stopWatchdog();
    this._watchdogConsecutiveFailures = 0;

    this._watchdogTimer = setInterval(async () => {
      if (this._suspended) return;
      if (!this.transport?.isOpen || !this.config) return;
      if (this._mutex.isLocked()) return;
      // While wedged the supervisor owns recovery via its own probe loop.
      // Skip ticks here so the two don't race each other into the store.
      if (useTerminalConnectionStore.getState().quality === 'wedged') return;

      try {
        await this._mutex.runExclusive(async () => {
          if (!this.transport?.isOpen) return;
          await this._sendAndReceive<Record<string, unknown>>(
            { txnPosTxnId: "000000", txnType: "getData" },
            5_000,
          );
          this._watchdogConsecutiveFailures = 0;
          useTerminalConnectionStore.getState().setQuality("ok");
        });
      } catch {
        this._watchdogConsecutiveFailures++;
        console.warn(
          `[CastlesService] Watchdog ping failed (${this._watchdogConsecutiveFailures}/2)`,
        );

        useTerminalConnectionStore
          .getState()
          .setQuality(this._watchdogConsecutiveFailures >= 2 ? "lost" : "degraded");

        if (this._watchdogConsecutiveFailures >= 2 && this.config) {
          console.log(
            "[CastlesService] Watchdog: reconnecting after consecutive failures...",
          );
          try {
            await this._mutex.runExclusive(() =>
              this._connectInner(this.config!),
            );
            this._watchdogConsecutiveFailures = 0;
            useTerminalConnectionStore.getState().setQuality("ok");
          } catch (reconErr) {
            console.error(
              "[CastlesService] Watchdog reconnect failed:",
              reconErr instanceof Error ? reconErr.message : String(reconErr),
            );
          }
        }
      }
    }, intervalMs);

    console.log(
      `[CastlesService] Watchdog started (interval: ${intervalMs}ms)`,
    );
  }

  stopWatchdog(): void {
    if (this._watchdogTimer) {
      clearInterval(this._watchdogTimer);
      this._watchdogTimer = null;
      this._watchdogConsecutiveFailures = 0;
      console.log("[CastlesService] Watchdog stopped");
    }
  }

  // ============================================================
  // PRIVATE HELPERS
  // ============================================================

  /**
   * Create a new transport instance. Does NOT call connect().
   */
  private _createTransport(config: CastlesConnectionConfig): void {
    if (this.transport) {
      this.transport.disconnect();
      this.transport = null;
    }

    this.transport = createCastlesTransport({
      connectionType: config.connectionType ?? "local_socket",
      host: config.host,
      port: config.port,
      connectTimeoutMs: CASTLES_CONNECT_TIMEOUT_MS,
    });
  }

  /**
   * Pre-flight liveness check. Called inside mutex before each transaction.
   *
   * 1. If transport is closed → auto-reconnect
   * 2. If no data received for >60s → ping with getData to verify liveness
   *    - If ping fails → reconnect
   */
  private async _ensureConnected(): Promise<void> {
    if (this._suspended) {
      throw new Error("Transport is not open — service suspended");
    }
    if (!this.config) {
      throw new Error("Not connected to terminal — call connect() first");
    }

    // Transport is definitely dead — reconnect
    if (!this.transport?.isOpen) {
      console.log(
        "[CastlesService] _ensureConnected: transport closed, reconnecting...",
      );
      await this._connectInner(this.config);
      return;
    }

    // Transport looks open but might be half-open (WiFi dropout, terminal sleep).
    // If we haven't received any data recently, probe with a quick getData.
    const staleSec = this.transport.secondsSinceLastData();
    if (staleSec > STALE_CONNECTION_THRESHOLD_S) {
      console.log(
        `[CastlesService] _ensureConnected: no data for ${staleSec.toFixed(0)}s, probing...`,
      );
      try {
        await this._sendAndReceive<Record<string, unknown>>(
          { txnPosTxnId: "000000", txnType: "getData" },
          5_000,
        );
      } catch {
        console.warn(
          "[CastlesService] _ensureConnected: probe failed, reconnecting...",
        );
        await this._connectInner(this.config);
      }
    }
  }

  /**
   * Single-retry wrapper for connection-level failures.
   * If the first attempt fails with a connection error, reconnect and retry once.
   */
  private async _withRetry<T extends { success: boolean; error?: string }>(
    fn: () => Promise<T>,
  ): Promise<T> {
    const first = await fn();

    if (
      !first.success &&
      first.error &&
      isConnectionError(first.error) &&
      this.config
    ) {
      if (this._suspended) {
        return first; // don't attempt reconnect; caller gets the original failure
      }
      console.log(
        "[CastlesService] Connection error detected, retrying after reconnect...",
      );
      // A connection error during a real sale is a strong "lost" signal
      // even if the watchdog hasn't fired yet.
      useTerminalConnectionStore.getState().setQuality("lost");
      try {
        await this._mutex.runExclusive(async () => {
          // Force a fresh socket before reconnect — the previous transport may
          // be half-open (TCP CLOSE_WAIT after WiFi drop). _connectInner does
          // call _createTransport which disconnects, but doing it explicitly
          // here makes the cleanup deterministic and gives the native executor
          // time to drain before we open a new socket.
          this._disconnectInner();
          await this._delay(250);
          await this._connectInner(this.config!);
        });
        // Reconnect succeeded → quality recovers.
        useTerminalConnectionStore.getState().setQuality("ok");
      } catch (reconErr) {
        return {
          ...first,
          error: `Reconnect failed: ${reconErr instanceof Error ? reconErr.message : String(reconErr)}`,
        };
      }
      return fn();
    }

    return first;
  }

  /**
   * Send a JSON request and wait for the matching response.
   *
   * Uses brace-depth counting to extract complete JSON objects from
   * the unframed TCP stream. Handles partial JSON, multiple objects
   * per chunk, and interleaved status notifications.
   *
   * Write is awaited — rejects immediately if write fails.
   */
  private _sendAndReceive<T>(
    request: Record<string, unknown>,
    timeoutMs: number,
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      if (!this.transport?.isOpen) {
        reject(new Error("Transport not available"));
        return;
      }

      const transport = this.transport;

      // ── Stream parser state ──
      let buffer = "";
      let depth = 0;
      let inString = false;
      let escaped = false;
      let objectStart = -1;
      let settled = false;

      const timer = setTimeout(() => {
        if (!settled) {
          settled = true;
          cleanup();
          // Distinguish the wedge signature (0 bytes received) from generic
          // timeouts. Empty buffer at timeout = CastlesPay isn't reading from
          // the socket at all → throw the typed subclass so the connect
          // retry loop can short-circuit and notify the supervisor instead
          // of burning all 3 retries on the same dead listener.
          if (buffer.length === 0) {
            reject(new CastlesEmptyResponseError(timeoutMs));
            return;
          }
          const preview =
            buffer.length > 200 ? buffer.slice(0, 200) + "..." : buffer;
          reject(
            new Error(
              `Response timed out after ${timeoutMs}ms. ` +
                `Buffer (${buffer.length} chars): "${preview}". ` +
                `Parser state: depth=${depth}, inString=${inString}. ` +
                `The transaction may still be processing on the terminal.`,
            ),
          );
        }
      }, timeoutMs);

      const processCompleteObject = (jsonStr: string): void => {
        if (settled) return;

        let parsed: Record<string, unknown>;
        try {
          parsed = JSON.parse(jsonStr);
        } catch (err) {
          console.warn(
            "[CastlesService] Failed to parse extracted JSON:",
            jsonStr.slice(0, 200),
            err,
          );
          return;
        }

        if (parsed.txnType === "status") {
          console.log(
            "[CastlesService] Status:",
            parsed.txnStatus ?? parsed.txnStatusMessage ?? "unknown",
          );
          try {
            this._onStatusNotification?.({
              txnStatus: parsed.txnStatus as string | undefined,
              txnStatusMessage: parsed.txnStatusMessage as string | undefined,
            });
          } catch (cbErr) {
            console.warn("[CastlesService] Status callback error:", cbErr);
          }
          return;
        }

        settled = true;
        cleanup();
        resolve(parsed as T);
      };

      const onData = (chunk: string) => {
        if (settled) return;

        console.log(
          `[CastlesService] Chunk (${chunk.length} bytes):`,
          chunk,
        );

        for (let i = 0; i < chunk.length; i++) {
          const char = chunk[i];
          buffer += char;

          if (escaped) {
            escaped = false;
            continue;
          }

          if (char === "\\" && inString) {
            escaped = true;
            continue;
          }

          if (char === '"' && !escaped) {
            inString = !inString;
            continue;
          }

          if (!inString) {
            if (char === "{") {
              if (depth === 0) {
                objectStart = buffer.length - 1;
              }
              depth++;
            } else if (char === "}") {
              depth--;

              if (depth === 0 && objectStart >= 0) {
                const jsonStr = buffer.slice(objectStart);
                buffer = "";
                objectStart = -1;

                processCompleteObject(jsonStr);

                if (settled) return;
              }
            }
          }
        }
      };

      const onError = (err: Error) => {
        if (!settled) {
          settled = true;
          cleanup();
          reject(err);
        }
      };

      const onClose = () => {
        if (!settled) {
          settled = true;
          cleanup();
          reject(new Error("Transport closed before response was received"));
        }
      };

      const cleanup = () => {
        clearTimeout(timer);
        transport.offData(onData);
        transport.offError(onError);
        transport.offClose(onClose);
      };

      transport.onData(onData);
      transport.onError(onError);
      transport.onClose(onClose);

      const payload = JSON.stringify(request);
      console.log("[CastlesService] Sending:", payload);

      transport.write(payload).catch((writeErr) => {
        if (!settled) {
          settled = true;
          cleanup();
          reject(
            new Error(
              `Write failed: ${writeErr instanceof Error ? writeErr.message : String(writeErr)}`,
            ),
          );
        }
      });
    });
  }

  private _delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// ============================================================
// SETTLEMENT HELPERS
// ============================================================

/** Parse a single host's settlement info into a structured result. */
function parseSettlementHostResult(
  host: CastlesSettlementHostInfo,
): CastlesSettlementHostResult {
  const parseDollar = (v?: string): number => {
    if (!v) return 0;
    const n = parseFloat(v);
    return isNaN(n) ? 0 : n;
  };
  const parseInt10 = (v?: string): number => {
    if (!v) return 0;
    const n = parseInt(v, 10);
    return isNaN(n) ? 0 : n;
  };

  return {
    acquirerName: host.txnAcquirerName ?? "Unknown",
    success: host.txnReturnCode === CASTLES_SUCCESS_CODE,
    returnCode: host.txnReturnCode ?? "",
    hostMessage: host.txnHostMsg ?? undefined,
    saleTotalAmount: parseDollar(host.txnTotalSaleAmt),
    saleTotalCount: parseInt10(host.txnTotalSaleCnt),
    refundTotalAmount: parseDollar(host.txnTotalRefundAmt),
    refundTotalCount: parseInt10(host.txnTotalRefundCnt),
    settleTotalAmount: parseDollar(host.txnTotalSettleAmt),
    settleTotalCount: parseInt10(host.txnTotalSettleCnt),
    merchantId: host.txnMid ?? undefined,
    terminalId: host.txnTid ?? undefined,
    dateTime: host.txnDateTime ?? undefined,
    batchNumber: host.txnBatchNum ?? undefined,
  };
}

/** Build a human-readable error message from settlement failures. */
function buildSettlementErrorMessage(
  raw: CastlesSettlementRawResponse,
  hosts: CastlesSettlementHostResult[],
): string {
  const failedHosts = hosts.filter((h) => !h.success);
  if (failedHosts.length > 0) {
    const details = failedHosts
      .map(
        (h) =>
          `${h.acquirerName}: ${h.hostMessage || parseCastlesReturnCode(h.returnCode).message}`,
      )
      .join("; ");
    return `Settlement failed for: ${details}`;
  }
  const parsed = parseCastlesReturnCode(raw.txnReturnCode);
  return parsed.message || `Settlement failed (code: ${raw.txnReturnCode})`;
}

// ============================================================
// STANDALONE TCP PROBE (health check — no CastlesService instance)
// ============================================================

/** Default handshake timeout for the probe's getData (W2.1). */
const PROBE_HANDSHAKE_TIMEOUT_MS = 3_000;

/**
 * Reachability + responsiveness probe.
 *
 * - TCP connect (or USB open) within `timeoutMs`
 * - Send a `getData` JSON, accept ANY response chunk within
 *   `PROBE_HANDSHAKE_TIMEOUT_MS` as proof the payment app is responsive.
 *   (We deliberately do NOT parse the response — getting any bytes back
 *   already disambiguates "TCP up, app frozen" from "fully alive".)
 *
 * Never throws — always resolves a CastlesProbeResult with a discriminated
 * `reason` so callers/UI can render specific recovery copy.
 *
 * Independent of the CastlesService class instance, so the probe never
 * interferes with a held singleton mutex or an in-flight sale.
 */
export async function probeCastlesTerminal(
  config: CastlesTransportConfig,
  timeoutMs = 5000,
): Promise<CastlesProbeResult> {
  if (config.connectionType === "local_socket" && !config.host) {
    return {
      online: false,
      reason: "no_ip_configured",
      error: "TCP transport requires a host address",
    };
  }

  let transport: ICastlesTransport | null = null;
  try {
    transport = createCastlesTransport({
      ...config,
      connectTimeoutMs: timeoutMs,
    });
    await transport.connect();
  } catch (err) {
    if (transport) {
      try { transport.disconnect(); } catch { /* ignore */ }
    }
    const errorMessage = err instanceof Error ? err.message : String(err);
    const reason =
      config.connectionType === "usb"
        ? "usb_disconnected"
        : classifyTcpError(err);
    return { online: false, reason, error: errorMessage };
  }

  // Transport is up. Now verify the payment app is responsive by sending a
  // getData and waiting for any bytes back. A frozen CastlesPay app will
  // accept the TCP connection (kernel-level) but never emit a response.
  const responsive = await _probeHandshake(transport, PROBE_HANDSHAKE_TIMEOUT_MS);
  try { transport.disconnect(); } catch { /* ignore */ }

  if (responsive.ok) {
    return { online: true, reason: "online" };
  }
  return {
    online: false,
    reason: "terminal_unresponsive",
    error: responsive.error,
  };
}

/**
 * Send a getData JSON and wait for any data chunk back. We don't parse —
 * the goal is to prove the CastlesPay app is alive, not to read fields.
 */
function _probeHandshake(
  transport: ICastlesTransport,
  timeoutMs: number,
): Promise<{ ok: boolean; error?: string }> {
  return new Promise((resolve) => {
    let settled = false;

    const onData = () => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve({ ok: true });
    };
    const onError = (err: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve({ ok: false, error: err.message });
    };
    const onClose = () => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve({ ok: false, error: "Transport closed before response" });
    };
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve({ ok: false, error: `Handshake timed out after ${timeoutMs}ms` });
    }, timeoutMs);

    const cleanup = () => {
      clearTimeout(timer);
      try { transport.offData(onData); } catch { /* ignore */ }
      try { transport.offError(onError); } catch { /* ignore */ }
      try { transport.offClose(onClose); } catch { /* ignore */ }
    };

    transport.onData(onData);
    transport.onError(onError);
    transport.onClose(onClose);

    const request = JSON.stringify({ txnPosTxnId: "000000", txnType: "getData" });
    transport.write(request).catch((err: unknown) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve({
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
    });
  });
}

// ============================================================
// SHARED SINGLETON
// ============================================================

let _sharedInstance: CastlesService | null = null;

/**
 * Returns the shared CastlesService singleton.
 * All production consumers should use this instead of `new CastlesService()`
 * to ensure only one TCP socket is open to the terminal at a time.
 */
export function getSharedCastlesService(): CastlesService {
  if (!_sharedInstance) {
    _sharedInstance = new CastlesService();
  }
  return _sharedInstance;
}

// Clean up TCP socket on Metro fast refresh to prevent stale connections
// that leave the Castles terminal stuck on the old socket.
if (__DEV__ && (module as any).hot) {
  (module as any).hot.dispose(() => {
    if (_sharedInstance) {
      console.log("[CastlesService] Hot refresh: tearing down TCP socket");
      _sharedInstance.disconnect();
      _sharedInstance = null;
    }
  });
}
