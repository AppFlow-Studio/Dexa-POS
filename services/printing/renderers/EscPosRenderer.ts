import { PrintDocument, PrintNode, PrintTextFormat } from "@/types/print-document";
import { EscPosBuilder } from "../escpos/EscPosBuilder";

/**
 * Renders a PrintDocument to ESC/POS bytes using EscPosBuilder.
 * This bridges the structured document IR to raw ESC/POS for network/USB printers.
 */
export function renderDocumentToEscPos(doc: PrintDocument): Uint8Array {
  const b = new EscPosBuilder();
  b.initialize();

  for (const node of doc.nodes) {
    renderNode(b, node);
  }

  return b.build();
}

function renderNode(b: EscPosBuilder, node: PrintNode): void {
  switch (node.type) {
    case "text": {
      applyAlign(b, node.align);
      applyFormat(b, node.format);
      b.text(node.content);
      resetFormat(b, node.format);
      break;
    }

    case "text_line": {
      applyAlign(b, node.align);
      applyFormat(b, node.format);
      b.textLine(node.content);
      resetFormat(b, node.format);
      applyAlign(b, "left"); // reset alignment
      break;
    }

    case "two_column": {
      applyFormat(b, node.format);
      b.twoColumnRow(node.left, node.right, node.lineWidth);
      resetFormat(b, node.format);
      break;
    }

    case "divider": {
      switch (node.style) {
        case "solid":
          b.solidLine(node.lineWidth);
          break;
        case "dotted":
          b.dottedLine(node.lineWidth);
          break;
        case "double":
          b.doubleLine(node.lineWidth);
          break;
      }
      break;
    }

    case "empty_line": {
      b.emptyLine();
      break;
    }

    case "feed": {
      b.feed(node.lines);
      break;
    }

    case "cut": {
      if (node.partial) {
        b.partialCut();
      } else {
        b.cut();
      }
      break;
    }

    case "cash_drawer": {
      b.openCashDrawer();
      break;
    }

    case "qr_code":
    case "barcode":
    case "image":
      // Not yet supported by EscPosBuilder — skip silently
      break;
  }
}

function applyAlign(b: EscPosBuilder, align?: string): void {
  switch (align) {
    case "center":
      b.alignCenter();
      break;
    case "right":
      b.alignRight();
      break;
    case "left":
    default:
      b.alignLeft();
      break;
  }
}

function applyFormat(b: EscPosBuilder, format?: PrintTextFormat): void {
  if (!format) return;
  if (format.bold) b.bold(true);
  if (format.underline) b.underline(true);
  if (format.inverted) b.inverted(true);
  if (format.doubleHeight && format.doubleWidth) {
    b.doubleSize(true);
  } else if (format.doubleHeight) {
    b.doubleHeight(true);
  } else if (format.doubleWidth) {
    b.doubleWidth(true);
  }
}

function resetFormat(b: EscPosBuilder, format?: PrintTextFormat): void {
  if (!format) return;
  if (format.bold) b.bold(false);
  if (format.underline) b.underline(false);
  if (format.inverted) b.inverted(false);
  if (format.doubleHeight && format.doubleWidth) {
    b.doubleSize(false);
  } else if (format.doubleHeight) {
    b.doubleHeight(false);
  } else if (format.doubleWidth) {
    b.doubleWidth(false);
  }
}
