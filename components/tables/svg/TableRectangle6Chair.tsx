import * as React from "react";
import Svg, { Rect } from "react-native-svg";

interface TableRectangle6ChairProps {
  color?: string;
  chairColor?: string;
  width?: number;
  height?: number;
}

const TableRectangle6Chair = ({
  color = "#2DD4BF",
  width = 180,
  height = 90,
  ...props
}: TableRectangle6ChairProps) => (
  <Svg width={width} height={height} viewBox="0 0 180 90" fill="none" {...props}>
    {/* Chairs — top */}
    <Rect x="30" y="3" width="32" height="12" rx="3"
      fill={color} fillOpacity="0.12" stroke={color} strokeWidth="1" strokeOpacity="0.5" />
    <Rect x="74" y="3" width="32" height="12" rx="3"
      fill={color} fillOpacity="0.12" stroke={color} strokeWidth="1" strokeOpacity="0.5" />
    <Rect x="118" y="3" width="32" height="12" rx="3"
      fill={color} fillOpacity="0.12" stroke={color} strokeWidth="1" strokeOpacity="0.5" />
    {/* Chairs — bottom */}
    <Rect x="30" y="75" width="32" height="12" rx="3"
      fill={color} fillOpacity="0.12" stroke={color} strokeWidth="1" strokeOpacity="0.5" />
    <Rect x="74" y="75" width="32" height="12" rx="3"
      fill={color} fillOpacity="0.12" stroke={color} strokeWidth="1" strokeOpacity="0.5" />
    <Rect x="118" y="75" width="32" height="12" rx="3"
      fill={color} fillOpacity="0.12" stroke={color} strokeWidth="1" strokeOpacity="0.5" />
    {/* Table surface */}
    <Rect x="20" y="15" width="140" height="60" rx="8"
      fill={color} fillOpacity="0.18" stroke={color} strokeWidth="1.5" strokeOpacity="0.8" />
  </Svg>
);

export default TableRectangle6Chair;
