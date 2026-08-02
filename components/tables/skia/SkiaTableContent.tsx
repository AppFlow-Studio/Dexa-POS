import { Circle, Group, RoundedRect, Text } from "@shopify/react-native-skia";
import React from "react";

import { getTableFont, measureWidth } from "./skiaTableFont";
import { TableBadge, TableTextLine } from "./tableDrawStore";

/**
 * Skia-native text + badges for one table, drawn from PLAIN data (prepared outside
 * the Canvas by TableDataPublisher). No hooks / no store reads here — that's a hard
 * requirement for react-native-skia Canvas children. Positioned by the parent
 * per-table <Group> at the table's local origin.
 */

// Approx line box height for a given font size (RN <Text> line height ≈ 1.28×em).
const lineHeight = (size: number) => size * 1.28;

// Horizontal padding inside the table, matching the RN path's content area inset.
const H_PAD = 2;

/**
 * Truncate text to fit within pixel `maxWidth` using the given font.
 * Appends "…" when truncated. Returns the original text if it fits.
 * Uses a safety margin (10%) since Skia linear-metrics widths can under-report.
 */
const clampText = (
  font: ReturnType<typeof getTableFont>,
  text: string,
  maxWidth: number,
): string => {
  if (!font) return text;
  const safeMax = maxWidth * 0.8; // 20% safety margin
  if (safeMax <= 0) return "";
  if (measureWidth(font, text) <= safeMax) return text;
  // Binary search for the longest prefix that fits (reserving space for "…").
  let lo = 1;
  let hi = text.length;
  const ellipsis = "…";
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    const candidate = text.slice(0, mid) + ellipsis;
    if (measureWidth(font, candidate) <= safeMax) {
      lo = mid;
    } else {
      hi = mid - 1;
    }
  }
  const result = text.slice(0, lo) + ellipsis;
  return result.length <= 1 ? "" : result;
};

const SkiaTableContent: React.FC<{
  width: number;
  height: number;
  shapeId: string;
  lines: TableTextLine[];
  badges: TableBadge[];
  /**
   * Typefaces-loaded flag. NOT read here — getTableFont() reads the module-level
   * typefaces directly. It exists purely so React.memo sees a changed prop when the
   * async font load completes and re-runs this component. Without it, a table whose
   * draw data never changes after mount keeps its memoized (textless) output forever:
   * every text node bailed to null while the fonts were still loading, and nothing
   * ever invalidated the memo. That was the "only some tables have text until I
   * switch floor plans" bug — a floor switch remounts everything, which is the only
   * reason it appeared to fix itself.
   */
  fontsReady: boolean;
}> = ({ width, height, shapeId, lines, badges }) => {
  // Shape-aware content area — mirrors useTableCardData's textFit calculation.
  const shapeIdLower = shapeId?.toLowerCase() ?? "";
  const isCircleShape =
    shapeIdLower.includes("circle") || shapeIdLower.includes("high-top");
  const isBoothShape = shapeIdLower.includes("booth");
  const widthFactor = isCircleShape ? 0.58 : isBoothShape ? 0.72 : 0.82;
  const heightFactor = isCircleShape ? 0.5 : isBoothShape ? 0.64 : 0.72;
  const contentW = Math.max(0, Math.round(width * widthFactor) - H_PAD * 2);
  const contentH = Math.round(height * heightFactor);
  const contentLeft = Math.round((width - width * widthFactor) / 2) + H_PAD;
  const contentTop = Math.round((height - height * heightFactor) / 2);
  const centerX = contentLeft + contentW / 2;
  const totalHeight = lines.reduce((sum, l) => sum + lineHeight(l.size), 0);
  let cursorY = contentTop + (contentH - totalHeight) / 2;

  const textNodes = lines.map((l, i) => {
    const font = getTableFont(l.size, l.weight);
    const lh = lineHeight(l.size);
    // Baseline ≈ top + ascent; approximate ascent as 0.8×size for centering.
    const baselineY = cursorY + l.size * 0.8 + (lh - l.size) / 2;
    cursorY += lh;
    if (!font) return null;

    const displayText = clampText(font, l.text, contentW);
    const w = measureWidth(font, displayText);
    // Strictly clamp x within [contentLeft, contentLeft + contentW - w],
    // defaulting to centered. When text is wider than contentW, pin to left edge.
    const xMax = contentLeft + contentW - w;
    const x =
      w > contentW
        ? contentLeft
        : Math.max(contentLeft, Math.min(xMax, centerX - w / 2));

    return (
      <Text
        key={`t${i}`}
        x={x}
        y={baselineY}
        text={displayText}
        font={font}
        color={l.color}
      />
    );
  });

  const badgeNodes = badges.map((b, i) => {
    if (b.kind === "server") {
      const bx = width - 4 - 20;
      const by = 4;
      const font = getTableFont(8, "700");
      const tw = font ? measureWidth(font, b.text) : 0;
      return (
        <Group key={`b${i}`}>
          <Circle cx={bx + 10} cy={by + 10} r={10} color={b.bg} />
          <Circle
            cx={bx + 10}
            cy={by + 10}
            r={10}
            color={b.border}
            style="stroke"
            strokeWidth={1}
          />
          {font && (
            <Text
              x={bx + 10 - tw / 2}
              y={by + 10 + 3}
              text={b.text}
              font={font}
              color={b.fg}
            />
          )}
        </Group>
      );
    }

    // Pill badges (reservation bottom-right, tab bottom-left).
    const isTab = b.kind === "tab";
    const font = getTableFont(isTab ? 7 : 8, isTab ? "700" : "800");
    const tw = font ? measureWidth(font, b.text) : 0;
    const padH = isTab ? 4 : 5;
    const bw = tw + padH * 2;
    const bh = isTab ? 14 : 16;
    const bx = isTab ? 4 : width - 4 - bw;
    const by = height - 4 - bh;
    return (
      <Group key={`b${i}`}>
        <RoundedRect x={bx} y={by} width={bw} height={bh} r={6} color={b.bg} />
        <RoundedRect
          x={bx}
          y={by}
          width={bw}
          height={bh}
          r={6}
          color={b.border}
          style="stroke"
          strokeWidth={isTab ? 1 : 1.5}
        />
        {font && (
          <Text
            x={bx + padH}
            y={by + bh / 2 + 3}
            text={b.text}
            font={font}
            color={b.fg}
          />
        )}
      </Group>
    );
  });

  return (
    <>
      {textNodes}
      {badgeNodes}
    </>
  );
};

export default React.memo(SkiaTableContent);
