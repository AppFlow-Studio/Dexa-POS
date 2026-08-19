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

/**
 * Encode a request body as BARE JSON (no framing).
 *
 * The spec (v1.1.6) documents STX/ETX framing, but the real VP terminal does
 * NOT use it: framed requests are ACK'd at the transport layer but the
 * transaction dispatcher never starts the sale (terminal ACKs, never prompts
 * for card). Sending bare JSON makes the terminal prompt and process normally.
 * Responses are likewise bare JSON — see ValorFrameReader (brace-depth scan).
 */
export function encodeValorFrame(body: ValorRequestBody): string {
  return JSON.stringify(body);
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
 * Response reader. Feed raw chunks via push(); it returns the complete JSON
 * objects available so far (possibly empty), keeping any partial trailing
 * object buffered for the next chunk.
 *
 * NOTE ON FRAMING: We *send* requests STX/ETX-framed (per Valor spec v1.1.6),
 * but real VP terminals reply with BARE JSON — no STX/ETX on the response (the
 * ACK arrives as `{"STATE":"0","MSG":"ACK"}` with no delimiters). Relying on an
 * ETX terminator therefore buffered the ACK forever and stalled the handshake.
 * So this reader scans by brace-depth like the Castles reader and treats STX/ETX
 * as ignorable noise — it handles both framed and unframed responses.
 *
 * Defensive posture (mirrors the Castles partial-buffer scanner):
 *  - buffers across chunks (an object may span multiple TCP reads)
 *  - emits multiple objects if several arrived in one read
 *  - tracks string literals/escapes so braces inside strings don't miscount
 *  - ignores STX/ETX control bytes and any inter-object noise/whitespace
 *  - silently drops an unparseable object rather than throwing
 */
export class ValorFrameReader {
  private _buffer = "";

  push(chunk: string): ValorRawResponse[] {
    this._buffer += chunk;
    const out: ValorRawResponse[] = [];

    let depth = 0;
    let inString = false;
    let escaped = false;
    let objStart = -1;
    let consumedUpTo = 0; // end index (exclusive) of the last complete object

    for (let i = 0; i < this._buffer.length; i++) {
      const ch = this._buffer[i];

      // STX/ETX are not consistently present on responses — treat as noise.
      if (ch === VALOR_STX || ch === VALOR_ETX) continue;

      if (inString) {
        if (escaped) escaped = false;
        else if (ch === "\\") escaped = true;
        else if (ch === '"') inString = false;
        continue;
      }

      if (ch === '"') {
        inString = true;
      } else if (ch === "{") {
        if (depth === 0) objStart = i;
        depth++;
      } else if (ch === "}") {
        if (depth > 0) {
          depth--;
          if (depth === 0 && objStart !== -1) {
            const candidate = this._buffer.slice(objStart, i + 1);
            try {
              out.push(JSON.parse(candidate) as ValorRawResponse);
            } catch {
              // Unparseable object — drop it; the service's per-step timeout
              // handles a truly missing response.
            }
            objStart = -1;
            consumedUpTo = i + 1;
          }
        }
        // stray '}' at depth 0 → ignore
      }
      // chars at depth 0 outside a string are inter-object noise → ignored
    }

    // Retain only an in-progress object; drop everything else (incl. noise).
    if (depth > 0 && objStart !== -1) {
      this._buffer = this._buffer.slice(objStart);
    } else {
      this._buffer = "";
    }

    return out;
  }

  /** Bytes currently buffered as a partial (incomplete) object. */
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
 * Dollars → integer cents. The single conversion used by every call site that
 * only has a dollar float (sale and refund alike), so the two paths cannot
 * drift — a $4.08 refund must send 408, never 4 ($0.04).
 */
export function dollarsToValorCents(dollars: number): number {
  return Math.round((dollars + Number.EPSILON) * 100);
}

/**
 * Dollars → cents string. Prefer passing integer cents from the money layer
 * (decimal.js) and using centsToValorAmount; this convenience exists for
 * call sites that only have a dollar float, and rounds defensively.
 */
export function dollarsToCentsString(dollars: number): string {
  return String(dollarsToValorCents(dollars));
}
