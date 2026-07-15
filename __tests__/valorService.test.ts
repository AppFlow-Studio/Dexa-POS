// ValorService state-machine + recovery tests (Wave 3 / Wave 4 service layer).
//
// The transport factory is mocked so we can swap in (a) the realistic scenario
// mock for happy/partial/decline/recovery/cancel and (b) a bespoke scripted
// transport for the stale-frame + missing-STAN edge cases — no hardware, no
// MMKV, no native TCP.

import type { ITerminalTransport } from "@/services/terminals/valor-transport.types";
import {
  ValorMockTransport,
  setValorMockScenario,
} from "@/services/terminals/valor-transport-mock";
import { encodeValorFrame } from "@/services/terminals/valor-framing";
import { VALOR_STX, VALOR_ETX } from "@/types/valor";

// Holder so individual tests can override what the factory returns.
const mockTransportImpl: { current: () => ITerminalTransport } = {
  current: () => new ValorMockTransport(),
};

jest.mock("@/services/terminals/valor-transport-factory", () => ({
  createValorTransport: () => mockTransportImpl.current(),
}));

// Imported after the mock is registered.
import { ValorService } from "@/services/terminals/valor-service";

const CONFIG = {
  connectionType: "local_socket" as const,
  host: "127.0.0.1",
  port: 5000,
  cancelPort: 5001,
  timeout: 5000,
  terminalId: "terminal-1",
};

function newService(): ValorService {
  return new ValorService();
}

beforeEach(() => {
  mockTransportImpl.current = () => new ValorMockTransport();
  setValorMockScenario("healthy");
});

describe("ValorService.processSale — scenario mock", () => {
  it("approves a healthy sale with a valor_transaction blob", async () => {
    setValorMockScenario("healthy");
    const svc = newService();
    await svc.connect(CONFIG);
    const res = await svc.processSale({ amount: 1500, referenceId: "000123" });

    expect(res.success).toBe(true);
    expect(res.partial).toBeFalsy();
    expect(res.stan).toBeTruthy();
    expect(res.tranNo).toBe("20"); // reversal reference (NOT the STAN)
    expect(res.rrn).toBe("514712500424");
    const blob = res.terminalResponse as any;
    expect(blob.terminal_vendor).toBe("valor");
    expect(blob.valor_transaction.cardLast4).toBe("5103");
    expect(blob.valor_transaction.tranNo).toBe("20");
  });

  it("returns partial=true (does NOT report full success) on PARTIAL=1", async () => {
    setValorMockScenario("partial_approval");
    const svc = newService();
    await svc.connect(CONFIG);
    const res = await svc.processSale({ amount: 1000, referenceId: "000124" });

    expect(res.success).toBe(true);
    expect(res.partial).toBe(true);
    expect(res.approvedAmount).toBe(500); // half of requested cents
  });

  it("returns a clean decline on STATE=-1", async () => {
    setValorMockScenario("decline");
    const svc = newService();
    await svc.connect(CONFIG);
    const res = await svc.processSale({ amount: 1000, referenceId: "000125" });

    expect(res.success).toBe(false);
    expect(res.indeterminate).toBeFalsy();
    expect(res.errorCode).toBe("V0005");
  });

  it("treats a pre-card no-ACK as a clean (non-indeterminate) failure", async () => {
    setValorMockScenario("no_ack");
    const svc = newService();
    await svc.connect(CONFIG);
    const res = await svc.processSale({ amount: 1000, referenceId: "000126" });

    expect(res.success).toBe(false);
    expect(res.indeterminate).toBeFalsy();
    expect(res.stan).toBeUndefined();
  }, 8000); // ACK timeout is 5s; give the test room to observe it fire
});

describe("ValorService recovery — TRAN_MODE 90", () => {
  it("recovers an approval when the socket drops after STAN capture", async () => {
    setValorMockScenario("drop_after_stan");
    const svc = newService();
    await svc.connect(CONFIG);
    const res = await svc.processSale({ amount: 2000, referenceId: "000127" });

    // Sale socket died after S2, but TRAN_MODE 90 returned an approval.
    expect(res.success).toBe(true);
    expect(res.stan).toBeTruthy();
  });

  it("stays INDETERMINATE when recovery cannot confirm (unknown)", async () => {
    setValorMockScenario("drop_after_stan_unknown");
    const svc = newService();
    await svc.connect(CONFIG);
    const res = await svc.processSale({ amount: 2000, referenceId: "000128" });

    expect(res.success).toBe(false);
    expect(res.indeterminate).toBe(true);
    expect(res.stan).toBeTruthy();
  });
});

describe("ValorService.cancelInFlight — port 5001", () => {
  it("reports cleared when the terminal clears before card entry", async () => {
    const svc = newService();
    await svc.connect(CONFIG);
    const res = await svc.cancelInFlight("000129");
    expect(res.cleared).toBe(true);
  });
});

