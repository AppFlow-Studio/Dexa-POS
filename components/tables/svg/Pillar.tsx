import * as React from "react";
import Svg, { Rect } from "react-native-svg";

interface PillarProps {
  color?: string;
  width?: number;
  height?: number;
}

// viewBox 0 0 40 40
// Outer rect = pillar perimeter with neon stroke
// Inner concentric rect = suggests wall thickness / depth / hollow core
// Corner fill rects at each corner = corner chamfers for structural look
const Pillar = ({
  color = "#94A3B8",
  width = 40,
  height = 40,
}: PillarProps) => (
  <Svg
    width={width}
    height={height}
    viewBox="0 0 40 40"
    fill="none"
    preserveAspectRatio="none"
  >
    {/* Outer pillar body */}
    <Rect
      x="0.75"
      y="0.75"
      width="38.5"
      height="38.5"
      rx="2"
      fill="#1E2340"
      stroke={color}
      strokeWidth="1.5"
    />
    {/* Inner recess — shows structural thickness */}
    <Rect
      x="6"
      y="6"
      width="28"
      height="28"
      rx="1"
      fill={color}
      fillOpacity="0.06"
      stroke={color}
      strokeWidth="0.75"
      strokeOpacity="0.5"
    />
    {/* Deep inner core — shadow */}
    <Rect
      x="11"
      y="11"
      width="18"
      height="18"
      rx="1"
      fill={color}
      fillOpacity="0.1"
    />
  </Svg>
);

export default Pillar;
