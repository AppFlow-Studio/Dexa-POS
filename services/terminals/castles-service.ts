// ============================================================
// Castles TCP Socket Service — Sale Flow
// File: services/terminals/castles-service.ts
// ============================================================
// POS is TCP client. Castles terminal is TCP server at IP:port.
// Socket kept alive between transactions (persistent connection).
// One request at a time — mutex guards concurrent calls.
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
import TcpSocket from "react-native-tcp-socket";
import {
  type CastlesRawResponse,
  buildCastlesTerminalResponse,
  parseCastlesReturnCode,
} from "./castles-response-mapper";

type TcpSocketInstance = ReturnType<typeof TcpSocket.createConnection>;

export type CastlesStatusCallback = (notification: {
  txnStatus?: string;
  txnStatusMessage?: string;
}) => void;

export class CastlesService {
  private socket: TcpSocketInstance | null = null;
  private config: CastlesConnectionConfig | null = null;
  private connected = false;
  private readonly _mutex = new Mutex();
  private _onStatusNotification: CastlesStatusCallback | null = null;

  // ── Connection tuning (for diagnostics) ──
  private _delimiter = "";           // Appended after JSON write ("", "\n", "\r\n", "\0")
  private _noDelay = false;          // TCP_NODELAY (disable Nagle)
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
      this.connected &&
      this.socket &&
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
    if (this.connected || this.socket) {
      await this.gracefulDisconnect();
    } else {
      this.disconnect(); // cleanup just in case
    }
    this.config = config;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= CASTLES_CONNECT_MAX_RETRIES; attempt++) {
      try {
        // Step 1: TCP connect
        await this._attemptConnect(config);

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
   * Disconnect and clean up the socket.
   * Delays destroy() so the TCP FIN from end() can propagate to the terminal.
   * Without this delay, CastlesPay thinks the session is still alive and
   * ignores commands on the next connection.
   */
  disconnect(): void {
    const oldSocket = this.socket;
    // Null out references FIRST to prevent race conditions
    this.socket = null;
    this.connected = false;

    if (oldSocket) {
      try {
        oldSocket.removeAllListeners();
        oldSocket.end(); // Send TCP FIN (graceful close)
        // Delay destroy to let FIN reach the terminal before force-closing
        setTimeout(() => {
          try { oldSocket.destroy(); } catch { /* already closed */ }
        }, 500);
      } catch {
        // Socket may already be destroyed
      }
    }
    console.log("[CastlesService] Disconnected");
  }

  /**
   * Graceful disconnect: send return2Idle to reset terminal state,
   * then close the socket cleanly. This gives CastlesPay the best
   * chance to release the session so it accepts new connections.
   */
  async gracefulDisconnect(): Promise<void> {
    if (this.connected && this.socket) {
      console.log("[CastlesService] Graceful disconnect: sending return2Idle before close...");
      try {
        const payload = JSON.stringify({
          txnPosTxnId: "000000",
          txnType: "return2Idle",
        });
        this.socket.write(payload + this._delimiter);
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
   * Check if socket is currently connected.
   */
  isConnected(): boolean {
    return this.connected && this.socket != null;
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
      await this._attemptConnect(config);
      addLog("TCP connection established successfully");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      addLog(`TCP connection FAILED: ${msg}`);
      return { tcpConnected: false, dataReceived: false, error: msg, log };
    }

    if (!this.socket) {
      addLog("Socket is null after connect — unexpected");
      return {
        tcpConnected: false,
        dataReceived: false,
        error: "Socket null",
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
      if (!this.connected || !this.socket) {
        addLog("Socket closed — reconnecting for next attempt...");
        try {
          await this._attemptConnect(config);
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
      if (!this.socket) {
        resolve({ received: false, data: "" });
        return;
      }

      let buffer = "";
      let settled = false;

      const timer = setTimeout(() => {
        if (!settled) {
          settled = true;
          cleanup();
          resolve({ received: false, data: buffer });
        }
      }, timeoutMs);

      const onData = (data: string | Buffer) => {
        buffer += typeof data === "string" ? data : data.toString("utf8");
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
        this.socket?.removeListener("data", onData);
        this.socket?.removeListener("error", onError);
        this.socket?.removeListener("close", onClose);
      };

      this.socket.on("data", onData);
      this.socket.on("error", onError);
      this.socket.on("close", onClose);

      this.socket.write(payload);
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
    if (!this.connected || !this.socket) {
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
    if (!this.connected || !this.socket) {
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
    if (!this.connected || !this.socket) {
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
    if (!this.connected || !this.socket) {
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
    if (!this.connected || !this.socket) {
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
   * Send return2Idle on the EXISTING socket to reset the terminal display.
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
    if (!this.connected || !this.socket) return false;

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
   * Force return2Idle by closing the socket and reconnecting on a fresh one.
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
    console.log("[CastlesService] Force return2Idle: closing socket and reconnecting...");

    // Step 1: Tear down the current socket
    this.disconnect();

    // Step 2: Reconnect on a fresh socket
    try {
      await this._attemptConnect(config);
    } catch (err) {
      console.warn(
        "[CastlesService] Force return2Idle: reconnect failed:",
        err instanceof Error ? err.message : String(err),
      );
      return false;
    }

    // Step 3: Send return2Idle on the new socket
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

  private _attemptConnect(config: CastlesConnectionConfig): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      let settled = false;

      const timeout = setTimeout(() => {
        if (!settled) {
          settled = true;
          try {
            socket?.destroy();
          } catch {
            /* ignore */
          }
          reject(new Error("Connection timed out"));
        }
      }, CASTLES_CONNECT_TIMEOUT_MS);

      const socket = TcpSocket.createConnection(
        { host: config.host, port: config.port },
        () => {
          if (settled) return;
          settled = true;
          clearTimeout(timeout);

          this.socket = socket;
          this.connected = true;

          // Apply TCP_NODELAY if diagnostic tuning requests it
          if (this._noDelay) {
            try { socket.setNoDelay(true); } catch { /* ignore */ }
          }

          // ── Persistent lifecycle listeners ──
          // These stay for the life of the socket.
          // Per-command data listeners are added/removed in _sendAndReceive.

          // ── CRITICAL: Guard against stale socket events ──
          // The close/error handlers must check that THIS socket
          // is still the active one. Without this check, a delayed
          // close event from a PREVIOUS socket nulls out the new one.

          socket.on("close", (hadError: boolean) => {
            if (this.socket !== socket) {
              console.log("[CastlesService] Ignoring close from stale socket");
              return; // ← This is the fix
            }
            console.warn(
              `[CastlesService] Socket closed (hadError: ${hadError})`,
            );
            this.connected = false;
            this.socket = null;
          });

          socket.on("error", (err: Error) => {
            if (this.socket !== socket) {
              console.log("[CastlesService] Ignoring error from stale socket");
              return; // ← This too
            }
            console.error("[CastlesService] Socket error:", err.message);
            this.connected = false;
          });

          resolve();
        },
      );

      // Error during initial connection attempt
      socket.on("error", (err: Error) => {
        if (!settled) {
          settled = true;
          clearTimeout(timeout);
          reject(err);
        }
      });
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
      if (!this.socket) {
        reject(new Error("Socket not available"));
        return;
      }

      // Capture reference — if socket changes during this command,
      // we're operating on a stale connection
      const activeSocket = this.socket;

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
          // NOTE: We do NOT touch the buffer here — brace parser
          // already extracted this object cleanly. No data loss.
          return;
        }

        // This is the actual response — resolve the Promise
        settled = true;
        cleanup();
        resolve(parsed as T);
      };

      const onData = (data: string | Buffer) => {
        if (settled) return;

        const chunk = typeof data === "string" ? data : data.toString("utf8");

        console.log(
          `[CastlesService] Chunk (${chunk.length} bytes):`,
          chunk.slice(0, 200),
        );

        // ── Character-by-character brace-depth scanner ──
        // This is the ONLY reliable way to parse unframed JSON over TCP.
        for (let i = 0; i < chunk.length; i++) {
          const char = chunk[i];
          buffer += char;

          if (escaped) {
            // Previous char was \, this char is escaped — skip it
            escaped = false;
            continue;
          }

          if (char === "\\" && inString) {
            // Next char is escaped
            escaped = true;
            continue;
          }

          if (char === '"' && !escaped) {
            inString = !inString;
            continue;
          }

          // Only count braces outside of string literals
          if (!inString) {
            if (char === "{") {
              if (depth === 0) {
                // Start of a new top-level JSON object
                objectStart = buffer.length - 1;
              }
              depth++;
            } else if (char === "}") {
              depth--;

              if (depth === 0 && objectStart >= 0) {
                // Complete top-level JSON object found
                const jsonStr = buffer.slice(objectStart);

                // Reset buffer: keep only what's after this object
                // (there shouldn't be anything, but defensive)
                buffer = "";
                objectStart = -1;

                processCompleteObject(jsonStr);

                if (settled) return; // response found, stop processing
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
          reject(new Error("Socket closed before response was received"));
        }
      };

      const cleanup = () => {
        clearTimeout(timer);
        activeSocket?.removeListener("data", onData);
        activeSocket?.removeListener("error", onError);
        activeSocket?.removeListener("close", onClose);
      };

      activeSocket.on("data", onData);
      activeSocket.on("error", onError);
      activeSocket.on("close", onClose);

      // Send JSON request — delimiter configurable for diagnostics
      const payload = JSON.stringify(request);
      console.log("[CastlesService] Sending:", payload);
      activeSocket.write(payload + this._delimiter);
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
 * Creates an ephemeral socket (connect → immediate disconnect),
 * independent of the CastlesService class instance.
 * Never throws — always resolves { online, error? }.
 */
export async function probeCastlesTerminal(
  host: string,
  port: number,
  timeoutMs = 5000,
): Promise<{ online: boolean; error?: string }> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      try {
        socket?.destroy();
      } catch {
        /* ignore */
      }
      resolve({ online: false, error: "Connection timed out" });
    }, timeoutMs);

    const socket = TcpSocket.createConnection({ host, port }, () => {
      clearTimeout(timer);
      try {
        socket.destroy();
      } catch {
        /* ignore */
      }
      resolve({ online: true });
    });

    socket.on("error", (err: Error) => {
      clearTimeout(timer);
      try {
        socket.destroy();
      } catch {
        /* ignore */
      }
      resolve({ online: false, error: err.message });
    });
  });
}
