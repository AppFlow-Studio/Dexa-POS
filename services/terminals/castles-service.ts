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

import type {
  CastlesConnectionConfig,
  CastlesGetDataRequest,
  CastlesGetDataResponse,
  CastlesGetDataResult,
  CastlesRefundRequest,
  CastlesRefundResult,
  CastlesReturn2IdleRequest,
  CastlesSaleRequest,
  CastlesSaleResult,
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
  CASTLES_SOCKET_TIMEOUT_MS,
  CASTLES_SUCCESS_CODE,
} from "@/types/castles";
import { Mutex } from "async-mutex";
import type { ICastlesTransport, CastlesTransportConfig } from "./castles-transport.types";
import { createCastlesTransport } from "./castles-transport-factory";
import {
  type CastlesRawResponse,
  buildCastlesTerminalResponse,
  parseCastlesReturnCode,
} from "./castles-response-mapper";

export type CastlesStatusCallback = (notification: {
  txnStatus?: string;
  txnStatusMessage?: string;
}) => void;

export class CastlesService {
  private transport: ICastlesTransport | null = null;
  private config: CastlesConnectionConfig | null = null;
  private readonly _mutex = new Mutex();
  private _onStatusNotification: CastlesStatusCallback | null = null;

  // ── Connection tuning (for diagnostics) ──
  private _delimiter = "";           // Appended after JSON write ("", "\n", "\r\n", "\0")
  private _noDelay = false;          // TCP_NODELAY (disable Nagle) — diagnostic only
  private _skipReturn2Idle = false;  // Skip return2Idle during connect()
  private _postConnectDelayMs = 0;   // Delay after TCP connect before first write

  // ============================================================
  // CONNECTION
  // ============================================================

