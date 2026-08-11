// ============================================================
// Valor Mock Transport — scriptable in-memory fake for iteration
// File: services/terminals/valor-transport-mock.ts
// ============================================================
// Implements ITerminalTransport so ValorService talks to it exactly like the
// real TCP transport. It reproduces Valor's framed handshake choreography
//   ACK -> "Payload Request Received"(STAN_NO) -> final -> (POS trailing ACK)
// plus the money-path edge cases (drop-after-STAN, partial approval, decline,
// indeterminate STATE=-2, cancel-cleared, TRAN_MODE 90 recovery) so the
// service state machine + recovery can be exercised with zero hardware.
//
// Scenario is global (set via setValorMockScenario) and read by the transport
// factory when the mock is enabled. Auxiliary commands (TERMINAL_QUERY 96,
// TRANSACTION_STATUS 90, CANCEL 99) respond based on request content so a
// single scenario can drive a full sale→drop→recover sequence across the
// separate sockets the service opens.
// ============================================================

import type { ITerminalTransport } from "./valor-transport.types";
import { encodeValorFrame } from "./valor-framing";
import {
  VALOR_TRAN_MODE,
  VALOR_STX,
  VALOR_ETX,
  type ValorRawResponse,
  type ValorRequestBody,
} from "@/types/valor";

export type ValorMockScenario =
  | "healthy"                  // sale approves; 96/90/99 cooperative
  | "connect_timeout"          // connect() never resolves
  | "connect_refused"          // connect() rejects
  | "decline"                  // sale final STATE "-1"
  | "partial_approval"         // sale final STATE "0" + PARTIAL "1"
  | "cleared_state"            // sale final STATE "-2" (indeterminate)
  | "drop_after_stan"          // sale: ACK + Payload-Received, then socket closes; 90 -> approved
  | "drop_after_stan_unknown"  // sale drops after STAN; 90 -> unknown (no record)
  | "cancel_cleared"           // sale drops after STAN; CANCEL(99) -> cleared
  | "no_ack"                   // write ok but no ACK ever (request never landed)
  | "no_stan"                  // ACK, then Payload-Received WITHOUT STAN_NO
  | "slow_response";           // valid but 2.5s final-response delay

let _scenario: ValorMockScenario = "healthy";
let _stanSeq = 0;

export function setValorMockScenario(scenario: ValorMockScenario): void {
  _scenario = scenario;
  _stanSeq = 0;
  console.log(`[ValorMock] scenario set → ${scenario}`);
}

export function getValorMockScenario(): ValorMockScenario {
  return _scenario;
}

function nextStan(): string {
  _stanSeq += 1;
  return String(_stanSeq);
}

/** Strip STX/ETX and parse a framed request the service wrote. */
function parseFramedRequest(data: string): ValorRequestBody | null {
  let body = data;
  const stx = body.lastIndexOf(VALOR_STX);
  if (stx !== -1) body = body.slice(stx + 1);
  const etx = body.indexOf(VALOR_ETX);
  if (etx !== -1) body = body.slice(0, etx);
  try {
    return JSON.parse(body.trim()) as ValorRequestBody;
  } catch {
    return null;
  }
}

function ackFrame(): string {
  return encodeValorFrame({ STATE: "0", MSG: "ACK" });
}

function payloadReceivedFrame(stan: string | null): string {
  const body: ValorRawResponse = {
    STATE: "0",
    SERIAL_NO: "MOCK-VALOR-SN-0001",
    EPI: "2319900000",
    MSG: "Payload Request Received",
  };
  if (stan != null) body.STAN_NO = stan;
  return encodeValorFrame(body);
}

