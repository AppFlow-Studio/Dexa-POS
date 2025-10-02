import * as React from "react";
import Svg, { Rect } from "react-native-svg";

interface PillarProps {
  color?: string;
  width?: number;
  height?: number;
}

const Pillar = ({
  color = "#9CA3AF",
  width = 40,
  height = 40,
  ...props
}: PillarProps) => (
  <Svg width={width} height={height} viewBox="0 0 40 40" fill="none" {...props}>
    <Rect width="40" height="40" rx="8" fill={color} />
  </Svg>
);

export default Pillar;
