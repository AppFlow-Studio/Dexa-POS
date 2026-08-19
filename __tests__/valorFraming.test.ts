// Pure unit tests for the Valor framing codec (Wave 2).
// No device / MMKV / native deps — valor-framing only imports constants.

import {
  encodeValorFrame,
  classifyValorFrame,
  ValorFrameReader,
  centsToValorAmount,
  valorAmountToCents,
  dollarsToCentsString,
  dollarsToValorCents,
} from "@/services/terminals/valor-framing";
import { VALOR_STX, VALOR_ETX } from "@/types/valor";

describe("encodeValorFrame", () => {
  it("encodes the body as bare JSON (no STX/ETX — real VP terminals reject framing)", () => {
    const framed = encodeValorFrame({ TRAN_MODE: "1", TRAN_CODE: "1", AMOUNT: "1500" });
    expect(framed.startsWith(VALOR_STX)).toBe(false);
    expect(framed.endsWith(VALOR_ETX)).toBe(false);
    expect(JSON.parse(framed)).toEqual({ TRAN_MODE: "1", TRAN_CODE: "1", AMOUNT: "1500" });
  });
});

describe("ValorFrameReader", () => {
  const frame = (obj: Record<string, unknown>) => VALOR_STX + JSON.stringify(obj) + VALOR_ETX;

  it("reads a single complete frame", () => {
    const r = new ValorFrameReader();
    const out = r.push(frame({ STATE: "0", MSG: "ACK" }));
    expect(out).toHaveLength(1);
    expect(out[0].MSG).toBe("ACK");
    expect(r.pendingLength).toBe(0);
  });

  it("reassembles a frame split across two chunks", () => {
    const r = new ValorFrameReader();
    const full = frame({ STATE: "0", STAN_NO: "7", MSG: "Payload Request Received" });
    const mid = Math.floor(full.length / 2);
    expect(r.push(full.slice(0, mid))).toHaveLength(0);
    const out = r.push(full.slice(mid));
    expect(out).toHaveLength(1);
    expect(out[0].STAN_NO).toBe("7");
  });

  it("emits multiple frames arriving in one chunk", () => {
    const r = new ValorFrameReader();
    const buf = frame({ MSG: "ACK", STATE: "0" }) + frame({ STATE: "0", STAN_NO: "1", MSG: "Payload Request Received" });
    const out = r.push(buf);
    expect(out).toHaveLength(2);
    expect(classifyValorFrame(out[0])).toBe("ack");
    expect(classifyValorFrame(out[1])).toBe("payload_received");
  });

  it("keeps a trailing partial frame buffered until its ETX arrives", () => {
    const r = new ValorFrameReader();
    const buf = frame({ MSG: "ACK", STATE: "0" }) + VALOR_STX + '{"STATE":"0","RRN":"51';
    const out = r.push(buf);
    expect(out).toHaveLength(1); // only the ACK completed
    expect(r.pendingLength).toBeGreaterThan(0);
    const rest = r.push('4712500424"}' + VALOR_ETX);
    expect(rest).toHaveLength(1);
    expect(rest[0].RRN).toBe("514712500424");
  });

  it("strips leading noise before the STX", () => {
    const r = new ValorFrameReader();
    const out = r.push("garbage-keepalive" + frame({ MSG: "ACK", STATE: "0" }));
    expect(out).toHaveLength(1);
    expect(out[0].MSG).toBe("ACK");
  });

  it("drops an unparseable frame without throwing", () => {
    const r = new ValorFrameReader();
    const out = r.push(VALOR_STX + "not json" + VALOR_ETX + frame({ MSG: "ACK", STATE: "0" }));
    expect(out).toHaveLength(1);
    expect(out[0].MSG).toBe("ACK");
  });

  // Real VP terminals reply with BARE JSON (no STX/ETX). These lock in that the
  // brace-depth reader handles the actual on-wire response shape.
  it("reads a bare JSON response with no STX/ETX framing", () => {
    const r = new ValorFrameReader();
    const out = r.push('{"STATE":"0","MSG":"ACK"}');
    expect(out).toHaveLength(1);
    expect(out[0].MSG).toBe("ACK");
  });

  it("reassembles a bare (unframed) object split across two chunks", () => {
    const r = new ValorFrameReader();
    expect(r.push('{"STATE":"0","STAN_NO":"12')).toHaveLength(0);
    const out = r.push('3456","MSG":"Payload Request Received"}');
    expect(out).toHaveLength(1);
    expect(out[0].STAN_NO).toBe("123456");
  });

  it("emits multiple concatenated bare objects in one read", () => {
    const r = new ValorFrameReader();
    const out = r.push('{"MSG":"ACK","STATE":"0"}{"MSG":"APPROVED","STATE":"0","TRAN_NO":"20"}');
    expect(out).toHaveLength(2);
    expect(out[0].MSG).toBe("ACK");
    expect(out[1].TRAN_NO).toBe("20");
  });

  it("does not miscount braces that appear inside string values", () => {
    const r = new ValorFrameReader();
    const out = r.push('{"MSG":"ACK","NOTE":"weird } brace { inside"}');
    expect(out).toHaveLength(1);
    expect(out[0].NOTE).toBe("weird } brace { inside");
  });
});

describe("classifyValorFrame", () => {
  it("distinguishes ack / payload_received / final", () => {
    expect(classifyValorFrame({ STATE: "0", MSG: "ACK" })).toBe("ack");
    expect(classifyValorFrame({ STATE: "0", STAN_NO: "3", MSG: "Payload Request Received" })).toBe("payload_received");
    expect(classifyValorFrame({ STATE: "0", RRN: "514712500424", CODE: "TAS706" })).toBe("final");
  });
});

describe("amount helpers", () => {
  it("round-trips cents ↔ Valor amount string", () => {
    expect(centsToValorAmount(1500)).toBe("1500");
    expect(valorAmountToCents("1500")).toBe(1500);
    expect(valorAmountToCents(undefined)).toBe(0);
    expect(valorAmountToCents(" 99 ")).toBe(99);
  });

  it("converts dollars to a cents string defensively", () => {
    expect(dollarsToCentsString(15)).toBe("1500");
    expect(dollarsToCentsString(15.0)).toBe("1500");
    expect(dollarsToCentsString(0.1 + 0.2)).toBe("30"); // no float drift
  });

  it("converts dollars to integer cents (refund amount must not collapse)", () => {
    // Regression: a $4.08 refund must send 408, not 4 ($0.04) on the Valor
    // device. The refund path passes dollars; the service expects cents.
    expect(dollarsToValorCents(4.08)).toBe(408);
    expect(centsToValorAmount(dollarsToValorCents(4.08))).toBe("408");
    expect(dollarsToValorCents(15)).toBe(1500);
    expect(dollarsToValorCents(0.04)).toBe(4);
    expect(dollarsToValorCents(0.1 + 0.2)).toBe(30); // no float drift
  });
});
