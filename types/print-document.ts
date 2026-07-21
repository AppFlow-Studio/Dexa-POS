// ============================================================================
// PrintDocument – Format-agnostic intermediate representation for printing
// ============================================================================

export type PrintAlign = "left" | "center" | "right";

export interface PrintTextFormat {
  bold?: boolean;
  underline?: boolean;
  italic?: boolean;
  doubleHeight?: boolean;
  doubleWidth?: boolean;
  fontSize?: number;
  inverted?: boolean;
  condensed?: boolean;
  secondColor?: boolean;

}

export type PrintNode =
  | { type: "text"; content: string; align?: PrintAlign; format?: PrintTextFormat }
  | { type: "text_line"; content: string; align?: PrintAlign; format?: PrintTextFormat }
  | {
    type: "two_column";
    left: string;
    right: string;
    format?: PrintTextFormat;
    lineWidth?: number;
    labelAlign?: "left" | "mid" | "meta";   // ← add this line
  }
  | { type: "divider"; style: "solid" | "dotted" | "double"; lineWidth: number; weight?: "bold" }
  | { type: "empty_line" }
  | { type: "feed"; lines: number }
  | { type: "qr_code"; data: string; size?: number }
  | {
      type: "barcode";
      data: string;
      format?: string;
      width?: number;
      height?: number;
    }
  | { type: "image"; base64Png: string }
  | { type: "cut"; partial?: boolean }
  | { type: "cash_drawer" };

export interface PrintDocument {
  nodes: PrintNode[];
  maxCharsPerLine?: number;
}
