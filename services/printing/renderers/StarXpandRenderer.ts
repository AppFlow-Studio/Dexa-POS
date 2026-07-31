import { PrintDocument, PrintNode, PrintTextFormat } from "@/types/print-document";
import * as FileSystem from "expo-file-system";
import { TextBlock, renderTextBlocksToImage } from "./SkiaTicketRenderer";
import { sanitizeForPrint } from "../utils/sanitizeText";
import {
  TEMP_LOGO_PREFIX,
  nextTempImageSeq,
} from "../utils/tempImageCleanup";

// ============================================================================
// TYPES
// ============================================================================

export interface StarRenderOptions {
  supportsAutoCut: boolean;
  maxCharsPerLine: number;
  graphicsOnly: boolean; // TSP100III etc. — must use actionPrintImage
}

export interface StarRenderResult {
  /** StarXpandCommand string for `StarPrinter.print()`. */
  commands: string;
  /**
   * file:// URIs of every PNG written for this document. The Star SDK reads
   * them by path during `print()`, so the caller must delete them only AFTER
   * the print call settles — see `deleteTempImages`.
   */
  tempFiles: string[];
}

// 80mm paper @ 203dpi = 576 dots printable width
const PRINT_WIDTH_DOTS_80MM = 576;
const PRINT_WIDTH_DOTS_58MM = 384;

