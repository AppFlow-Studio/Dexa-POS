import * as React from "react";
import Svg, { Rect } from "react-native-svg";

interface ServerStationProps {
  color?: string;
  width?: number;
  height?: number;
}

const ServerStation = ({
  color = "#9CA3AF",
  width = 60,
  height = 40,
  ...props
}: ServerStationProps) => (
  <Svg width={width} height={height} viewBox="0 0 60 40" fill="none" {...props}>
    <Rect width="60" height="40" rx="6" fill={color} />
  </Svg>
);

export default ServerStation;