describe("ValorService.terminalQuery — TRAN_MODE 96", () => {
  it("returns serial + app version", async () => {
    const svc = newService();
    await svc.connect(CONFIG);
    const res = await svc.terminalQuery();
    expect(res.success).toBe(true);
    expect(res.data?.serialNumber).toBe("MOCK-VALOR-SN-0001");
    expect(res.data?.appVersion).toBe("v3.0.27");
  });
});

// ── Bespoke scripted transport for correlation / missing-STAN edge cases ──

class ScriptedTransport implements ITerminalTransport {
  private _open = false;
  private _data: ((c: string) => void)[] = [];
  private _err: ((e: Error) => void)[] = [];
  private _close: ((h: boolean) => void)[] = [];
  /** Test supplies the reply choreography for each written request. */
  onWrite: (body: any, emit: (frame: string) => void) => void = () => {};

  get isOpen() { return this._open; }
  secondsSinceLastData() { return 0; }
  connect() { this._open = true; return Promise.resolve(); }
  disconnect() { this._open = false; }
  write(data: string) {
    let body: any = null;
    let inner = data;
    const s = inner.lastIndexOf(VALOR_STX);
    if (s !== -1) inner = inner.slice(s + 1);
    const e = inner.indexOf(VALOR_ETX);
    if (e !== -1) inner = inner.slice(0, e);
    try { body = JSON.parse(inner); } catch { /* trailing ACK */ }
    // Ignore the POS trailing ACK (MSG:ACK, no TRAN_MODE).
    if (body && body.TRAN_MODE != null) {
      const emit = (frame: string) => { for (const cb of [...this._data]) cb(frame); };
      setTimeout(() => this.onWrite(body, emit), 5);
    }
    return Promise.resolve();
  }
  onData(cb: (c: string) => void) { this._data.push(cb); }
  onError(cb: (e: Error) => void) { this._err.push(cb); }
  onClose(cb: (h: boolean) => void) { this._close.push(cb); }
  offData(cb: (c: string) => void) { const i = this._data.indexOf(cb); if (i !== -1) this._data.splice(i, 1); }
  offError(cb: (e: Error) => void) { const i = this._err.indexOf(cb); if (i !== -1) this._err.splice(i, 1); }
  offClose(cb: (h: boolean) => void) { const i = this._close.indexOf(cb); if (i !== -1) this._close.splice(i, 1); }
  removeAllListeners() { this._data = []; this._err = []; this._close = []; }
}

describe("ValorService stale-frame correlation guard", () => {
  it("discards a final frame whose MER_TXN_ID mismatches, resolves on the correct one", async () => {
    const scripted = new ScriptedTransport();
    scripted.onWrite = (body, emit) => {
      const ref = String(body.REQ_TXN_ID ?? "");
      emit(encodeValorFrame({ STATE: "0", MSG: "ACK" }));
      emit(encodeValorFrame({ STATE: "0", STAN_NO: "9", MSG: "Payload Request Received" }));
      // Stale frame from a prior/cancelled txn — different MER_TXN_ID.
      emit(encodeValorFrame({ STATE: "0", MER_TXN_ID: "999999", RRN: "000000000000", TRAN_NO: "99", CODE: "STALE1", MASKED_PAN: "4111 **** **** 1111" }));
      // Correct final for our reference.
      emit(encodeValorFrame({ STATE: "0", MER_TXN_ID: ref, REQ_TXN_ID: ref, RRN: "514712500424", TRAN_NO: "20", CODE: "TAS706", MASKED_PAN: "4160 **** **** 5103" }));
    };
    mockTransportImpl.current = () => scripted;

    const svc = newService();
    await svc.connect(CONFIG);
    const res = await svc.processSale({ amount: 1500, referenceId: "000200" });

    expect(res.success).toBe(true);
    expect(res.rrn).toBe("514712500424"); // NOT the stale frame's 000000000000
    expect(res.tranNo).toBe("20"); // NOT "99"
    expect((res.terminalResponse as any).valor_transaction.approvalCode).toBe("TAS706");
  });

  it("completes but warns when the Payload-Received frame lacks STAN_NO", async () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    const scripted = new ScriptedTransport();
    scripted.onWrite = (body, emit) => {
      const ref = String(body.REQ_TXN_ID ?? "");
      emit(encodeValorFrame({ STATE: "0", MSG: "ACK" }));
      emit(encodeValorFrame({ STATE: "0", MSG: "Payload Request Received" })); // no STAN_NO
      emit(encodeValorFrame({ STATE: "0", MER_TXN_ID: ref, RRN: "514712500424", TRAN_NO: "21", MASKED_PAN: "4160 **** **** 5103" }));
    };
    mockTransportImpl.current = () => scripted;

    const svc = newService();
    await svc.connect(CONFIG);
    const res = await svc.processSale({ amount: 1500, referenceId: "000201" });

    expect(res.success).toBe(true);
    expect(res.stan).toBeUndefined();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("missing STAN_NO"));
    warn.mockRestore();
  });
});
