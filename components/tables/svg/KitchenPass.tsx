import * as React from "react";
import Svg, { Rect } from "react-native-svg";

interface KitchenPassProps {
  color?: string;
  width?: number;
  height?: number;
}

const KitchenPass = ({
  color = "#9CA3AF",
  width = 180,
  height = 25,
  ...props
}: KitchenPassProps) => (
  <Svg
    width={width}
    height={height}
    viewBox="0 0 180 25"
    fill="none"
    {...props}
  >
    <Rect width="180" height="25" rx="5" fill={color} opacity="0.5" />
  </Svg>
);

export default KitchenPass;
