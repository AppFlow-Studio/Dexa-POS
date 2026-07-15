// ============================================================
// Valor Framing Codec — <STX>/<ETX> encode + delimiter frame reader
// File: services/terminals/valor-framing.ts
// ============================================================
// Valor wraps every request/response body as  STX(0x02) + JSON + ETX(0x03).
// Unlike Castles (raw unframed JSON parsed by brace-depth), Valor frames are
// delimited, so we accumulate bytes and emit one de-framed JSON object per
// ETX. Frames can split across TCP reads and multiple frames can arrive in
// one read, so the reader keeps a buffer across chunks.
// ============================================================

import {
  VALOR_STX,
  VALOR_ETX,
  type ValorRawResponse,
  type ValorRequestBody,
} from "@/types/valor";

/** Wrap a request body: STX + JSON + ETX. */
export function encodeValorFrame(body: ValorRequestBody): string {
  return VALOR_STX + JSON.stringify(body) + VALOR_ETX;
}

export type ValorFrameKind = "ack" | "payload_received" | "final";

/**
 * Classify a de-framed response:
 *  - `ack`              → {"STATE":"0","MSG":"ACK"}
 *  - `payload_received` → {"STATE":"0",...,"STAN_NO":..,"MSG":"Payload Request Received"}
 *  - `final`            → the actual transaction / query response
 */
export function classifyValorFrame(frame: ValorRawResponse): ValorFrameKind {
  const msg = String(frame.MSG ?? "").trim().toUpperCase();
  if (msg === "ACK") return "ack";
  if (msg.includes("PAYLOAD REQUEST RECEIVED")) return "payload_received";
  return "final";
}

/**
 * Delimiter frame reader. Feed raw chunks via push(); it returns the
 * complete de-framed JSON objects available so far (possibly empty), keeping
 * any partial trailing frame buffered for the next chunk.
 *
 * Defensive posture (mirrors the Castles partial-buffer scanner):
 *  - buffers across chunks (a frame may span multiple TCP reads)
 *  - emits multiple frames if several arrived in one read
 *  - strips any bytes before the last STX in a frame (line noise / keepalives)
 *  - silently drops an unparseable frame rather than throwing
 */
export class ValorFrameReader {
  private _buffer = "";

  push(chunk: string): ValorRawResponse[] {
    this._buffer += chunk;
    const out: ValorRawResponse[] = [];

    let etxIdx: number;
    while ((etxIdx = this._buffer.indexOf(VALOR_ETX)) !== -1) {
      let frame = this._buffer.slice(0, etxIdx);
      this._buffer = this._buffer.slice(etxIdx + 1);

      // Strip everything up to and including the last STX (defends against
      // leading noise; a well-formed frame has exactly one leading STX).
      const stxIdx = frame.lastIndexOf(VALOR_STX);
      if (stxIdx !== -1) frame = frame.slice(stxIdx + 1);

      const trimmed = frame.trim();
      if (!trimmed) continue;

      try {
        out.push(JSON.parse(trimmed) as ValorRawResponse);
      } catch {
        // Unparseable frame — drop it; the service's per-step timeout will
        // handle a truly missing response.
      }
    }

    return out;
  }

  /** Bytes currently buffered without a terminating ETX. */
  get pendingLength(): number {
    return this._buffer.length;
  }

  reset(): void {
    this._buffer = "";
  }
}

// ============================================================
// Amount helpers — Valor amounts are integer CENTS as strings.
// ============================================================

/** Integer cents → Valor on-wire amount string ("1500"). */
export function centsToValorAmount(cents: number): string {
  return String(Math.round(cents));
}

/** Valor on-wire amount string → integer cents. */
export function valorAmountToCents(amount: string | undefined): number {
  if (!amount) return 0;
  const n = parseInt(String(amount).trim(), 10);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Dollars → cents string. Prefer passing integer cents from the money layer
 * (decimal.js) and using centsToValorAmount; this convenience exists for
 * call sites that only have a dollar float, and rounds defensively.
 */
export function dollarsToCentsString(dollars: number): string {
  return String(Math.round((dollars + Number.EPSILON) * 100));
}
