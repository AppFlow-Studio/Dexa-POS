/**
 * ESC/POS Command Builder
 *
 * Fluent builder for constructing ESC/POS byte sequences.
 * Builds a complete command buffer in JS, then sends as a single
 * base64-encoded blob to the native module.
 *
 * Reference: ESC/POS Application Programming Guide
 */

// ESC/POS command constants
const ESC = 0x1b;
const GS = 0x1d;
const LF = 0x0a;

export class EscPosBuilder {
  private chunks: Uint8Array[] = [];

  // ============================================================================
  // CONTROL COMMANDS
  // ============================================================================

  /** Initialize printer (ESC @) */
  initialize(): this {
    this.append([ESC, 0x40]);
    return this;
  }

  /** Full cut (GS V 0) */
  cut(): this {
    this.feed(3);
    this.append([GS, 0x56, 0x00]);
    return this;
  }

  /** Partial cut (GS V 1) */
  partialCut(): this {
    this.feed(3);
    this.append([GS, 0x56, 0x01]);
    return this;
  }

  /** Open cash drawer - pulse pin 2 (ESC p 0 25 250) */
  openCashDrawer(): this {
    this.append([ESC, 0x70, 0x00, 0x19, 0xfa]);
    return this;
  }

  /**
   * Set Print Density / Heating parameters (ESC 7 n1 n2 n3)
   * Fixes faint or "see-through" text by increasing the burn time on the thermal paper.
   * * @param maxHeatingDots (0-255) Default: 7. Number of dots heated at once.
   * @param heatingTime (3-255) Default: 80. Increase for darker print. 120-150 is usually a solid black.
   * @param heatingInterval (0-255) Default: 2. Time between heating cycles.
   */
  setPrintDensity(maxHeatingDots: number = 7, heatingTime: number = 150, heatingInterval: number = 2): this {
    this.append([ESC, 0x37, maxHeatingDots, heatingTime, heatingInterval]);
    return this;
  }

  // ============================================================================
  // TEXT FORMATTING
  // ============================================================================

  /** Align left (ESC a 0) */
  alignLeft(): this {
    this.append([ESC, 0x61, 0x00]);
    return this;
  }

  /** Align center (ESC a 1) */
  alignCenter(): this {
    this.append([ESC, 0x61, 0x01]);
    return this;
  }

  /** Align right (ESC a 2) */
  alignRight(): this {
    this.append([ESC, 0x61, 0x02]);
    return this;
  }

  /** Bold on/off (ESC E n) */
  bold(on: boolean = true): this {
    this.append([ESC, 0x45, on ? 0x01 : 0x00]);
    return this;
  }

  /** Underline on/off (ESC - n) */
  underline(on: boolean = true): this {
    this.append([ESC, 0x2d, on ? 0x01 : 0x00]);
    return this;
  }

  /** White-on-black inverted mode (GS B n) */
  inverted(on: boolean = true): this {
    this.append([GS, 0x42, on ? 0x01 : 0x00]);
    return this;
  }

  /** Double height text (GS ! n) - n=0x10 for double height */
  doubleHeight(on: boolean = true): this {
    this.append([GS, 0x21, on ? 0x10 : 0x00]);
    return this;
  }

  /** Double width text (GS ! n) - n=0x20 for double width */
  doubleWidth(on: boolean = true): this {
    this.append([GS, 0x21, on ? 0x20 : 0x00]);
    return this;
  }

  /** Double height AND width (GS ! n) - n=0x30 */
  doubleSize(on: boolean = true): this {
    this.append([GS, 0x21, on ? 0x30 : 0x00]);
    return this;
  }

  /**
   * Set character size (GS ! n)
   * width: 0-7 (0=normal, 1=2x, ... 7=8x)
   * height: 0-7
   */
  setCharSize(width: number, height: number): this {
    const w = Math.min(7, Math.max(0, width)) << 4;
    const h = Math.min(7, Math.max(0, height));
    this.append([GS, 0x21, w | h]);
    return this;
  }

