import * as React from "react";
import Svg, { Rect } from "react-native-svg";

interface TableRectangle4ChairProps {
  color?: string;
  chairColor?: string;
  width?: number;
  height?: number;
}

const TableRectangle4Chair = React.memo(function TableRectangle4Chair({
  color = "#2DD4BF",
  width = 140,
  height = 90,
}: TableRectangle4ChairProps) {
  return (
    <Svg width={width} height={height} viewBox="0 0 140 90" fill="none">
      {/* Chairs — top */}
      <Rect x="30" y="3" width="32" height="12" rx="3"
        fill={color} fillOpacity="0.12" stroke={color} strokeWidth="1" strokeOpacity="0.5" />
      <Rect x="78" y="3" width="32" height="12" rx="3"
        fill={color} fillOpacity="0.12" stroke={color} strokeWidth="1" strokeOpacity="0.5" />
      {/* Chairs — bottom */}
      <Rect x="30" y="75" width="32" height="12" rx="3"
        fill={color} fillOpacity="0.12" stroke={color} strokeWidth="1" strokeOpacity="0.5" />
      <Rect x="78" y="75" width="32" height="12" rx="3"
        fill={color} fillOpacity="0.12" stroke={color} strokeWidth="1" strokeOpacity="0.5" />
      {/* Table surface */}
      <Rect x="20" y="15" width="100" height="60" rx="8"
        fill={color} fillOpacity="0.18" stroke={color} strokeWidth="1.5" strokeOpacity="0.8" />
    </Svg>
  );
});

export default TableRectangle4Chair;
