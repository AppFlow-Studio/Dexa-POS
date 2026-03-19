import * as React from "react";
import Svg, { Rect } from "react-native-svg";

interface TableSquare4ChairProps {
  color?: string;
  chairColor?: string;
  width?: number;
  height?: number;
}

// viewBox 0 0 97 97
// Table body: x=8..88, y=8..88 (edges at 8 and 88)
// Chairs flush against each edge, 11px tall/wide
const TableSquare4Chair = ({
  color = "#2DD4BF",
  width = 97,
  height = 97,
  ...props
}: TableSquare4ChairProps) => (
  <Svg width={width} height={height} viewBox="0 0 97 97" fill="none" {...props}>
    {/* Chair — top */}
    <Rect x="29" y="1" width="39" height="11" rx="3"
      fill={color} fillOpacity="0.08" stroke={color} strokeWidth="1" />
    {/* Chair — bottom */}
    <Rect x="29" y="85" width="39" height="11" rx="3"
      fill={color} fillOpacity="0.08" stroke={color} strokeWidth="1" />
    {/* Chair — left */}
    <Rect x="1" y="29" width="11" height="39" rx="3"
      fill={color} fillOpacity="0.08" stroke={color} strokeWidth="1" />
    {/* Chair — right */}
    <Rect x="85" y="29" width="11" height="39" rx="3"
      fill={color} fillOpacity="0.08" stroke={color} strokeWidth="1" />
    {/* Table surface — left edge at x=12 (flush with chair right edge), right edge at x=85 */}
    <Rect x="12" y="12" width="73" height="73" rx="6"
      fill={color} fillOpacity="0.12" stroke={color} strokeWidth="1.5" />
  </Svg>
);

export default TableSquare4Chair;
