import * as React from "react";
import Svg, { Circle } from "react-native-svg";

interface TableHighTopProps {
  color?: string;
  chairColor?: string;
  width?: number;
  height?: number;
}

const TableHighTop = ({
  color = "#2DD4BF",
  width = 60,
  height = 60,
}: TableHighTopProps) => (
  <Svg width={width} height={height} viewBox="0 0 60 60" fill="none">
    {/* Table top surface */}
    <Circle cx="30" cy="30" r="27"
      fill={color} fillOpacity="0.18" stroke={color} strokeWidth="1.5" strokeOpacity="0.8" />
    {/* Overhang ring */}
    <Circle cx="30" cy="30" r="21"
      fill="none" stroke={color} strokeWidth="0.75" strokeOpacity="0.25" />
    {/* Pedestal base */}
    <Circle cx="30" cy="30" r="7"
      fill={color} fillOpacity="0.22" stroke={color} strokeWidth="1" strokeOpacity="0.5" />
  </Svg>
);

export default TableHighTop;
