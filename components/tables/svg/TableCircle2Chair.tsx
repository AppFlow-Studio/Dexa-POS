import * as React from "react";
import Svg, { Circle, Rect } from "react-native-svg";

interface TableCircle2ChairProps {
  color?: string;
  chairColor?: string;
  width?: number;
  height?: number;
}

// Center (40,40), table r=25 → edges at y=15 (top) and y=65 (bottom)
// Chairs flush: top chair bottom edge = 15, bottom chair top edge = 65
const TableCircle2Chair = ({
  color = "#2DD4BF",
  width = 80,
  height = 80,
  ...props
}: TableCircle2ChairProps) => (
  <Svg width={width} height={height} viewBox="0 0 80 80" fill="none" {...props}>
    {/* Chair — top (flush against circle top) */}
    <Rect x="26" y="3" width="28" height="12" rx="3"
      fill={color} fillOpacity="0.08" stroke={color} strokeWidth="1" />
    {/* Chair — bottom (flush against circle bottom) */}
    <Rect x="26" y="65" width="28" height="12" rx="3"
      fill={color} fillOpacity="0.08" stroke={color} strokeWidth="1" />
    {/* Table surface */}
    <Circle cx="40" cy="40" r="25"
      fill={color} fillOpacity="0.12" stroke={color} strokeWidth="1.5" />
  </Svg>
);

export default TableCircle2Chair;
