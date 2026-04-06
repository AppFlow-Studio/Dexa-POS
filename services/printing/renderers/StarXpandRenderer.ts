import { PrintDocument, PrintNode, PrintTextFormat } from "@/types/print-document";
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

// Lazy-loaded to avoid circular dependency issues in the react-native-star-io10 SDK.
// The SDK has PrinterBuilder.ts → index.ts → StarXpandCommand.ts → PrinterBuilder.ts
// circular imports that cause StarXpandCommand.Printer to be undefined at module load time.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _StarXpandCommand: any = null;

function getStarXpandCommand() {
  if (!_StarXpandCommand) {
    _StarXpandCommand = require("react-native-star-io10").StarXpandCommand;
  }
  return _StarXpandCommand;
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
  const StarXpandCommand = getStarXpandCommand();

  // Guard: Star SDK rendering layer must be fully loaded
  if (!StarXpandCommand?.Printer) {
    throw new Error(
      "Star SDK not ready: StarXpandCommand.Printer is undefined. " +
      "The native module may still be initializing. Retry the print job."
    );
  }

  const w = options.maxCharsPerLine;
  const printerBuilder = new StarXpandCommand.PrinterBuilder();

  // styleInternationalCharacter is intentionally skipped for all printers.
  //
  // Root cause: the call queues an async action. When getCommands() later executes
  // that action, it calls StarXpandCommandParameterConverter.convertPrinterInternationalCharacterType()
  // which accesses StarXpandCommand.Printer via a stale circular-dep reference that is
  // undefined at runtime. This crashes with "Cannot read property 'Printer' of undefined".
  //
  // Skipping is safe — all Star printers default to USA character set.
  // (TSP100III/IIU+ are graphics-only anyway and never reach this path.)
  printerBuilder.styleCharacterSpace(0);

  if (options.graphicsOnly) {
    await renderNodesGraphicsOnly(printerBuilder, doc.nodes, w, options, StarXpandCommand);
  } else {
    for (const node of doc.nodes) {
      await renderNode(printerBuilder, node, w, options, StarXpandCommand);
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
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function renderNodesGraphicsOnly(
  pb: any,
  nodes: PrintNode[],
  lineWidth: number,
  options: StarRenderOptions,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sdk: any,
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
        new sdk.Printer.ImageParameter(imageUri, printWidthDots),
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
          secondColor: !!node.format?.secondColor,
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
          secondColor: !!node.format?.secondColor,
        });
        break;
      }

      case "two_column": {
        // Pixel-based: let Skia renderer draw left + right independently at pixel edges
        textBuffer.push({
          text: node.left,
          rightAlignedText: node.right,
          bold: !!node.format?.bold,
          doubleHeight: !!node.format?.doubleHeight,
          doubleWidth: !!node.format?.doubleWidth,
          inverted: !!node.format?.inverted,
          align: "left",
          secondColor: !!node.format?.secondColor,
        });
        break;
      }

      case "divider": {
        textBuffer.push({
          text: "",
          bold: false,
          doubleHeight: false,
          doubleWidth: false,
          inverted: false,
          align: "left",
          isDivider: true,
          dividerStyle: node.style,
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
          pb.actionCut(sdk.Printer.CutType.Partial);
        } else {
          pb.actionFeedLine(5);
        }
        break;
      }

      case "qr_code": {
        await flushTextBuffer();
        pb.styleAlignment(sdk.Printer.Alignment.Center);
        pb.actionPrintQRCode(
          new sdk.Printer.QRCodeParameter(node.data)
            .setCellSize(node.size ?? 4),
        );
        pb.actionFeedLine(1);
        pb.styleAlignment(sdk.Printer.Alignment.Left);
        break;
      }

      case "image": {
        await flushTextBuffer();
        if (node.base64Png) {
          const tempUri = `${FileSystem.cacheDirectory}receipt-logo-${Date.now()}.png`;
          await FileSystem.writeAsStringAsync(tempUri, node.base64Png, {
            encoding: FileSystem.EncodingType.Base64,
          });
          pb.styleAlignment(sdk.Printer.Alignment.Center);
          pb.actionPrintImage(
            new sdk.Printer.ImageParameter(tempUri, printWidthDots / 2),
          );
          pb.styleAlignment(sdk.Printer.Alignment.Left);
        }
        break;
      }

      case "barcode": {
        await flushTextBuffer();
        pb.styleAlignment(sdk.Printer.Alignment.Center);
        pb.actionPrintBarcode(
          new sdk.Printer.BarcodeParameter(
            node.data,
            sdk.Printer.BarcodeSymbology.Code128,
          )
            .setBarDots(2)
            .setHeight(node.height ?? 40)
            .setPrintHri(true),
        );
        pb.actionFeedLine(1);
        pb.styleAlignment(sdk.Printer.Alignment.Left);
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

/**
 * Auto-reduce magnification format if text would exceed the line width.
 * doubleWidth halves effective chars per line; doubleHeight doesn't affect width.
 */
function fitFormat(
  text: string,
  lineWidth: number,
  format?: PrintTextFormat,
): PrintTextFormat | undefined {
  if (!format) return format;
  if (!format.doubleWidth && !format.doubleHeight) return format;

  const effectiveWidth = format.doubleWidth ? Math.floor(lineWidth / 2) : lineWidth;
  if (text.length <= effectiveWidth) return format;

  // Text overflows — try dropping doubleWidth first
  if (format.doubleWidth) {
    const reduced = { ...format, doubleWidth: undefined };
    if (text.length <= lineWidth) return reduced;
    // Still overflows — drop doubleHeight too
    if (format.doubleHeight) {
      return { ...reduced, doubleHeight: undefined };
    }
    return reduced;
  }

  // Only doubleHeight (doesn't affect char width, but drop if needed for consistency)
  return format;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function renderNode(
  pb: any,
  node: PrintNode,
  lineWidth: number,
  options: StarRenderOptions,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sdk: any,
): Promise<void> {
  switch (node.type) {
    case "text": {
      const fmt = fitFormat(node.content, lineWidth, node.format);
      applyAlignment(pb, node.align, sdk);
      applyFormat(pb, fmt, sdk);
      pb.actionPrintText(node.content);
      resetFormat(pb, fmt, sdk);
      break;
    }

    case "text_line": {
      const fmt = fitFormat(node.content, lineWidth, node.format);
      applyAlignment(pb, node.align, sdk);
      applyFormat(pb, fmt, sdk);
      pb.actionPrintText(node.content + "\n");
      resetFormat(pb, fmt, sdk);
      applyAlignment(pb, "left", sdk);
      break;
    }

    case "two_column": {
      const w = node.lineWidth;
      const line = padTwoColumn(node.left, node.right, w);
      const fmt = fitFormat(line, w, node.format);
      applyFormat(pb, fmt, sdk);
      pb.actionPrintText(line + "\n");
      resetFormat(pb, fmt, sdk);
      break;
    }

    case "divider": {
      // actionPrintRuledLine is intentionally skipped.
      // Its deferred action calls convertLineStyle() which accesses StarXpandCommand.Printer.LineStyle
      // via the stale circular-dep reference — same crash as convertPrinterInternationalCharacterType.
      // Text dashes are equivalent output for a US POS.
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
        pb.actionCut(sdk.Printer.CutType.Partial);
      } else {
        // SP700 tear-off: feed enough for manual tear
        pb.actionFeedLine(5);
      }
      break;
    }

    case "qr_code": {
      applyAlignment(pb, "center", sdk);
      pb.actionPrintQRCode(
        new sdk.Printer.QRCodeParameter(node.data)
          .setCellSize(node.size ?? 4),
      );
      pb.actionPrintText("\n");
      applyAlignment(pb, "left", sdk);
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
          pb.styleAlignment(sdk.Printer.Alignment.Center);
          pb.actionPrintImage(
            new sdk.Printer.ImageParameter(tempUri, printWidthDots / 2),
          );
          pb.styleAlignment(sdk.Printer.Alignment.Left);
        } catch {
          // Silently skip if file write fails
        }
      }
      break;
    }

    case "barcode": {
      applyAlignment(pb, "center", sdk);
      pb.actionPrintBarcode(
        new sdk.Printer.BarcodeParameter(
          node.data,
          sdk.Printer.BarcodeSymbology.Code128,
        )
          .setBarDots(2)
          .setHeight(node.height ?? 40)
          .setPrintHri(true),
      );
      pb.actionPrintText("\n");
      applyAlignment(pb, "left", sdk);
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  pb: any,
  align: string | undefined,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sdk: any,
): void {
  switch (align) {
    case "center":
      pb.styleAlignment(sdk.Printer.Alignment.Center);
      break;
    case "right":
      pb.styleAlignment(sdk.Printer.Alignment.Right);
      break;
    case "left":
    default:
      pb.styleAlignment(sdk.Printer.Alignment.Left);
      break;
  }
}

function applyFormat(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  pb: any,
  format: PrintTextFormat | undefined,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sdk: any,
): void {
  if (!format) return;

  if (format.bold) pb.styleBold(true);
  if (format.underline) pb.styleUnderLine(true);
  if (format.inverted) pb.styleInvert(true);

  if (format.doubleHeight && format.doubleWidth) {
    pb.styleMagnification(new sdk.MagnificationParameter(2, 2));
  } else if (format.doubleHeight) {
    pb.styleMagnification(new sdk.MagnificationParameter(1, 2));
  } else if (format.doubleWidth) {
    pb.styleMagnification(new sdk.MagnificationParameter(2, 1));
  }
}

function resetFormat(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  pb: any,
  format: PrintTextFormat | undefined,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sdk: any,
): void {
  if (!format) return;

  if (format.bold) pb.styleBold(false);
  if (format.underline) pb.styleUnderLine(false);
  if (format.inverted) pb.styleInvert(false);

  if (format.doubleHeight || format.doubleWidth) {
    pb.styleMagnification(new sdk.MagnificationParameter(1, 1));
  }
}

// ============================================================================
// TWO-COLUMN PADDING (mirrors EscPosBuilder logic)
// ============================================================================

function padTwoColumn(left: string, right: string, lineWidth: number): string {
  const padding = Math.max(1, lineWidth - left.length - right.length);
  return left + " ".repeat(padding) + right;
}