// Graphics chunking constants (match SkiaTicketRenderer's BASE_FONT_SIZE / LINE_SPACING)
const GFX_BASE_FONT_SIZE = 28;
const GFX_LINE_SPACING = 6;
const MAX_CHUNK_HEIGHT_PX = 1200; // ~2.7MB RGBA — safe for resource-constrained devices

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
): Promise<StarRenderResult> {
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

  // Force all printing to use graphics mode to ensure exact font consistency across all printers.
  // This uses SkiaTicketRenderer which enforces the bundled SpaceMono font.
  const tempFiles: string[] = [];
  await renderNodesGraphicsOnly(printerBuilder, doc.nodes, w, options, StarXpandCommand, tempFiles);

  const builder = new StarXpandCommand.StarXpandCommandBuilder();
  builder.addDocument(
    new StarXpandCommand.DocumentBuilder().addPrinter(printerBuilder),
  );

  const commands = await builder.getCommands();
  console.log(
    `[StarXpandRenderer] Commands generated (graphicsOnly=${options.graphicsOnly}): ${commands.length} chars, ${tempFiles.length} temp images, preview: ${commands.substring(0, 200)}`,
  );
  return { commands, tempFiles };
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
  tempFiles: string[],
): Promise<void> {
  const printWidthDots = lineWidth >= 42
    ? PRINT_WIDTH_DOTS_80MM
    : PRINT_WIDTH_DOTS_58MM;

  let textBuffer: TextBlock[] = [];
  let chunkHeightPx = 0;

  const flushTextBuffer = async () => {
    if (textBuffer.length === 0) return;

    const imageUri = await renderTextBlocksToImage(textBuffer, printWidthDots);
    if (imageUri) {
      tempFiles.push(imageUri);
      pb.actionPrintImage(
        new sdk.Printer.ImageParameter(imageUri, printWidthDots),
      );
    }
    textBuffer = [];
    chunkHeightPx = 0;
  };

  const pushAndMaybeFlush = async (block: TextBlock) => {
    textBuffer.push(block);
    const blockHeight = block.isDivider
      ? ((block.dividerStyle ?? 'solid') === 'double' ? 20 : 16)
      : ((GFX_BASE_FONT_SIZE + GFX_LINE_SPACING) * (block.doubleHeight ? 2 : 1));
    chunkHeightPx += blockHeight;
    if (chunkHeightPx >= MAX_CHUNK_HEIGHT_PX) {
      await flushTextBuffer();
    }
  };

  for (const node of nodes) {
    switch (node.type) {
      case "text": {
        await pushAndMaybeFlush({
          text: sanitizeForPrint(node.content),
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
        await pushAndMaybeFlush({
          text: sanitizeForPrint(node.content),
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
        await pushAndMaybeFlush({
          text: sanitizeForPrint(node.left),
          rightAlignedText: sanitizeForPrint(node.right),
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
        await pushAndMaybeFlush({
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
        await pushAndMaybeFlush({
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
          const tempUri = `${FileSystem.cacheDirectory}${TEMP_LOGO_PREFIX}${Date.now()}-${nextTempImageSeq()}.png`;
          await FileSystem.writeAsStringAsync(tempUri, node.base64Png, {
            encoding: FileSystem.EncodingType.Base64,
          });
          tempFiles.push(tempUri);
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

/**
 * Returns true for text/text_line/two_column nodes that have doubleHeight or doubleWidth.
 * These nodes are routed to Skia image rendering to avoid streaked/missing letters
 * from firmware-rendered magnified text on Star printers.
 */
function hasMagnification(node: PrintNode): boolean {
  if (node.type !== "text" && node.type !== "text_line" && node.type !== "two_column") return false;
  return !!node.format?.doubleHeight || !!node.format?.doubleWidth;
}

/** Converts a PrintNode to a TextBlock for Skia rendering. Only call for text/text_line/two_column. */
function nodeToTextBlock(node: PrintNode): TextBlock {
  switch (node.type) {
    case "two_column":
      return {
        text: sanitizeForPrint(node.left),
        rightAlignedText: sanitizeForPrint(node.right),
        bold: !!node.format?.bold,
        doubleHeight: !!node.format?.doubleHeight,
        doubleWidth: !!node.format?.doubleWidth,
        inverted: !!node.format?.inverted,
        align: "left",
        secondColor: !!node.format?.secondColor,
      };
    case "text":
    case "text_line":
      return {
        text: sanitizeForPrint(node.content),
        bold: !!node.format?.bold,
        doubleHeight: !!node.format?.doubleHeight,
        doubleWidth: !!node.format?.doubleWidth,
        inverted: !!node.format?.inverted,
        align: node.align ?? "left",
        secondColor: !!node.format?.secondColor,
      };
    default:
      // Should never reach here — hasMagnification guards the call
      return { text: "", bold: false, doubleHeight: false, doubleWidth: false, inverted: false, align: "left" };
  }
}

/** Renders a batch of magnified TextBlocks as a PNG image and sends via actionPrintImage. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function flushMagnifiedBatch(pb: any, batch: TextBlock[], printWidthDots: number, sdk: any): Promise<void> {
  if (batch.length === 0) return;
  const imageUri = await renderTextBlocksToImage(batch, printWidthDots);
  if (imageUri) {
    pb.actionPrintImage(
      new sdk.Printer.ImageParameter(imageUri, printWidthDots),
    );
  }
}

interface FormatTracker {
  setAlignment(align: string | undefined): void;
  setFormat(format: PrintTextFormat | undefined): void;
  reset(): void;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function renderNode(
  pb: any,
  node: PrintNode,
  lineWidth: number,
  options: StarRenderOptions,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sdk: any,
  fmt: FormatTracker,
): Promise<void> {
  switch (node.type) {
    case "text": {
      const fitFmt = fitFormat(sanitizeForPrint(node.content), lineWidth, node.format);
      fmt.setAlignment(node.align);
      fmt.setFormat(fitFmt);
      pb.actionPrintText(sanitizeForPrint(node.content));
      fmt.reset();
      break;
    }

    case "text_line": {
      const content = sanitizeForPrint(node.content);
      const fitFmt = fitFormat(content, lineWidth, node.format);
      fmt.setAlignment(node.align);
      fmt.setFormat(fitFmt);
      pb.actionPrintText(content + "\n");
      fmt.reset();
      break;
    }

    case "two_column": {
      const w = node.lineWidth || 32;
      const line = padTwoColumn(
        sanitizeForPrint(node.left),
        sanitizeForPrint(node.right),
        w,
      );
      const fitFmt = fitFormat(line, w, node.format);
      fmt.setFormat(fitFmt);
      pb.actionPrintText(line + "\n");
      fmt.reset();
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
      fmt.reset();
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
      fmt.setAlignment("center");
      pb.actionPrintQRCode(
        new sdk.Printer.QRCodeParameter(node.data)
          .setCellSize(node.size ?? 4),
      );
      pb.actionPrintText("\n");
      fmt.setAlignment("left");
      break;
    }

    case "image": {
      if (node.base64Png) {
        const printWidthDots = lineWidth >= 42
          ? PRINT_WIDTH_DOTS_80MM
          : PRINT_WIDTH_DOTS_58MM;
        // Non-graphics path (currently unreachable — graphics mode is forced).
        // These files have no owning driver call, so the orphan sweep is their
        // only cleanup; the shared prefix is what makes them sweepable.
        const tempUri = `${FileSystem.cacheDirectory}${TEMP_LOGO_PREFIX}${Date.now()}-${nextTempImageSeq()}.png`;
        try {
          await FileSystem.writeAsStringAsync(tempUri, node.base64Png, {
            encoding: FileSystem.EncodingType.Base64,
          });
          fmt.setAlignment("center");
          pb.actionPrintImage(
            new sdk.Printer.ImageParameter(tempUri, printWidthDots / 2),
          );
          fmt.setAlignment("left");
        } catch {
          // Silently skip if file write fails
        }
      }
      break;
    }

    case "barcode": {
      fmt.setAlignment("center");
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
      fmt.setAlignment("left");
      break;
    }

    case "cash_drawer": {
      // Not yet supported — skip silently
      break;
    }
  }
}

// ============================================================================
// FORMAT TRACKER — only emits style commands when values actually change
// ============================================================================

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function createFormatTracker(pb: any, sdk: any): FormatTracker {
  const current = {
    bold: false,
    underline: false,
    inverted: false,
    magX: 1,
    magY: 1,
    alignment: 'left',
  };

  return {
    setAlignment(align: string | undefined) {
      const a = align ?? 'left';
      if (a === current.alignment) return;
      current.alignment = a;
      switch (a) {
        case 'center':
          pb.styleAlignment(sdk.Printer.Alignment.Center);
          break;
        case 'right':
          pb.styleAlignment(sdk.Printer.Alignment.Right);
          break;
        default:
          pb.styleAlignment(sdk.Printer.Alignment.Left);
          break;
      }
    },

    setFormat(format: PrintTextFormat | undefined) {
      if (!format) return;

      if (!!format.bold !== current.bold) {
        current.bold = !!format.bold;
        pb.styleBold(current.bold);
      }
      if (!!format.underline !== current.underline) {
        current.underline = !!format.underline;
        pb.styleUnderLine(current.underline);
      }
      if (!!format.inverted !== current.inverted) {
        current.inverted = !!format.inverted;
        pb.styleInvert(current.inverted);
      }

      const magX = format.doubleWidth ? 2 : 1;
      const magY = format.doubleHeight ? 2 : 1;
      if (magX !== current.magX || magY !== current.magY) {
        current.magX = magX;
        current.magY = magY;
        pb.styleMagnification(new sdk.MagnificationParameter(magX, magY));
      }
    },

    reset() {
      this.setFormat({ bold: false, underline: false, inverted: false });
      this.setAlignment('left');
    },
  };
}

// ============================================================================
// TWO-COLUMN PADDING (mirrors EscPosBuilder logic)
// ============================================================================

function padTwoColumn(left: string, right: string, lineWidth: number): string {
  const padding = Math.max(1, lineWidth - left.length - right.length);
  return left + " ".repeat(padding) + right;
}
