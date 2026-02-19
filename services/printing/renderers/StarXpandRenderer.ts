import { PrintDocument, PrintNode, PrintTextFormat } from "@/types/print-document";
import {
  StarXpandCommand,
} from "react-native-star-io10";
import * as FileSystem from "expo-file-system";
import { TextBlock, renderTextBlocksToImage } from "./SkiaTicketRenderer";

// ============================================================================
// TYPES
// ============================================================================

export interface StarRenderOptions {
  supportsAutoCut: boolean;
  maxCharsPerLine: number;
  graphicsOnly: boolean; // TSP100III etc. — must use actionPrintImage
}

// 80mm paper @ 203dpi = 576 dots printable width
const PRINT_WIDTH_DOTS_80MM = 576;
const PRINT_WIDTH_DOTS_58MM = 384;

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

  // Required encoding setup — without this some Star models produce blank output
  printerBuilder.styleInternationalCharacter(
    StarXpandCommand.Printer.InternationalCharacterType.Usa,
  );
  printerBuilder.styleCharacterSpace(0);

  if (options.graphicsOnly) {
    await renderNodesGraphicsOnly(printerBuilder, doc.nodes, w, options);
  } else {
    for (const node of doc.nodes) {
      await renderNode(printerBuilder, node, w, options);
    }
  }

  const builder = new StarXpandCommand.StarXpandCommandBuilder();
  builder.addDocument(
    new StarXpandCommand.DocumentBuilder().addPrinter(printerBuilder),
  );

  const commands = await builder.getCommands();
  console.log(
    `[StarXpandRenderer] Commands generated (graphicsOnly=${options.graphicsOnly}): ${commands.length} chars, preview: ${commands.substring(0, 200)}`,
  );
  return commands;
}

// ============================================================================
// GRAPHICS-ONLY RENDERING (TSP100III, TSP100IIU+)
// ============================================================================

/**
 * For graphics-only printers: collects consecutive text nodes into TextBlock
 * buffers, renders them as PNG images via Skia, then sends via actionPrintImage.
 * Non-text nodes (cut, feed, qr_code) are sent as native Star commands.
 */
