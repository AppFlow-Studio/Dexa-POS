import {
  PrintDocument,
  PrintNode,
  PrintTextFormat,
} from "@/types/print-document";

/**
 * Renders a PrintDocument to Dejavoo XML markup for the SPIN P terminal printer.
 *
 * Dejavoo XML tags:
 *  <L>   Left align
 *  <C>   Center align
 *  <R>   Right align
 *  <B>   Bold
 *  <LG>  Large text (double height/width)
 *  <INV> Inverted text
 *  <BR /> Line break
 *  <QR>  QR code
 */
export function renderDocumentToDejavooXml(doc: PrintDocument): string {
  const parts: string[] = [];

  for (const node of doc.nodes) {
    parts.push(renderNode(node, doc.maxCharsPerLine ?? 32));
  }

  return parts.join("");
}

function renderNode(node: PrintNode, defaultLineWidth: number): string {
  switch (node.type) {
    case "text": {
      return wrapText(escapeXml(node.content), node.align, node.format);
    }

    case "text_line": {
      return (
        wrapText(escapeXml(node.content), node.align, node.format) + "<BR />"
      );
    }

    case "two_column": {
      // Dejavoo has no native column support — use space-padded left-aligned line
      const w = node.lineWidth ?? defaultLineWidth;
      const left = node.left;
      const right = node.right;
      const padding = Math.max(1, w - left.length - right.length);
      const line = escapeXml(left) + " ".repeat(padding) + escapeXml(right);

      if (node.format?.bold) {
        return `<L><B>${line}</B></L><BR />`;
      }
      return `<L>${line}</L><BR />`;
    }

    case "divider": {
      const w = node.lineWidth;
      let char: string;
      switch (node.style) {
        case "solid":
          char = "-";
          break;
        case "dotted":
          char = "- ";
          break;
        case "double":
          char = "=";
          break;
      }
      const line =
        node.style === "dotted"
          ? char.repeat(Math.floor(w / 2)).substring(0, w)
          : char.repeat(w);
      return `<L>${escapeXml(line)}</L><BR />`;
    }

    case "empty_line": {
      return "<BR />";
    }

    case "feed": {
      return "<BR />".repeat(node.lines);
    }

    case "qr_code": {
      return `<QR>${escapeXml(node.data)}</QR><BR />`;
    }

    case "cut": {
      // Dejavoo auto-cuts after print; emit extra blank lines for spacing
      return "<BR /><BR /><BR />";
    }

    case "image": {
      return `<C><IMG>${node.base64Png}</IMG></C><BR />`;
    }

    case "cash_drawer":
    case "barcode": {
      // Not supported on Dejavoo terminal printer
      return "";
    }
  }
}

function wrapText(
  content: string,
  align?: string,
  format?: PrintTextFormat,
): string {
  let result = content;

  // Apply formatting (inner to outer)
  if (format?.condensed) result = `<CD>${result}</CD>`;
  if (format?.bold) result = `<B>${result}</B>`;
  if (format?.inverted) result = `<INV>${result}</INV>`;
  if (format?.doubleHeight || format?.doubleWidth)
    result = `<LG>${result}</LG>`;

  // Apply alignment
  switch (align) {
    case "center":
      result = `<C>${result}</C>`;
      break;
    case "right":
      result = `<R>${result}</R>`;
      break;
    case "left":
    default:
      result = `<L>${result}</L>`;
      break;
  }

  return result;
}

export function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
