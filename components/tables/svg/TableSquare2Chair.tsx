import * as React from "react";
import Svg, { Rect } from "react-native-svg";

interface TableSquare2ChairProps {
  color?: string;
  chairColor?: string;
  width?: number;
  height?: number;
}

// viewBox 0 0 79 97
// Table body: y=14..83  (top edge at 14, bottom edge at 83)
// Chair top:  y=3..14   (flush with table top)
// Chair bottom: y=83..94 (flush with table bottom)
const TableSquare2Chair = ({
  color = "#2DD4BF",
  width = 79,
  height = 97,
}: TableSquare2ChairProps) => (
  <Svg width={width} height={height} viewBox="0 0 79 97" fill="none">
    {/* Chair — top (flush against table) */}
    <Rect x="19" y="3" width="41" height="11" rx="3"
      fill={color} fillOpacity="0.08" stroke={color} strokeWidth="1" />
    {/* Table surface */}
    <Rect x="4" y="14" width="71" height="69" rx="5"
      fill={color} fillOpacity="0.12" stroke={color} strokeWidth="1.5" />
    {/* Chair — bottom (flush against table) */}
    <Rect x="19" y="83" width="41" height="11" rx="3"
      fill={color} fillOpacity="0.08" stroke={color} strokeWidth="1" />
  </Svg>
);

export default TableSquare2Chair;
