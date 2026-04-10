import * as React from "react";
import Svg, { Rect, Line, Path } from "react-native-svg";

interface WallSectionProps {
  color?: string;
  width?: number;
  height?: number;
  hideTop?: boolean;
  hideRight?: boolean;
  hideBottom?: boolean;
  hideLeft?: boolean;
}

/**
 * Architectural wall segment. Per-edge stroke flags allow connected walls
 * to suppress the shared border so they visually merge into one solid mass.
 */
const WallSection = ({
  color = "#94A3B8",
  width = 200,
  height = 10,
  hideTop = false,
  hideRight = false,
  hideBottom = false,
  hideLeft = false,
}: WallSectionProps) => {
  const sw = 1.5; // stroke width

  // Build individual edge line paths so we can suppress each independently
  const edges = [
    { hide: hideTop,    x1: 0,     y1: 0,      x2: width, y2: 0 },
    { hide: hideRight,  x1: width, y1: 0,      x2: width, y2: height },
    { hide: hideBottom, x1: width, y1: height, x2: 0,     y2: height },
    { hide: hideLeft,   x1: 0,     y1: height, x2: 0,     y2: 0 },
  ];

  // Inner highlight — horizontal only, always drawn (it's inside the fill)
  const highlightY = Math.min(3, height * 0.3);
  const shadowY    = Math.max(height - 2.5, height * 0.7);

  return (
    <Svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      fill="none"
      preserveAspectRatio="none"
    >
      {/* Wall body fill — always solid */}
      <Rect x={0} y={0} width={width} height={height} fill="#1E2340" />

      {/* Per-edge borders — suppressed when flush against another wall */}
      {edges.map((e, i) =>
        e.hide ? null : (
          <Line
            key={i}
            x1={e.x1}
            y1={e.y1}
            x2={e.x2}
            y2={e.y2}
            stroke={color}
            strokeWidth={sw}
          />
        )
      )}

      {/* Inner highlight suggesting wall thickness — always shown */}
      <Line
        x1={0}
        y1={highlightY}
        x2={width}
        y2={highlightY}
        stroke={color}
        strokeWidth={0.5}
        strokeOpacity={0.35}
      />

      {/* Bottom shadow line */}
      <Line
        x1={0}
        y1={shadowY}
        x2={width}
        y2={shadowY}
        stroke={color}
        strokeWidth={0.5}
        strokeOpacity={0.15}
      />
    </Svg>
  );
};

export default WallSection;
