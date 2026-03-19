import * as React from "react";
import Svg, { Rect } from "react-native-svg";

interface TableRectangle4ChairProps {
  color?: string;
  chairColor?: string;
  width?: number;
  height?: number;
}

// viewBox 0 0 140 90
// Table: x=20 y=15 w=100 h=60 → top edge y=15, bottom edge y=75, left x=20, right x=120
// 2 chairs top, 2 chairs bottom flush against table edges
const TableRectangle4Chair = ({
  color = "#2DD4BF",
  width = 140,
  height = 90,
  ...props
}: TableRectangle4ChairProps) => (
  <Svg width={width} height={height} viewBox="0 0 140 90" fill="none" {...props}>
    {/* Chairs — top */}
    <Rect x="30" y="3" width="32" height="12" rx="3"
      fill={color} fillOpacity="0.08" stroke={color} strokeWidth="1" />
    <Rect x="78" y="3" width="32" height="12" rx="3"
      fill={color} fillOpacity="0.08" stroke={color} strokeWidth="1" />
    {/* Chairs — bottom */}
    <Rect x="30" y="75" width="32" height="12" rx="3"
      fill={color} fillOpacity="0.08" stroke={color} strokeWidth="1" />
    <Rect x="78" y="75" width="32" height="12" rx="3"
      fill={color} fillOpacity="0.08" stroke={color} strokeWidth="1" />
    {/* Table surface */}
    <Rect x="20" y="15" width="100" height="60" rx="8"
      fill={color} fillOpacity="0.12" stroke={color} strokeWidth="1.5" />
  </Svg>
);

export default TableRectangle4Chair;