function buildApprovedSale(
  req: ValorRequestBody,
  opts: { state?: string; partial?: boolean; stan?: string; tranNo?: string } = {},
): ValorRawResponse {
  const requested = String(req.AMOUNT ?? "1000");
  const approved = opts.partial
    ? String(Math.floor(Number(requested) / 2))
    : requested;
  return {
    STATE: opts.state ?? "0",
    EPI: "2319900000",
    SERIAL_NO: "MOCK-VALOR-SN-0001",
    TRAN_TYPE: "Credit",
    TRAN_METHOD: "Sale",
    TXN_ID: `MOCK-TXN-${opts.stan ?? "0"}`,
    TRAN_NO: opts.tranNo ?? "20",
    STAN_NO: opts.stan,
    STAN_ID: opts.stan,
    AMOUNT: approved,
    TIP_AMOUNT: String(req.TIP_AMOUNT ?? "0"),
    TOTAL_AMOUNT: approved,
    PARTIAL: opts.partial ? "1" : "0",
    MASKED_PAN: "4160 **** **** 5103",
    ENTRY_MODE: "TAP",
    EXPIRY_DATE: "2607",
    RRN: "514712500424",
    CODE: "TAS706",
    AUTH_RSP_TEXT: "APPROVAL TAS706",
    DATE: "14072026 08:36:02",
    BATCH_NO: "78",
    AID: "A0000000031010",
    ISSUER: "VISA",
    CARD_BRAND: "VISA",
    MER_TXN_ID: String(req.REQ_TXN_ID ?? ""),
    REQ_TXN_ID: String(req.REQ_TXN_ID ?? ""),
  };
}

export class ValorMockTransport implements ITerminalTransport {
  private _isOpen = false;
  private _lastDataAt = 0;
  private _dataCallbacks: ((chunk: string) => void)[] = [];
  private _errorCallbacks: ((error: Error) => void)[] = [];
  private _closeCallbacks: ((hadError: boolean) => void)[] = [];
  private _timers = new Set<ReturnType<typeof setTimeout>>();

  get isOpen(): boolean {
    return this._isOpen;
  }

  secondsSinceLastData(): number {
    if (this._lastDataAt === 0) return Infinity;
    return (Date.now() - this._lastDataAt) / 1000;
  }

  connect(): Promise<void> {
    if (_scenario === "connect_refused") {
      return Promise.reject(new Error("connect ECONNREFUSED (mock)"));
    }
    if (_scenario === "connect_timeout") {
      return new Promise<void>(() => { /* pending forever */ });
    }
    return new Promise<void>((resolve) => {
      const t = setTimeout(() => {
        this._timers.delete(t);
        this._isOpen = true;
        this._lastDataAt = Date.now();
        resolve();
      }, 20);
      this._timers.add(t);
    });
  }

  disconnect(): void {
    this._isOpen = false;
    for (const t of this._timers) clearTimeout(t);
    this._timers.clear();
    this._dataCallbacks = [];
    this._errorCallbacks = [];
    this._closeCallbacks = [];
  }

  private _emit(frame: string): void {
    if (!this._isOpen) return;
    this._lastDataAt = Date.now();
    for (const cb of [...this._dataCallbacks]) {
      try { cb(frame); } catch { /* ignore */ }
    }
  }

  private _schedule(fn: () => void, ms: number): void {
    const t = setTimeout(() => {
      this._timers.delete(t);
      fn();
    }, ms);
    this._timers.add(t);
  }

  private _closeWithError(): void {
    this._isOpen = false;
    for (const cb of [...this._closeCallbacks]) {
      try { cb(true); } catch { /* ignore */ }
    }
  }