async function renderNodesGraphicsOnly(
  pb: InstanceType<typeof StarXpandCommand.PrinterBuilder>,
  nodes: PrintNode[],
  lineWidth: number,
  options: StarRenderOptions,
): Promise<void> {
  const printWidthDots = lineWidth >= 42
    ? PRINT_WIDTH_DOTS_80MM
    : PRINT_WIDTH_DOTS_58MM;

  let textBuffer: TextBlock[] = [];

  const flushTextBuffer = async () => {
    if (textBuffer.length === 0) return;

    const imageUri = await renderTextBlocksToImage(textBuffer, printWidthDots);
    if (imageUri) {
      pb.actionPrintImage(
        new StarXpandCommand.Printer.ImageParameter(imageUri, printWidthDots),
      );
    }
    textBuffer = [];
  };

  for (const node of nodes) {
    switch (node.type) {
      case "text": {
        textBuffer.push({
          text: node.content,
          bold: !!node.format?.bold,
          doubleHeight: !!node.format?.doubleHeight,
          doubleWidth: !!node.format?.doubleWidth,
          inverted: !!node.format?.inverted,
          align: node.align ?? "left",
        });
        break;
      }

      case "text_line": {
        textBuffer.push({
          text: node.content,
          bold: !!node.format?.bold,
          doubleHeight: !!node.format?.doubleHeight,
          doubleWidth: !!node.format?.doubleWidth,
          inverted: !!node.format?.inverted,
          align: node.align ?? "left",
        });
        break;
      }

      case "two_column": {
        const line = padTwoColumn(node.left, node.right, node.lineWidth);
        textBuffer.push({
          text: line,
          bold: !!node.format?.bold,
          doubleHeight: !!node.format?.doubleHeight,
          doubleWidth: !!node.format?.doubleWidth,
          inverted: !!node.format?.inverted,
          align: "left",
        });
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
        textBuffer.push({
          text: line,
          bold: false,
          doubleHeight: false,
          doubleWidth: false,
          inverted: false,
          align: "left",
        });
        break;
      }

      case "empty_line": {
        textBuffer.push({
          text: " ",
          bold: false,
          doubleHeight: false,
          doubleWidth: false,
          inverted: false,
          align: "left",
        });
        break;
      }

      // Non-text nodes: flush buffer first, then emit native command
      case "feed": {
        await flushTextBuffer();
        pb.actionFeedLine(node.lines);
        break;
      }

      case "cut": {
        await flushTextBuffer();
        if (options.supportsAutoCut) {
          pb.actionCut(StarXpandCommand.Printer.CutType.Partial);
        } else {
          pb.actionFeedLine(5);
        }
        break;
      }

      case "qr_code": {
        await flushTextBuffer();
        pb.styleAlignment(StarXpandCommand.Printer.Alignment.Center);
        pb.actionPrintQRCode(
          new StarXpandCommand.Printer.QRCodeParameter(node.data)
            .setCellSize(node.size ?? 4),
        );
        pb.actionFeedLine(1);
        pb.styleAlignment(StarXpandCommand.Printer.Alignment.Left);
        break;
      }

      case "image": {
        await flushTextBuffer();
        if (node.base64Png) {
          const tempUri = `${FileSystem.cacheDirectory}receipt-logo-${Date.now()}.png`;
          await FileSystem.writeAsStringAsync(tempUri, node.base64Png, {
            encoding: FileSystem.EncodingType.Base64,
          });
          pb.styleAlignment(StarXpandCommand.Printer.Alignment.Center);
          pb.actionPrintImage(
            new StarXpandCommand.Printer.ImageParameter(tempUri, printWidthDots / 2),
          );
          pb.styleAlignment(StarXpandCommand.Printer.Alignment.Left);
        }
        break;
      }

      case "barcode": {
        await flushTextBuffer();
        pb.styleAlignment(StarXpandCommand.Printer.Alignment.Center);
        pb.actionPrintBarcode(
          new StarXpandCommand.Printer.BarcodeParameter(
            node.data,
            StarXpandCommand.Printer.BarcodeSymbology.Code128,
          )
            .setBarDots(2)
            .setHeight(node.height ?? 40)
            .setPrintHri(true),
        );
        pb.actionFeedLine(1);
        pb.styleAlignment(StarXpandCommand.Printer.Alignment.Left);
        break;
      }

      case "cash_drawer": {
        await flushTextBuffer();
        break;
      }
    }
  }

  // Flush any remaining text
  await flushTextBuffer();
}

// ============================================================================
// NODE RENDERING (text-based, for non-graphics-only printers)
// ============================================================================

async function renderNode(
  pb: InstanceType<typeof StarXpandCommand.PrinterBuilder>,
  node: PrintNode,
  lineWidth: number,
  options: StarRenderOptions,
): Promise<void> {
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

    case "image": {
      if (node.base64Png) {
        const printWidthDots = lineWidth >= 42
          ? PRINT_WIDTH_DOTS_80MM
          : PRINT_WIDTH_DOTS_58MM;
        const tempUri = `${FileSystem.cacheDirectory}receipt-logo-${Date.now()}.png`;
        try {
          await FileSystem.writeAsStringAsync(tempUri, node.base64Png, {
            encoding: FileSystem.EncodingType.Base64,
          });
          pb.styleAlignment(StarXpandCommand.Printer.Alignment.Center);
          pb.actionPrintImage(
            new StarXpandCommand.Printer.ImageParameter(tempUri, printWidthDots / 2),
          );
          pb.styleAlignment(StarXpandCommand.Printer.Alignment.Left);
        } catch {
          // Silently skip if file write fails
        }
      }
      break;
    }

    case "barcode": {
      applyAlignment(pb, "center");
      pb.actionPrintBarcode(
        new StarXpandCommand.Printer.BarcodeParameter(
          node.data,
          StarXpandCommand.Printer.BarcodeSymbology.Code128,
        )
          .setBarDots(2)
          .setHeight(node.height ?? 40)
          .setPrintHri(true),
      );
      pb.actionPrintText("\n");
      applyAlignment(pb, "left");
      break;
    }

    case "cash_drawer": {
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
