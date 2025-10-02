import * as React from "react";
import Svg, { Rect } from "react-native-svg";

interface HostStandProps {
  color?: string;
  width?: number;
  height?: number;
}

const HostStand = ({
  color = "#9CA3AF",
  width = 40,
  height = 35,
  ...props
}: HostStandProps) => (
  <Svg width={width} height={height} viewBox="0 0 40 35" fill="none" {...props}>
    <Rect width="40" height="35" rx="6" fill={color} />
  </Svg>
);

export default HostStand;
