// ============================================================
// Castles Mock Transport — scriptable in-memory fake for iteration
// File: services/terminals/castles-transport-mock.ts
// ============================================================
// Implements ICastlesTransport so CastlesService talks to it just like
// the real TCP / USB transports. The point is to reproduce every Castles
// failure mode (wedge, detach, slow, refused, permission denied) on iOS
// Simulator / Android Emulator with zero hardware, so the supervisor,
// modal, banner, and setup-wizard UX can iterate at hot-reload speed.
//
// Scenario is set globally via setCastlesMockScenario() and read by the
// transport factory when EXPO_PUBLIC_CASTLES_MOCK is truthy. In a
// production build the factory branch is never taken, so this file is
// effectively dead code with no runtime cost.
// ============================================================

import type { ICastlesTransport } from './castles-transport.types';

export type CastlesMockScenario =
  | 'healthy'                // connect ok, replies to every command
  | 'connect_timeout'        // connect() never resolves until timeout
  | 'connect_refused'        // connect() rejects with ECONNREFUSED
  | 'wedge_empty_buffer'     // connect ok, writes ok, NO response ever (the live merchant bug)
  | 'wedge_after_first_sale' // first sale ok, then wedge — for testing supervisor mid-session
  | 'slow_response'          // valid responses but 2.5s delay each
  | 'detach_mid_sale'        // healthy until 1.5s into the first write, then close-with-error
  | 'permission_denied';     // connect() rejects with USB permission-denied error

let _currentScenario: CastlesMockScenario = 'healthy';
/** Counter so wedge_after_first_sale knows when to flip. */
let _commandsSinceConnect = 0;

export function setCastlesMockScenario (scenario: CastlesMockScenario): void {
  _currentScenario = scenario;
  _commandsSinceConnect = 0;
  console.log(`[CastlesMock] scenario set → ${scenario}`);
}

export function getCastlesMockScenario (): CastlesMockScenario {
  return _currentScenario;
}

/**
 * Built a stock JSON response that satisfies the parser. We don't need to
 * be protocol-accurate field-by-field — CastlesService just needs *some*
 * JSON object back that isn't a `status` notification.
 */
function buildMockResponse (request: Record<string, unknown>): string {
  const txnType = request.txnType as string | undefined;
  const txnPosTxnId = request.txnPosTxnId as string | undefined;
  const base: Record<string, unknown> = {
    txnPosTxnId: txnPosTxnId ?? '000000',
    txnType: txnType ?? 'unknown',
    txnReturnCode: '00',
    txnApprovalCode: 'MOCK01',
  };
  if (txnType === 'getData') {
    base.infSN = 'MOCK-SN-123456';
    base.infAppVersion = 'CastlesMock 1.0.0';
    base.infBatteryLevel = '92';
  }
  if (txnType === 'sale') {
    base.amountBase = (request.amountBase ?? '100') as string;
    base.referenceId = `MOCK-REF-${Date.now()}`;
    base.cardType = 'VISA';
    base.lastFour = '4242';
  }
  return JSON.stringify(base);
}

export class CastlesMockTransport implements ICastlesTransport {
  private _isOpen = false;
  private _lastDataAt = 0;
  private _dataCallbacks: ((chunk: string) => void)[] = [];
  private _errorCallbacks: ((error: Error) => void)[] = [];
  private _closeCallbacks: ((hadError: boolean) => void)[] = [];
  /** Timers we may need to clear on disconnect. */
  private _timers = new Set<ReturnType<typeof setTimeout>>();

  get isOpen (): boolean {
    return this._isOpen;
  }

  secondsSinceLastData (): number {
    if (this._lastDataAt === 0) return Infinity;
    return (Date.now() - this._lastDataAt) / 1000;
  }

  connect (): Promise<void> {
    _commandsSinceConnect = 0;

    if (_currentScenario === 'connect_refused') {
      return Promise.reject(new Error('connect ECONNREFUSED (mock)'));
    }
    if (_currentScenario === 'permission_denied') {
      return Promise.reject(
        new Error('USB permission denied (mock). Allow USB access and try again.'),
      );
    }
    if (_currentScenario === 'connect_timeout') {
      // Never resolves — caller's own timeout (CASTLES_CONNECT_TIMEOUT_MS) wins.
      return new Promise<void>(() => {
        // Intentionally pending forever for this scenario.
      });
    }
    // Default: connect succeeds in ~30ms.
    return new Promise<void>((resolve) => {
      const t = setTimeout(() => {
        this._timers.delete(t);
        this._isOpen = true;
        this._lastDataAt = Date.now();
        resolve();
      }, 30);
      this._timers.add(t);
    });
  }

  disconnect (): void {
    this._isOpen = false;
    for (const t of this._timers) clearTimeout(t);
    this._timers.clear();
    this._dataCallbacks = [];
    this._errorCallbacks = [];
    this._closeCallbacks = [];
  }

  write (data: string): Promise<void> {
    if (!this._isOpen) {
      return Promise.reject(new Error('Transport is not open'));
    }
    _commandsSinceConnect += 1;

    let parsed: Record<string, unknown> | null = null;
    try {
      parsed = JSON.parse(data) as Record<string, unknown>;
    } catch {
      // CastlesService only writes JSON; if this fails, fall through to default.
    }
    const txnType = parsed?.txnType as string | undefined;

    // Wedge scenarios — write resolves, but no data ever comes back.
    const isWedge =
      _currentScenario === 'wedge_empty_buffer' ||
      (_currentScenario === 'wedge_after_first_sale' && _commandsSinceConnect > 1);
    if (isWedge) {
      return Promise.resolve();
    }

    // Detach mid-sale: write resolves, then we fire close-with-error after a delay.
    if (_currentScenario === 'detach_mid_sale' && txnType === 'sale') {
      const t = setTimeout(() => {
        this._timers.delete(t);
        this._isOpen = false;
        for (const cb of [...this._closeCallbacks]) {
          try { cb(true); } catch { /* ignore */ }
        }
      }, 1500);
      this._timers.add(t);
      return Promise.resolve();
    }

    // Normal response delay (or slow for the slow scenario).
    const responseDelayMs = _currentScenario === 'slow_response' ? 2500 : 50;

    const t = setTimeout(() => {
      this._timers.delete(t);
      if (!this._isOpen || !parsed) return;
      this._lastDataAt = Date.now();
      const reply = buildMockResponse(parsed);
      for (const cb of [...this._dataCallbacks]) {
        try { cb(reply); } catch { /* ignore */ }
      }
    }, responseDelayMs);
    this._timers.add(t);

    return Promise.resolve();
  }

  // ── Listener management ──

  onData (cb: (chunk: string) => void): void {
    this._dataCallbacks.push(cb);
  }
  onError (cb: (error: Error) => void): void {
    this._errorCallbacks.push(cb);
  }
  onClose (cb: (hadError: boolean) => void): void {
    this._closeCallbacks.push(cb);
  }
  offData (cb: (chunk: string) => void): void {
    const i = this._dataCallbacks.indexOf(cb);
    if (i !== -1) this._dataCallbacks.splice(i, 1);
  }
  offError (cb: (error: Error) => void): void {
    const i = this._errorCallbacks.indexOf(cb);
    if (i !== -1) this._errorCallbacks.splice(i, 1);
  }
  offClose (cb: (hadError: boolean) => void): void {
    const i = this._closeCallbacks.indexOf(cb);
    if (i !== -1) this._closeCallbacks.splice(i, 1);
  }
  removeAllListeners (): void {
    this._dataCallbacks = [];
    this._errorCallbacks = [];
    this._closeCallbacks = [];
  }
}
