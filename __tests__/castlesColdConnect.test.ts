// Replug recovery: a freshly plugged / power-cycled Castles terminal returns
// 0 bytes while CastlesPay is still booting (~5-10s) — indistinguishable from
// the app-layer "wedge" signature. On the background auto-connect path
// (config.coldConnect === true) that boot-window empty buffer must NOT be
// classified as a wedge: it must not hand off to the supervisor (which would
// markWedged + pop the power-cycle modal + start the slow 15s probe loop), and
// it must surface as a plain retryable failure so the coordinator's retry
// ladder tries again once the app is up.
//
// User-initiated / warm paths (coldConnect falsy) keep the wedge detection so a
// genuinely frozen terminal still surfaces the power-cycle modal.

import { CastlesService } from '@/services/terminals/castles-service';
import type { ICastlesTransport } from '@/services/terminals/castles-transport.types';

// ── Module mocks ───────────────────────────────────────────────────────────

jest.mock('@/services/refundJournal', () => ({
  updateRefundJournal: jest.fn(),
}));

jest.mock('@/stores/useTerminalConnectionStore', () => {
  const state = {
    quality: 'ok' as const,
    setQuality: jest.fn(),
    reset: jest.fn(),
    markWedged: jest.fn(),
    clearWedge: jest.fn(),
    setConnectActivity: jest.fn(),
  };
  return {
    useTerminalConnectionStore: {
      getState: () => state,
      subscribe: jest.fn(() => () => {}),
    },
  };
});

// Stable supervisor spy so we can assert notifyEmptyBuffer across connects.
const mockNotifyEmptyBuffer = jest.fn();
const mockNotifySuccess = jest.fn();

jest.mock('@/services/terminals/castlesConnectionSupervisor', () => ({
  CastlesEmptyResponseError: class CastlesEmptyResponseError extends Error {
    readonly isCastlesEmptyResponseError = true as const;
    constructor (timeoutMs: number) {
      super(`Empty response after ${timeoutMs}ms (0 bytes received)`);
      this.name = 'CastlesEmptyResponseError';
    }
  },
  CastlesWedgedError: class CastlesWedgedError extends Error {
    readonly isCastlesWedgedError = true as const;
    constructor (message = 'wedged') {
      super(message);
      this.name = 'CastlesWedgedError';
    }
  },
  getCastlesConnectionSupervisor: () => ({
    notifySuccess: mockNotifySuccess,
    notifyEmptyBuffer: mockNotifyEmptyBuffer,
    notifyError: jest.fn(),
  }),
}));

jest.mock('@sentry/react-native', () => ({
  captureException: jest.fn(),
  captureMessage: jest.fn(),
}));

// Controllable transport. return2Idle gets an immediate healthy reply so the
// connect reaches the getData handshake quickly; getData gets NO reply, so the
// handshake times out with a 0-byte buffer → CastlesEmptyResponseError (the
// "terminal still booting" signature).
class MockBootingTransport implements ICastlesTransport {
  isOpen = false;
  private _dataCbs: ((chunk: string) => void)[] = [];
  private _errCbs: ((err: Error) => void)[] = [];
  private _closeCbs: ((hadError: boolean) => void)[] = [];

  async connect (): Promise<void> { this.isOpen = true; }
  disconnect (): void {
    this.isOpen = false;
    this._dataCbs = [];
    this._errCbs = [];
    this._closeCbs = [];
  }
  secondsSinceLastData (): number { return 0; }
  async write (data: string): Promise<void> {
    if (!this.isOpen) throw new Error('not open');
    let parsed: Record<string, unknown> = {};
    try { parsed = JSON.parse(data) as Record<string, unknown>; } catch { /* ignore */ }
    if (parsed.txnType === 'return2Idle') {
      // Wake ack arrives — terminal's serial is up, but the app isn't reading
      // for real txns yet.
      Promise.resolve().then(() => {
        this.emit(JSON.stringify({
          txnPosTxnId: (parsed.txnPosTxnId as string) ?? '000000',
          txnType: 'return2Idle',
          txnReturnCode: '00000000',
        }));
      });
    }
    // getData: intentionally no response → empty-buffer timeout.
  }
  onData (cb: (chunk: string) => void): void { this._dataCbs.push(cb); }
  onError (cb: (err: Error) => void): void { this._errCbs.push(cb); }
  onClose (cb: (hadError: boolean) => void): void { this._closeCbs.push(cb); }
  offData (cb: (chunk: string) => void): void {
    const i = this._dataCbs.indexOf(cb);
    if (i !== -1) this._dataCbs.splice(i, 1);
  }
  offError (cb: (err: Error) => void): void {
    const i = this._errCbs.indexOf(cb);
    if (i !== -1) this._errCbs.splice(i, 1);
  }
  offClose (cb: (hadError: boolean) => void): void {
    const i = this._closeCbs.indexOf(cb);
    if (i !== -1) this._closeCbs.splice(i, 1);
  }
  removeAllListeners (): void {
    this._dataCbs = [];
    this._errCbs = [];
    this._closeCbs = [];
  }
  emit (chunk: string): void {
    for (const cb of [...this._dataCbs]) cb(chunk);
  }
}

let mockMockBootingTransport: MockBootingTransport | null = null;

jest.mock('@/services/terminals/castles-transport-factory', () => ({
  createCastlesTransport: () =>
    mockMockBootingTransport ?? (mockMockBootingTransport = new MockBootingTransport()),
}));

// ── Tests ──────────────────────────────────────────────────────────────────

const baseConfig = {
  connectionType: 'usb' as const,
  timeout: 60_000,
  terminalId: 'test-terminal-id',
};

describe('Castles cold-connect boot tolerance (replug recovery)', () => {
  beforeEach(() => {
    jest.useRealTimers();
    mockMockBootingTransport = null;
    mockNotifyEmptyBuffer.mockClear();
    mockNotifySuccess.mockClear();
  });

  it('cold connect: a boot-window empty buffer fails plainly WITHOUT flagging a wedge', async () => {
    const svc = new CastlesService();

    await expect(
      svc.connect({ ...baseConfig, coldConnect: true }),
    ).rejects.toThrow(/Failed to connect after 1 attempt/i);

    // The whole point: never hand off to the wedge supervisor on a cold connect.
    expect(mockNotifyEmptyBuffer).not.toHaveBeenCalled();
  }, 20_000);

  it('warm connect: the same empty buffer IS classified as a wedge', async () => {
    const svc = new CastlesService();

    await expect(
      svc.connect({ ...baseConfig, coldConnect: false }),
    ).rejects.toThrow(/wedged/i);

    expect(mockNotifyEmptyBuffer).toHaveBeenCalledTimes(1);
  }, 20_000);
});
