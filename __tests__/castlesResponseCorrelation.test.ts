// Regression: a stale return2Idle / getData frame must NOT be parsed as
// the answer to an in-flight processSale. See incident ORD-20260603-S1-0013
// where a cancelled txn was persisted as Captured because the parser
// resolved on the first non-status JSON frame regardless of correlation.

import { CastlesService } from '@/services/terminals/castles-service';
import type { ICastlesTransport } from '@/services/terminals/castles-transport.types';

// ── Module mocks ───────────────────────────────────────────────────────────
// CastlesService pulls in MMKV-backed stores, Sentry, the supervisor, and the
// transport factory. We stub everything except the factory (which we replace
// with a controllable transport) so this stays a focused unit test.

jest.mock('@/services/refundJournal', () => ({
  updateRefundJournal: jest.fn(),
}));

jest.mock('@/stores/useTerminalConnectionStore', () => {
  const state = {
    quality: 'ok' as const,
    setQuality: jest.fn(),
    reset: jest.fn(),
  };
  return {
    useTerminalConnectionStore: {
      getState: () => state,
      subscribe: jest.fn(() => () => {}),
    },
  };
});

jest.mock('@/services/terminals/castlesConnectionSupervisor', () => ({
  CastlesEmptyResponseError: class CastlesEmptyResponseError extends Error {
    constructor (timeoutMs: number) {
      super(`Empty response after ${timeoutMs}ms`);
    }
  },
  CastlesWedgedError: class CastlesWedgedError extends Error {},
  getCastlesConnectionSupervisor: () => ({
    notifySuccess: jest.fn(),
    notifyEmptyBuffer: jest.fn(),
    notifyError: jest.fn(),
  }),
}));

jest.mock('@sentry/react-native', () => ({
  captureException: jest.fn(),
  captureMessage: jest.fn(),
}));

// Controllable in-memory transport. Tests `emit()` chunks at will, and the
// factory returns this same instance so we can drive both connect and command
// flows from the test body.
class MockFakeTransport implements ICastlesTransport {
  isOpen = false;
  private _dataCbs: ((chunk: string) => void)[] = [];
  private _errCbs: ((err: Error) => void)[] = [];
  private _closeCbs: ((hadError: boolean) => void)[] = [];
  /** Records the txnType of each write so a test can assert order. */
  writes: { txnType?: string; txnPosTxnId?: string; raw: string }[] = [];
  /** Optional hook fired after each write so tests can drive responses. */
  onWriteHook: ((parsed: Record<string, unknown>) => void) | null = null;

