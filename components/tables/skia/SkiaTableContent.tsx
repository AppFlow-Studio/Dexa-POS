import { Circle, Group, RoundedRect, Text } from "@shopify/react-native-skia";
import React from "react";

import { TableBadge, TableTextLine } from "./tableDrawStore";
import { getTableFont, measureWidth } from "./skiaTableFont";

/**
 * Skia-native text + badges for one table, drawn from PLAIN data (prepared outside
 * the Canvas by TableDataPublisher). No hooks / no store reads here — that's a hard
 * requirement for react-native-skia Canvas children. Positioned by the parent
 * per-table <Group> at the table's local origin.
 */

// Approx line box height for a given font size (RN <Text> line height ≈ 1.28×em).
const lineHeight = (size: number) => size * 1.28;

const SkiaTableContent: React.FC<{
  width: number;
  height: number;
  lines: TableTextLine[];
  badges: TableBadge[];
}> = ({ width, height, lines, badges }) => {
  const centerX = width / 2;
  const totalHeight = lines.reduce((sum, l) => sum + lineHeight(l.size), 0);
  let cursorY = height / 2 - totalHeight / 2;

  const textNodes = lines.map((l, i) => {
    const font = getTableFont(l.size, l.weight);
    const w = font ? measureWidth(font, l.text) : 0;
    const lh = lineHeight(l.size);
    // Baseline ≈ top + ascent; approximate ascent as 0.8×size for centering.
    const baselineY = cursorY + l.size * 0.8 + (lh - l.size) / 2;
    cursorY += lh;
    if (!font) return null;
    return (
      <Text
        key={`t${i}`}
        x={centerX - w / 2}
        y={baselineY}
        text={l.text}
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

    // Pill badges (reservation bottom-right, tab bottom-left, QR alert top-left).
    const isTab = b.kind === "tab";
    const isQrAlert = b.kind === "qr_alert";
    const font = getTableFont(isTab ? 7 : 8, isTab ? "700" : "800");
    const tw = font ? measureWidth(font, b.text) : 0;
    const padH = isTab ? 4 : 5;
    const bw = tw + padH * 2;
    const bh = isTab ? 14 : 16;
    const bx = isTab || isQrAlert ? 4 : width - 4 - bw;
    const by = isQrAlert ? 4 : height - 4 - bh;
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
