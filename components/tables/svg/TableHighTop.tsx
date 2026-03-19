import * as React from "react";
import Svg, { Circle } from "react-native-svg";

interface TableHighTopProps {
  color?: string;
  chairColor?: string;
  width?: number;
  height?: number;
}

// viewBox 0 0 60 60
// Outer circle = table top surface
// Middle ring = edge detail
// Inner circle = pedestal/post base visible from above
const TableHighTop = ({
  color = "#2DD4BF",
  width = 60,
  height = 60,
}: TableHighTopProps) => (
  <Svg width={width} height={height} viewBox="0 0 60 60" fill="none">
    {/* Table top surface */}
    <Circle
      cx="30"
      cy="30"
      r="27"
      fill={color}
      fillOpacity="0.12"
      stroke={color}
      strokeWidth="1.5"
    />
    {/* Overhang edge shadow ring */}
    <Circle
      cx="30"
      cy="30"
      r="21"
      fill="none"
      stroke={color}
      strokeWidth="0.75"
      strokeOpacity="0.3"
    />
    {/* Pedestal base / center post */}
    <Circle
      cx="30"
      cy="30"
      r="7"
      fill={color}
      fillOpacity="0.25"
      stroke={color}
      strokeWidth="1"
    />
    {/* Center point */}
    <Circle
      cx="30"
      cy="30"
      r="2"
      fill={color}
      fillOpacity="0.5"
    />
  </Svg>
);

export default TableHighTop;