  write(data: string): Promise<void> {
    if (!this._isOpen) return Promise.reject(new Error("Transport is not open"));

    const req = parseFramedRequest(data);
    // Trailing ACK from the POS (no TRAN_MODE) — nothing to reply to.
    if (!req || req.TRAN_MODE == null) return Promise.resolve();

    const mode = String(req.TRAN_MODE);

    // ── Auxiliary commands (single-frame responses) ──
    if (mode === VALOR_TRAN_MODE.TERMINAL_QUERY) {
      this._schedule(() => this._emit(encodeValorFrame({
        STATE: "0",
        SERIAL_NO: "MOCK-VALOR-SN-0001",
        EPI: "2319900000",
        APP_VERSION: "v3.0.27",
        DATETIME: "07/14/2026 08:16:33",
      })), 30);
      return Promise.resolve();
    }

    if (mode === VALOR_TRAN_MODE.TRANSACTION_STATUS) {
      const stan = String(req.STAN_NO ?? "");
      const unknown = _scenario === "drop_after_stan_unknown";
      this._schedule(() => this._emit(
        unknown
          ? encodeValorFrame({ STATE: "-1", ERROR_CODE: "V0404", ERROR_MSG: "Transaction Not Found", STAN_NO: stan })
          : encodeValorFrame(buildApprovedSale(req, { stan, tranNo: "20" })),
      ), 40);
      return Promise.resolve();
    }

    if (mode === VALOR_TRAN_MODE.CANCEL) {
      this._schedule(() => this._emit(encodeValorFrame({
        STATE: "-1",
        ERROR_MSG: "TRANSACTION CLEARED SUCCESSFULLY",
        MER_TXN_ID: String(req.REQ_TXN_ID ?? ""),
      })), 30);
      return Promise.resolve();
    }

    // ── Transaction commands (full handshake) ──
    if (_scenario === "no_ack") {
      // Write lands but nothing ever comes back — the request never reached the app.
      return Promise.resolve();
    }

    const stan = _scenario === "no_stan" ? null : nextStan();

    this._schedule(() => this._emit(ackFrame()), 10);
    this._schedule(() => this._emit(payloadReceivedFrame(stan)), 25);

    if (_scenario === "drop_after_stan" || _scenario === "drop_after_stan_unknown" || _scenario === "cancel_cleared") {
      // Socket dies after the terminal acknowledged the request — the sale
      // may still be completing on the terminal; recovery via TRAN_MODE 90.
      this._schedule(() => this._closeWithError(), 45);
      return Promise.resolve();
    }

    const finalDelay = _scenario === "slow_response" ? 2500 : 45;
    this._schedule(() => {
      if (!req) return;
      if (_scenario === "decline") {
        this._emit(encodeValorFrame({
          STATE: "-1",
          EPI: "2319900000",
          SERIAL_NO: "MOCK-VALOR-SN-0001",
          ERROR_CODE: "V0005",
          ERROR_MSG: "Do Not Honor",
          STAN_NO: stan ?? undefined,
          MER_TXN_ID: String(req.REQ_TXN_ID ?? ""),
        }));
        return;
      }
      const state =
        _scenario === "cleared_state" ? "-2" : "0";
      this._emit(encodeValorFrame(buildApprovedSale(req, {
        state,
        partial: _scenario === "partial_approval",
        stan: stan ?? undefined,
        tranNo: "20",
      })));
    }, finalDelay);

    return Promise.resolve();
  }

  onData(cb: (chunk: string) => void): void { this._dataCallbacks.push(cb); }
  onError(cb: (error: Error) => void): void { this._errorCallbacks.push(cb); }
  onClose(cb: (hadError: boolean) => void): void { this._closeCallbacks.push(cb); }
  offData(cb: (chunk: string) => void): void {
    const i = this._dataCallbacks.indexOf(cb);
    if (i !== -1) this._dataCallbacks.splice(i, 1);
  }
  offError(cb: (error: Error) => void): void {
    const i = this._errorCallbacks.indexOf(cb);
    if (i !== -1) this._errorCallbacks.splice(i, 1);
  }
  offClose(cb: (hadError: boolean) => void): void {
    const i = this._closeCallbacks.indexOf(cb);
    if (i !== -1) this._closeCallbacks.splice(i, 1);
  }
  removeAllListeners(): void {
    this._dataCallbacks = [];
    this._errorCallbacks = [];
    this._closeCallbacks = [];
  }
}
