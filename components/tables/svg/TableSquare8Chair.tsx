import * as React from "react";
import Svg, { Rect } from "react-native-svg";

interface TableSquare8ChairProps {
  color?: string;
  chairColor?: string;
  width?: number;
  height?: number;
}

// viewBox 0 0 208 97
// Table: x=9 y=9 w=190 h=79 → top edge y=9, bottom edge y=88, left x=9, right x=199
// 3 chairs top, 3 chairs bottom, 1 left, 1 right — all flush against table edges
const TableSquare8Chair = ({
  color = "#2DD4BF",
  width = 208,
  height = 97,
  ...props
}: TableSquare8ChairProps) => (
  <Svg width={width} height={height} viewBox="0 0 208 97" fill="none" {...props}>
    {/* Chairs — top */}
    <Rect x="28" y="1" width="40" height="12" rx="3"
      fill={color} fillOpacity="0.08" stroke={color} strokeWidth="1" />
    <Rect x="84" y="1" width="40" height="12" rx="3"
      fill={color} fillOpacity="0.08" stroke={color} strokeWidth="1" />
    <Rect x="140" y="1" width="40" height="12" rx="3"
      fill={color} fillOpacity="0.08" stroke={color} strokeWidth="1" />
    {/* Chairs — bottom */}
    <Rect x="28" y="84" width="40" height="12" rx="3"
      fill={color} fillOpacity="0.08" stroke={color} strokeWidth="1" />
    <Rect x="84" y="84" width="40" height="12" rx="3"
      fill={color} fillOpacity="0.08" stroke={color} strokeWidth="1" />
    <Rect x="140" y="84" width="40" height="12" rx="3"
      fill={color} fillOpacity="0.08" stroke={color} strokeWidth="1" />
    {/* Chair — left */}
    <Rect x="1" y="29" width="12" height="39" rx="3"
      fill={color} fillOpacity="0.08" stroke={color} strokeWidth="1" />
    {/* Chair — right */}
    <Rect x="195" y="29" width="12" height="39" rx="3"
      fill={color} fillOpacity="0.08" stroke={color} strokeWidth="1" />
    {/* Table surface — left edge x=13 (flush with left chair), right edge x=195 (flush with right chair) */}
    <Rect x="13" y="13" width="182" height="71" rx="6"
      fill={color} fillOpacity="0.12" stroke={color} strokeWidth="1.5" />
  </Svg>
);

export default TableSquare8Chair;
