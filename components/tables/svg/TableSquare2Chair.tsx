import * as React from "react";
import Svg, { Rect } from "react-native-svg";

interface TableSquare2ChairProps {
  color?: string;
  chairColor?: string;
  width?: number;
  height?: number;
}

const TableSquare2Chair = React.memo(function TableSquare2Chair({
  color = "#2DD4BF",
  width = 79,
  height = 97,
}: TableSquare2ChairProps) {
  return (
    <Svg width={width} height={height} viewBox="0 0 79 97" fill="none">
      {/* Chair — top */}
      <Rect x="19" y="3" width="41" height="11" rx="3"
        fill={color} fillOpacity="0.12" stroke={color} strokeWidth="1" strokeOpacity="0.5" />
      {/* Table surface */}
      <Rect x="4" y="14" width="71" height="69" rx="5"
        fill={color} fillOpacity="0.18" stroke={color} strokeWidth="1.5" strokeOpacity="0.8" />
      {/* Chair — bottom */}
      <Rect x="19" y="83" width="41" height="11" rx="3"
        fill={color} fillOpacity="0.12" stroke={color} strokeWidth="1" strokeOpacity="0.5" />
    </Svg>
  );
});

export default TableSquare2Chair;
