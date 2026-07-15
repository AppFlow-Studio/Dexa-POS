// Pure unit tests for the Valor framing codec (Wave 2).
// No device / MMKV / native deps — valor-framing only imports constants.

import {
  encodeValorFrame,
  classifyValorFrame,
  ValorFrameReader,
  centsToValorAmount,
  valorAmountToCents,
  dollarsToCentsString,
} from "@/services/terminals/valor-framing";
import { VALOR_STX, VALOR_ETX } from "@/types/valor";

describe("encodeValorFrame", () => {
  it("wraps the JSON body in STX/ETX", () => {
    const framed = encodeValorFrame({ TRAN_MODE: "1", TRAN_CODE: "1", AMOUNT: "1500" });
    expect(framed.startsWith(VALOR_STX)).toBe(true);
    expect(framed.endsWith(VALOR_ETX)).toBe(true);
    const inner = framed.slice(1, -1);
    expect(JSON.parse(inner)).toEqual({ TRAN_MODE: "1", TRAN_CODE: "1", AMOUNT: "1500" });
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
});