  /** Reset text formatting to defaults */
  resetFormatting(): this {
    this.bold(false);
    this.underline(false);
    this.setCharSize(0, 0);
    this.alignLeft();
    return this;
  }

  // ============================================================================
  // CONTENT
  // ============================================================================

  /** Print text (encoded as CP437/ASCII) */
  text(content: string): this {
    this.append(this.encodeText(content));
    return this;
  }

  /** Print text followed by newline */
  textLine(content: string): this {
    this.text(content);
    this.newline();
    return this;
  }

  /** Line feed */
  newline(): this {
    this.append([LF]);
    return this;
  }

  /** Feed n lines (ESC d n) */
  feed(lines: number = 1): this {
    this.append([ESC, 0x64, Math.min(255, Math.max(0, lines))]);
    return this;
  }

  // ============================================================================
  // LAYOUT HELPERS
  // ============================================================================

  /**
   * Print a two-column row (left-aligned text + right-aligned text)
   * Pads with spaces to fill the line width.
   */
  twoColumnRow(left: string, right: string, lineWidth: number): this {
    const effectiveWidth = lineWidth - 1; // 1-char safety margin to prevent right-column cutoff
    const padding = effectiveWidth - left.length - right.length;
    if (padding > 0) {
      this.textLine(left + " ".repeat(padding) + right);
    } else {
      // If combined text exceeds effective width, truncate left side
      const truncated = left.substring(0, Math.max(0, effectiveWidth - right.length - 1));
      this.textLine(truncated + " " + right);
    }
    return this;
  }

  /**
   * Print a three-column row (left, center, right)
   */
  threeColumnRow(
    left: string,
    center: string,
    right: string,
    lineWidth: number,
  ): this {
    const totalContentLen = left.length + center.length + right.length;
    const totalPadding = lineWidth - totalContentLen;

    if (totalPadding >= 2) {
      const leftPad = Math.floor(totalPadding / 2);
      const rightPad = totalPadding - leftPad;
      this.textLine(
        left + " ".repeat(leftPad) + center + " ".repeat(rightPad) + right,
      );
    } else {
      // Fallback: just print left + right
      this.twoColumnRow(left, right, lineWidth);
    }
    return this;
  }

  /** Solid line separator (────────) */
  solidLine(lineWidth: number): this {
    this.textLine("-".repeat(lineWidth));
    return this;
  }

  /** Dotted line separator (· · · · ·) */
  dottedLine(lineWidth: number): this {
    const pattern = "- ".repeat(Math.floor(lineWidth / 2));
    this.textLine(pattern.substring(0, lineWidth));
    return this;
  }

  /** Double line separator (════════) */
  doubleLine(lineWidth: number): this {
    this.textLine("=".repeat(lineWidth));
    return this;
  }

  /** Empty line */
  emptyLine(): this {
    this.newline();
    return this;
  }

  // ============================================================================
  // BUILD
  // ============================================================================

  /** Get the final ESC/POS byte buffer */
  build(): Uint8Array {
    // Calculate total length
    let totalLength = 0;
    for (const chunk of this.chunks) {
      totalLength += chunk.length;
    }

    // Merge all chunks into a single buffer
    const result = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of this.chunks) {
      result.set(chunk, offset);
      offset += chunk.length;
    }

    return result;
  }

  /** Convert the built buffer to base64 string for native bridge */
  buildBase64(): string {
    const bytes = this.build();
    let binary = "";
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  // ============================================================================
  // INTERNAL
  // ============================================================================

  private append(data: number[] | Uint8Array): void {
    if (data instanceof Uint8Array) {
      this.chunks.push(data);
    } else {
      this.chunks.push(new Uint8Array(data));
    }
  }

  /** Encode text string to bytes (basic ASCII/CP437 mapping) */
  private encodeText(text: string): Uint8Array {
    const bytes = new Uint8Array(text.length);
    for (let i = 0; i < text.length; i++) {
      const code = text.charCodeAt(i);
      // Keep printable ASCII, replace others with '?'
      bytes[i] = code >= 0x20 && code <= 0x7e ? code : 0x3f;
    }
    return bytes;
  }
}