  /**
   * Connect to the Castles terminal and verify CastlesPay is responsive.
   * TCP connect may succeed before the CastlesPay app is ready (~5s startup).
   * We retry the full cycle: TCP connect → getData handshake.
   */
  async connect(config: CastlesConnectionConfig): Promise<void> {
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
        await this.gracefulDisconnect();
      }
    }

    // Graceful disconnect gives terminal time to release previous session
    if (this.transport?.isOpen) {
      await this.gracefulDisconnect();
    } else {
      this.disconnect(); // cleanup just in case
    }
    this.config = config;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= CASTLES_CONNECT_MAX_RETRIES; attempt++) {
      try {
        // Step 1: Create transport and connect
        this._createAndConnectTransport(config);
        await this.transport!.connect();

        // Step 1b: Optional post-connect delay (diagnostic tuning)
        if (this._postConnectDelayMs > 0) {
          console.log(`[CastlesService] Post-connect delay: ${this._postConnectDelayMs}ms`);
          await this._delay(this._postConnectDelayMs);
        }

        // Step 2: Clear any stuck state from previous session
        // CastlesPay is single-session — if the last socket died uncleanly
        // (app refresh, crash), the terminal ignores new commands until
        // return2Idle resets it. Timeout is expected if already idle.
        if (!this._skipReturn2Idle) {
          try {
            await this._sendAndReceive<Record<string, unknown>>(
              { txnPosTxnId: "000000", txnType: "return2Idle" },
              3000,
            );
            console.log(
              "[CastlesService] return2Idle accepted — terminal was stuck",
            );
          } catch {
            console.log(
              "[CastlesService] return2Idle no response — terminal was idle (OK)",
            );
          }

          // Step 3: Brief settle time after reset
          await this._delay(500);
        } else {
          console.log("[CastlesService] Skipping return2Idle (diagnostic override)");
        }

        // Step 4: Verify CastlesPay is responsive
        try {
          await this._sendAndReceive<Record<string, unknown>>(
            { txnPosTxnId: "000000", txnType: "getData" },
            CASTLES_GET_DATA_TIMEOUT_MS,
          );
        } catch (handshakeErr) {
          console.warn(
            `[CastlesService] getData handshake failed (attempt ${attempt}):`,
            handshakeErr instanceof Error
              ? handshakeErr.message
              : String(handshakeErr),
          );
          this.disconnect();
          throw handshakeErr;
        }

        console.log(
          `[CastlesService] Connected + verified: ${config.host}:${config.port} (attempt ${attempt})`,
        );
        return;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        console.warn(
          `[CastlesService] Attempt ${attempt}/${CASTLES_CONNECT_MAX_RETRIES} failed:`,
          lastError.message,
        );
        this.disconnect();

        if (attempt < CASTLES_CONNECT_MAX_RETRIES) {
          const delay = Math.min(
            CASTLES_CONNECT_RETRY_DELAY_MS * Math.pow(2, attempt - 1),
            10_000,
          );
          console.log(`[CastlesService] Retrying in ${delay}ms...`);
          await this._delay(delay);
        }
      }
    }

    throw new Error(
      `[CastlesService] Failed to connect after ${CASTLES_CONNECT_MAX_RETRIES} attempts: ${lastError?.message}`,
    );
  }

  /**
   * Disconnect and clean up the transport.
   */
  disconnect(): void {
    if (this.transport) {
      this.transport.disconnect();
      this.transport = null;
    }
    console.log("[CastlesService] Disconnected");
  }

  /**
   * Graceful disconnect: send return2Idle to reset terminal state,
   * then close the transport cleanly. This gives CastlesPay the best
   * chance to release the session so it accepts new connections.
   */
  async gracefulDisconnect(): Promise<void> {
    if (this.transport?.isOpen) {
      console.log("[CastlesService] Graceful disconnect: sending return2Idle before close...");
      try {
        const payload = JSON.stringify({
          txnPosTxnId: "000000",
          txnType: "return2Idle",
        });
        this.transport.write(payload + this._delimiter);
        // Wait for terminal to process return2Idle
        await this._delay(1000);
      } catch {
        // Best-effort — terminal may already be idle
      }
    }
    this.disconnect();
    // Extra settle time for terminal to fully release the session
    await this._delay(500);
  }

  /**
   * Check if transport is currently connected.
   */
  isConnected(): boolean {
    return this.transport?.isOpen ?? false;
  }

  setOnStatusNotification(callback: CastlesStatusCallback | null): void {
    this._onStatusNotification = callback;
  }

  // ── Diagnostic tuning setters ──

  setDelimiter(d: string): void { this._delimiter = d; }
  setNoDelay(enabled: boolean): void { this._noDelay = enabled; }
  setSkipReturn2Idle(skip: boolean): void { this._skipReturn2Idle = skip; }
  setPostConnectDelay(ms: number): void { this._postConnectDelayMs = ms; }

  // ============================================================
  // TCP DIAGNOSTICS
  // ============================================================

  /**
   * Diagnostic: test TCP connectivity and try sending a getData request
   * with multiple delimiter strategies. Logs everything to console.
   * Returns a detailed diagnostic report — use this to debug timeout issues.
   */
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

    // Step 1: TCP connect
    addLog(`Connecting to ${config.host}:${config.port}...`);
    try {
      // Force fresh connection for diagnosis
      this.disconnect();
      this.config = config;
      this._createAndConnectTransport(config);
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

    // Step 2: Try sending getData with different delimiters
    const request = JSON.stringify({
      txnPosTxnId: "000001",
      txnType: "getData",
    });
    const delimiters = [
      { label: "\\n (newline)", suffix: "\n" },
      { label: "\\r\\n (CRLF)", suffix: "\r\n" },
      { label: "\\0 (null byte)", suffix: "\0" },
      { label: "none (raw)", suffix: "" },
    ];

    for (const { label, suffix } of delimiters) {
      addLog(`--- Trying delimiter: ${label} ---`);
      addLog(`Sending: ${request}${suffix ? ` + ${label}` : ""}`);

      const result = await this._diagSend(request + suffix, 8000);

      if (result.received) {
        addLog(
          `SUCCESS! Received ${result.data.length} bytes: ${result.data.slice(0, 300)}`,
        );
        return {
          tcpConnected: true,
          dataReceived: true,
          delimiterUsed: label,
          rawResponse: result.data,
          log,
        };
      } else {
        addLog(
          `No response after 8s with delimiter ${label}. Buffer: "${result.data || "(empty)"}"`,
        );
      }

      // Small gap between attempts
      await this._delay(500);

      // Re-establish connection if closed
      if (!this.transport?.isOpen) {
        addLog("Transport closed — reconnecting for next attempt...");
        try {
          this._createAndConnectTransport(config);
          await this.transport!.connect();
          addLog("Reconnected");
        } catch (err) {
          addLog(
            `Reconnect failed: ${err instanceof Error ? err.message : String(err)}`,
          );
          break;
        }
      }
    }

    addLog("All delimiter attempts exhausted — no response from terminal");
    return {
      tcpConnected: true,
      dataReceived: false,
      error:
        "Terminal accepted TCP connection but did not respond to any delimiter format",
      log,
    };
  }

  /**
   * Low-level: send raw bytes and wait for any data back.
   * Used by diagnoseTcpConnection only.
   */
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
        // Wait a brief moment for full message, then resolve
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

      transport.write(payload);
    });
  }

  // ============================================================
  // SALE
  // ============================================================

  /**
   * Process a sale transaction on the Castles terminal.
   * Commands are queued via mutex — concurrent calls wait instead of rejecting.
   */
  async processSale(params: {
    amount: number;
    tipAmount?: number;
    referenceId: string;
  }): Promise<CastlesSaleResult> {
    if (!this.transport?.isOpen) {
      return { success: false, error: "Not connected to terminal" };
    }

    return this._mutex.runExclusive(async () => {
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

        await this._tryReturn2Idle();
        return {
          success: isApproved,
          raw,
          terminalResponse: buildCastlesTerminalResponse(raw, this.config?.terminalId),
          error: errorMsg,
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error("[CastlesService] processSale error:", message);
        await this._forceReturn2Idle();
        return {
          success: false,
          error: message,
        };
      }
    });
  }

  // ============================================================
  // TIP ADJUSTMENT
  // ============================================================

  /**
   * Adjust the tip on a previously approved sale.
   * Commands are queued via mutex — concurrent calls wait instead of rejecting.
   */
  async tipAdjust(params: {
    tipAmount: number;
    rrn: string;
    referenceId: string;
  }): Promise<CastlesTipAdjustResult> {
    if (!this.transport?.isOpen) {
      return { success: false, error: "Not connected to terminal" };
    }

    return this._mutex.runExclusive(async () => {
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

        const isApproved = raw.txnReturnCode === CASTLES_SUCCESS_CODE;
        const errorMsg = isApproved
          ? undefined
          : raw.txnStatusMessage ||
            parseCastlesReturnCode(raw.txnReturnCode).message;

        await this._tryReturn2Idle();
        return {
          success: isApproved,
          raw,
          terminalResponse: buildCastlesTerminalResponse(raw, this.config?.terminalId),
          error: errorMsg,
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error("[CastlesService] tipAdjust error:", message);
        await this._forceReturn2Idle();
        return { success: false, error: message };
      }
    });
  }

  // ============================================================
  // VOID
  // ============================================================

  /**
   * Void a previously approved transaction (before batch settlement).
   * At least one of rrn or stan must be provided.
   * Commands are queued via mutex — concurrent calls wait instead of rejecting.
   */
  async processVoid(params: {
    rrn?: string;
    stan?: string;
    referenceId: string;
  }): Promise<CastlesVoidResult> {
    if (!this.transport?.isOpen) {
      return { success: false, error: "Not connected to terminal" };
    }

    if (!params.rrn && !params.stan) {
      return { success: false, error: "At least one of rrn or stan is required for void" };
    }

    return this._mutex.runExclusive(async () => {
      try {
        const request: CastlesVoidRequest = {
          txnPosTxnId: params.referenceId,
          txnType: "void",
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
          terminalResponse: buildCastlesTerminalResponse(raw, this.config?.terminalId),
          error: errorMsg,
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error("[CastlesService] processVoid error:", message);
        await this._forceReturn2Idle();
        return { success: false, error: message };
      }
    });
  }

  // ============================================================
  // REFUND
  // ============================================================

  /**
   * Process a refund (after batch settlement).
   * Commands are queued via mutex — concurrent calls wait instead of rejecting.
   */
  async processRefund(params: {
    amount: number;
    referenceId: string;
  }): Promise<CastlesRefundResult> {
    if (!this.transport?.isOpen) {
      return { success: false, error: "Not connected to terminal" };
    }

    return this._mutex.runExclusive(async () => {
      try {
        const request: CastlesRefundRequest = {
          txnPosTxnId: params.referenceId,
          txnType: "refund",
          txnAmtTrans: params.amount.toFixed(2),
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
          terminalResponse: buildCastlesTerminalResponse(raw, this.config?.terminalId),
          error: errorMsg,
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error("[CastlesService] processRefund error:", message);
        await this._forceReturn2Idle();
        return { success: false, error: message };
      }
    });
  }

  // ============================================================
  // GET DATA
  // ============================================================

  /**
   * Send a getData command to retrieve terminal info (serial, firmware, TID/MID).
   * Uses a shorter timeout since getData responds quickly.
   * Commands are queued via mutex — concurrent calls wait instead of rejecting.
   */
  async getTerminalData(referenceId: string): Promise<CastlesGetDataResult> {
    if (!this.transport?.isOpen) {
      return { success: false, error: "Not connected to terminal" };
    }

    return this._mutex.runExclusive(async () => {
      try {
        const request: CastlesGetDataRequest = {
          txnPosTxnId: referenceId,
          txnType: "getData",
        };

        const raw = await this._sendAndReceive<CastlesGetDataResponse>(
          request as unknown as Record<string, unknown>,
          CASTLES_GET_DATA_TIMEOUT_MS,
        );

        // getData responses may omit txnReturnCode entirely — treat as success
        // if we got a valid parsed response with the expected txnType
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
  }

  // ============================================================
  // TERMINAL RECOVERY
  // ============================================================

  /**
   * Send return2Idle on the EXISTING transport to reset the terminal display.
   * Used after a completed transaction (success path) where the terminal
   * already responded — situation 1 in Castles spec §3.8.
   *
   * Best-effort: never throws, returns success boolean.
   * Called while mutex IS held — do not acquire mutex here.
   *
   * When `startup` is true, uses a shorter timeout (3s) because the terminal
   * won't respond to return2Idle if it's already idle (per Castles spec §3.8).
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
        // Terminal was already idle — no response is expected per spec §3.8
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
   * Force return2Idle by closing the transport and reconnecting on a fresh one.
   * Per Castles spec §3.8 situation 2: if the terminal is still in the
   * "Swipe/Insert/Tap card" period (e.g. command timed out), return2Idle
   * must be sent on a NEW socket — the old socket is stuck in the txn context.
   *
   * Best-effort: never throws, returns success boolean.
   * Called while mutex IS held — do not acquire mutex here.
   */
  private async _forceReturn2Idle(): Promise<boolean> {
    if (!this.config) return false;

    const config = this.config;
    console.log("[CastlesService] Force return2Idle: closing transport and reconnecting...");

    // Step 1: Tear down the current transport
    this.disconnect();

    // Step 2: Reconnect on a fresh transport
    try {
      this._createAndConnectTransport(config);
      await this.transport!.connect();
    } catch (err) {
      console.warn(
        "[CastlesService] Force return2Idle: reconnect failed:",
        err instanceof Error ? err.message : String(err),
      );
      return false;
    }

    // Step 3: Send return2Idle on the new transport
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
      // Terminal may already be idle after the socket reset — that's OK
      console.log(
        "[CastlesService] Force return2Idle: no response (terminal may already be idle)",
      );
      return true; // reconnect succeeded, terminal should be usable
    }
  }

  /**
   * Public recovery: acquire mutex and send return2Idle.
   * Call after fresh connect to clear any stuck-busy state.
   * If terminal is already idle, return2Idle gets no response (timeout expected).
   */
  async resetTerminalState(): Promise<boolean> {
    return this._mutex.runExclusive(() => this._tryReturn2Idle(true));
  }

  /**
   * Check if the command mutex is currently held (useful for UI status).
   */
  isLocked(): boolean {
    return this._mutex.isLocked();
  }

  // ============================================================
  // PRIVATE HELPERS
  // ============================================================

  /**
   * Create a new transport instance from the connection config.
   * Does NOT call connect() — caller must do that.
   */
  private _createAndConnectTransport(config: CastlesConnectionConfig): void {
    // Clean up any existing transport
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
   * Send a JSON request and wait for the matching response.
   *
   * Uses brace-depth counting to extract complete JSON objects from
   * the unframed TCP stream. This handles:
   * - Partial JSON split across multiple TCP chunks
   * - Multiple JSON objects arriving in one chunk
   * - Status notifications interleaved with the response
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
      let depth = 0; // brace nesting depth
      let inString = false; // inside a JSON string literal
      let escaped = false; // previous char was backslash
      let objectStart = -1; // index where current top-level object started
      let settled = false;

      const timer = setTimeout(() => {
        if (!settled) {
          settled = true;
          cleanup();
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
          return; // discard malformed object, keep waiting
        }

        // Status notification — log it but DON'T resolve, keep waiting
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

        // This is the actual response — resolve the Promise
        settled = true;
        cleanup();
        resolve(parsed as T);
      };

      const onData = (chunk: string) => {
        if (settled) return;

        console.log(
          `[CastlesService] Chunk (${chunk.length} bytes):`,
          chunk.slice(0, 200),
        );

        // ── Character-by-character brace-depth scanner ──
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

      // Send JSON request — delimiter configurable for diagnostics
      const payload = JSON.stringify(request);
      console.log("[CastlesService] Sending:", payload);
      transport.write(payload + this._delimiter);
    });
  }

  private _delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// ============================================================
// STANDALONE TCP PROBE (health check — no CastlesService instance)
// ============================================================

/**
 * Lightweight TCP reachability probe for health checks.
 * Creates an ephemeral transport (connect → immediate disconnect),
 * independent of the CastlesService class instance.
 * Never throws — always resolves { online, error? }.
 */
export async function probeCastlesTerminal(
  config: CastlesTransportConfig,
  timeoutMs = 5000,
): Promise<{ online: boolean; error?: string }> {
  try {
    const transport = createCastlesTransport({
      ...config,
      connectTimeoutMs: timeoutMs,
    });
    await transport.connect();
    transport.disconnect();
    return { online: true };
  } catch (err) {
    return {
      online: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
