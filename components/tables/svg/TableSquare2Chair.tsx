import * as React from "react";
import Svg, { Rect } from "react-native-svg";

interface TableSquare2ChairProps {
  color?: string;
  chairColor?: string;
  width?: number;
  height?: number;
}

// viewBox 0 0 79 97
// Chair top: y=0..10, centered horizontally
// Table body: y=14..83
// Chair bottom: y=87..97
const TableSquare2Chair = ({
  color = "#2DD4BF",
  width = 79,
  height = 97,
}: TableSquare2ChairProps) => (
  <Svg width={width} height={height} viewBox="0 0 79 97" fill="none">
    {/* Chair — top */}
    <Rect
      x="19"
      y="2"
      width="41"
      height="10"
      rx="3"
      fill={color}
      fillOpacity="0.08"
      stroke={color}
      strokeWidth="1"
    />
    {/* Table surface */}
    <Rect
      x="4"
      y="15"
      width="71"
      height="67"
      rx="5"
      fill={color}
      fillOpacity="0.12"
      stroke={color}
      strokeWidth="1.5"
    />
    {/* Chair — bottom */}
    <Rect
      x="19"
      y="85"
      width="41"
      height="10"
      rx="3"
      fill={color}
      fillOpacity="0.08"
      stroke={color}
      strokeWidth="1"
    />
  </Svg>
);

export default TableSquare2Chair;
