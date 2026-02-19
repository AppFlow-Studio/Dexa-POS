import { PrintDocument, PrintNode, PrintTextFormat } from "@/types/print-document";
import {
  StarXpandCommand,
} from "react-native-star-io10";

// ============================================================================
// TYPES
// ============================================================================

export interface StarRenderOptions {
  supportsAutoCut: boolean;
  maxCharsPerLine: number;
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Renders a PrintDocument IR to a StarXpandCommand string
 * suitable for `StarPrinter.print(commands)`.
 */
export async function renderDocumentToStarCommands(
  doc: PrintDocument,
  options: StarRenderOptions,
): Promise<string> {
  const w = options.maxCharsPerLine;
  const printerBuilder = new StarXpandCommand.PrinterBuilder();

  for (const node of doc.nodes) {
    renderNode(printerBuilder, node, w, options);
  }

  const builder = new StarXpandCommand.StarXpandCommandBuilder();
  builder.addDocument(
    new StarXpandCommand.DocumentBuilder().addPrinter(printerBuilder),
  );

  return builder.getCommands();
}

// ============================================================================
// NODE RENDERING
// ============================================================================

function renderNode(
  pb: InstanceType<typeof StarXpandCommand.PrinterBuilder>,
  node: PrintNode,
  lineWidth: number,
  options: StarRenderOptions,
): void {
  switch (node.type) {
    case "text": {
      applyAlignment(pb, node.align);
      applyFormat(pb, node.format);
      pb.actionPrintText(node.content);
      resetFormat(pb, node.format);
      break;
    }

    case "text_line": {
      applyAlignment(pb, node.align);
      applyFormat(pb, node.format);
      pb.actionPrintText(node.content + "\n");
      resetFormat(pb, node.format);
      applyAlignment(pb, "left");
      break;
    }

    case "two_column": {
      const w = node.lineWidth;
      applyFormat(pb, node.format);
      const line = padTwoColumn(node.left, node.right, w);
      pb.actionPrintText(line + "\n");
      resetFormat(pb, node.format);
      break;
    }

    case "divider": {
      const w = node.lineWidth;
      let line: string;
      switch (node.style) {
        case "solid":
          line = "-".repeat(w);
          break;
        case "dotted":
          line = "- ".repeat(Math.floor(w / 2)).substring(0, w);
          break;
        case "double":
          line = "=".repeat(w);
          break;
      }
      pb.actionPrintText(line + "\n");
      break;
    }

    case "empty_line": {
      pb.actionPrintText("\n");
      break;
    }

    case "feed": {
      pb.actionFeedLine(node.lines);
      break;
    }

    case "cut": {
      if (options.supportsAutoCut) {
        pb.actionCut(StarXpandCommand.Printer.CutType.Partial);
      } else {
        // SP700 tear-off: feed enough for manual tear
        pb.actionFeedLine(5);
      }
      break;
    }

    case "qr_code": {
      applyAlignment(pb, "center");
      pb.actionPrintQRCode(
        new StarXpandCommand.Printer.QRCodeParameter(node.data)
          .setCellSize(node.size ?? 4),
      );
      pb.actionPrintText("\n");
      applyAlignment(pb, "left");
      break;
    }

    case "cash_drawer":
    case "barcode":
    case "image": {
      // Not yet supported — skip silently
      break;
    }
  }
}

// ============================================================================
// FORMAT HELPERS
// ============================================================================

function applyAlignment(
  pb: InstanceType<typeof StarXpandCommand.PrinterBuilder>,
  align?: string,
): void {
  switch (align) {
    case "center":
      pb.styleAlignment(StarXpandCommand.Printer.Alignment.Center);
      break;
    case "right":
      pb.styleAlignment(StarXpandCommand.Printer.Alignment.Right);
      break;
    case "left":
    default:
      pb.styleAlignment(StarXpandCommand.Printer.Alignment.Left);
      break;
  }
}

function applyFormat(
  pb: InstanceType<typeof StarXpandCommand.PrinterBuilder>,
  format?: PrintTextFormat,
): void {
  if (!format) return;

  if (format.bold) pb.styleBold(true);
  if (format.underline) pb.styleUnderLine(true);
  if (format.inverted) pb.styleInvert(true);

  if (format.doubleHeight && format.doubleWidth) {
    pb.styleMagnification(new StarXpandCommand.MagnificationParameter(2, 2));
  } else if (format.doubleHeight) {
    pb.styleMagnification(new StarXpandCommand.MagnificationParameter(1, 2));
  } else if (format.doubleWidth) {
    pb.styleMagnification(new StarXpandCommand.MagnificationParameter(2, 1));
  }
}

function resetFormat(
  pb: InstanceType<typeof StarXpandCommand.PrinterBuilder>,
  format?: PrintTextFormat,
): void {
  if (!format) return;

  if (format.bold) pb.styleBold(false);
  if (format.underline) pb.styleUnderLine(false);
  if (format.inverted) pb.styleInvert(false);

  if (format.doubleHeight || format.doubleWidth) {
    pb.styleMagnification(new StarXpandCommand.MagnificationParameter(1, 1));
  }
}

// ============================================================================
// TWO-COLUMN PADDING (mirrors EscPosBuilder logic)
// ============================================================================

function padTwoColumn(left: string, right: string, lineWidth: number): string {
  const padding = Math.max(1, lineWidth - left.length - right.length);
  return left + " ".repeat(padding) + right;
}
