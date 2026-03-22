import * as React from "react";
import Svg, { Circle, Rect } from "react-native-svg";

interface TableCircle2ChairProps {
  color?: string;
  chairColor?: string;
  width?: number;
  height?: number;
}

const TableCircle2Chair = ({
  color = "#2DD4BF",
  width = 80,
  height = 80,
  ...props
}: TableCircle2ChairProps) => (
  <Svg width={width} height={height} viewBox="0 0 80 80" fill="none" {...props}>
    {/* Chair — top */}
    <Rect x="26" y="3" width="28" height="12" rx="3"
      fill={color} fillOpacity="0.12" stroke={color} strokeWidth="1" strokeOpacity="0.5" />
    {/* Chair — bottom */}
    <Rect x="26" y="65" width="28" height="12" rx="3"
      fill={color} fillOpacity="0.12" stroke={color} strokeWidth="1" strokeOpacity="0.5" />
    {/* Table surface */}
    <Circle cx="40" cy="40" r="25"
      fill={color} fillOpacity="0.18" stroke={color} strokeWidth="1.5" strokeOpacity="0.8" />
  </Svg>
);

export default TableCircle2Chair;
