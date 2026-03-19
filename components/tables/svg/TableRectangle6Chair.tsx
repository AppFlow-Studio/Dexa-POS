import * as React from "react";
import Svg, { Rect } from "react-native-svg";

interface TableRectangle6ChairProps {
  color?: string;
  chairColor?: string;
  width?: number;
  height?: number;
}

// viewBox 0 0 180 90
// Table: x=20 y=15 w=140 h=60 → top edge y=15, bottom edge y=75
// 3 chairs top, 3 chairs bottom flush against table edges
const TableRectangle6Chair = ({
  color = "#2DD4BF",
  width = 180,
  height = 90,
  ...props
}: TableRectangle6ChairProps) => (
  <Svg width={width} height={height} viewBox="0 0 180 90" fill="none" {...props}>
    {/* Chairs — top */}
    <Rect x="30" y="3" width="32" height="12" rx="3"
      fill={color} fillOpacity="0.08" stroke={color} strokeWidth="1" />
    <Rect x="74" y="3" width="32" height="12" rx="3"
      fill={color} fillOpacity="0.08" stroke={color} strokeWidth="1" />
    <Rect x="118" y="3" width="32" height="12" rx="3"
      fill={color} fillOpacity="0.08" stroke={color} strokeWidth="1" />
    {/* Chairs — bottom */}
    <Rect x="30" y="75" width="32" height="12" rx="3"
      fill={color} fillOpacity="0.08" stroke={color} strokeWidth="1" />
    <Rect x="74" y="75" width="32" height="12" rx="3"
      fill={color} fillOpacity="0.08" stroke={color} strokeWidth="1" />
    <Rect x="118" y="75" width="32" height="12" rx="3"
      fill={color} fillOpacity="0.08" stroke={color} strokeWidth="1" />
    {/* Table surface */}
    <Rect x="20" y="15" width="140" height="60" rx="8"
      fill={color} fillOpacity="0.12" stroke={color} strokeWidth="1.5" />
  </Svg>
);

export default TableRectangle6Chair;
