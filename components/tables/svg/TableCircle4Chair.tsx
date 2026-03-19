import * as React from "react";
import Svg, { Circle, Rect } from "react-native-svg";

interface TableCircle4ChairProps {
  color?: string;
  chairColor?: string;
  width?: number;
  height?: number;
}

// Center (45,45), table r=28 → edges at y=17 (top), y=73 (bottom), x=17 (left), x=73 (right)
// Chairs flush: chair height/width=12, placed so inner edge touches circle edge
const TableCircle4Chair = ({
  color = "#2DD4BF",
  width = 90,
  height = 90,
  ...props
}: TableCircle4ChairProps) => (
  <Svg width={width} height={height} viewBox="0 0 90 90" fill="none" {...props}>
    {/* Chair — top */}
    <Rect x="31" y="3" width="28" height="14" rx="3"
      fill={color} fillOpacity="0.08" stroke={color} strokeWidth="1" />
    {/* Chair — bottom */}
    <Rect x="31" y="73" width="28" height="14" rx="3"
      fill={color} fillOpacity="0.08" stroke={color} strokeWidth="1" />
    {/* Chair — left */}
    <Rect x="3" y="31" width="14" height="28" rx="3"
      fill={color} fillOpacity="0.08" stroke={color} strokeWidth="1" />
    {/* Chair — right */}
    <Rect x="73" y="31" width="14" height="28" rx="3"
      fill={color} fillOpacity="0.08" stroke={color} strokeWidth="1" />
    {/* Table surface */}
    <Circle cx="45" cy="45" r="28"
      fill={color} fillOpacity="0.12" stroke={color} strokeWidth="1.5" />
  </Svg>
);

export default TableCircle4Chair;