  async connect (): Promise<void> {
    this.isOpen = true;
  }
  disconnect (): void {
    this.isOpen = false;
    this._dataCbs = [];
    this._errCbs = [];
    this._closeCbs = [];
  }
  secondsSinceLastData (): number {
    return 0;
  }
  async write (data: string): Promise<void> {
    if (!this.isOpen) throw new Error('not open');
    let parsed: Record<string, unknown> = {};
    try { parsed = JSON.parse(data) as Record<string, unknown>; } catch { /* ignore */ }
    this.writes.push({
      txnType: parsed.txnType as string | undefined,
      txnPosTxnId: parsed.txnPosTxnId as string | undefined,
      raw: data,
    });
    this.onWriteHook?.(parsed);
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
  /** Test helper: emit a chunk to all registered onData listeners. */
  emit (chunk: string): void {
    for (const cb of [...this._dataCbs]) cb(chunk);
  }
}

let mockMockFakeTransport: MockFakeTransport | null = null;

jest.mock('@/services/terminals/castles-transport-factory', () => ({
  createCastlesTransport: () => mockMockFakeTransport ?? (mockMockFakeTransport = new MockFakeTransport()),
}));

// ── Test setup ─────────────────────────────────────────────────────────────

const SALE_REF = 'SALE-REF-12345';

const stale_return2idle_frame = JSON.stringify({
  // What a return2Idle ack looks like in the wild: 000000 reference, 00000000 success code.
  txnPosTxnId: '000000',
  txnType: 'return2Idle',
  txnReturnCode: '00000000',
});

const real_sale_cancel_frame = JSON.stringify({
  txnPosTxnId: SALE_REF,
  txnType: 'sale',
  txnReturnCode: 'E0000008', // user cancelled
  txnStatusMessage: 'User cancelled',
  txnApprovalCode: '',
  txnAmtBase: '190.58',
  txnAmtTip: '0.00',
  txnDateTime: '',
  txnMerchantId: '',
  txnTerminalId: '',
  txnCardAID: '',
  txnCardAppLabel: '',
  txnCardExpiry: '',
});

const real_sale_approved_frame = JSON.stringify({
  txnPosTxnId: SALE_REF,
  txnType: 'sale',
  txnReturnCode: '00000000',
  txnStatusMessage: 'Approved',
  txnApprovalCode: 'AB1234',
  txnAmtBase: '190.58',
  txnAmtTip: '0.00',
  txnDateTime: '20260602105612',
  txnMerchantId: 'M1',
  txnTerminalId: 'T1',
  txnCardAID: '',
  txnCardAppLabel: '',
  txnCardExpiry: '',
  txnCardBrand: 'VISA',
  txnMaskedCardNum: '4748 32** **** 9818',
  txnRrn: '600312345678',
});

async function connectedService (): Promise<{ svc: CastlesService; transport: MockFakeTransport }> {
  mockMockFakeTransport = null;
  const svc = new CastlesService();
  // Wire a synthetic handshake responder: any getData / return2Idle the service
  // sends during connect should receive a "healthy" reply so connect resolves.
  // Reply on the next microtask so the listener is registered first.
  const connectingTransport = (mockMockFakeTransport = new MockFakeTransport());
  connectingTransport.onWriteHook = (parsed) => {
    Promise.resolve().then(() => {
      const txnType = parsed.txnType as string | undefined;
      if (txnType === 'getData' || txnType === 'return2Idle') {
        connectingTransport.emit(JSON.stringify({
          txnPosTxnId: (parsed.txnPosTxnId as string) ?? '000000',
          txnType,
          txnReturnCode: '00000000',
        }));
      }
    });
  };
  await svc.connect({
    host: '127.0.0.1',
    port: 8080,
    connectionType: 'local_socket',
    timeout: 60_000,
    terminalId: 'test-terminal-id',
  });
  // Switch handshake responder off — tests drive responses manually now.
  connectingTransport.onWriteHook = null;
  connectingTransport.writes = [];
  return { svc, transport: connectingTransport };
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('Castles response correlation (incident ORD-20260603-S1-0013)', () => {
  beforeEach(() => {
    jest.useRealTimers();
  });

  it('discards a stale return2Idle frame and surfaces the real sale cancel response', async () => {
    const { svc, transport } = await connectedService();

    transport.onWriteHook = (parsed) => {
      if (parsed.txnType !== 'sale') return;
      Promise.resolve().then(() => {
        // Inject the bug's signature: stale return2Idle ack hits the
        // sale's wait window first, then the real cancel arrives.
        transport.emit(stale_return2idle_frame);
        transport.emit(real_sale_cancel_frame);
      });
    };

    const result = await svc.processSale({
      amount: 190.58,
      tipAmount: 0,
      referenceId: SALE_REF,
    });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/User cancelled/i);
  });

  it('discards a stale return2Idle frame and surfaces a real approved response when one follows', async () => {
    const { svc, transport } = await connectedService();

    transport.onWriteHook = (parsed) => {
      if (parsed.txnType !== 'sale') return;
      Promise.resolve().then(() => {
        transport.emit(stale_return2idle_frame);
        transport.emit(real_sale_approved_frame);
      });
    };

    const result = await svc.processSale({
      amount: 190.58,
      tipAmount: 0,
      referenceId: SALE_REF,
    });

    expect(result.success).toBe(true);
    expect(result.raw?.txnPosTxnId).toBe(SALE_REF);
    expect(result.raw?.txnReturnCode).toBe('00000000');
  });

  it('discards a sale-shaped response whose txnPosTxnId does not match the request, then accepts the real one', async () => {
    const { svc, transport } = await connectedService();

    transport.onWriteHook = (parsed) => {
      if (parsed.txnType !== 'sale') return;
      Promise.resolve().then(() => {
        // Same txnType, wrong refId — must be skipped. Then the real
        // response (matching refId) is accepted.
        transport.emit(JSON.stringify({
          txnPosTxnId: 'SOME-OTHER-REF',
          txnType: 'sale',
          txnReturnCode: '00000000',
          txnApprovalCode: 'X1',
        }));
        transport.emit(real_sale_cancel_frame);
      });
    };

    const result = await svc.processSale({
      amount: 190.58,
      tipAmount: 0,
      referenceId: SALE_REF,
    });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/User cancelled/i);
  });
});
