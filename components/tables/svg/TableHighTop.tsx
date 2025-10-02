import * as React from "react";
import Svg, { Circle, Rect } from "react-native-svg";

interface TableHighTopProps {
  color?: string;
  width?: number;
  height?: number;
}

const TableHighTop = ({
  color = "#F1F1F1",
  width = 60,
  height = 60,
  ...props
}: TableHighTopProps) => (
  <Svg width={width} height={height} viewBox="0 0 60 60" fill="none" {...props}>
    {/* Table Top */}
    <Circle cx="30" cy="30" r="28" fill={color} />
    {/* Base to distinguish it */}
    <Rect
      x="25"
      y="25"
      width="10"
      height="10"
      rx="5"
      fill={color}
      opacity="0.6"
    />
  </Svg>
);

export default TableHighTop;
