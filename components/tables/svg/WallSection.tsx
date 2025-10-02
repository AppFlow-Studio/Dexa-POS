import * as React from "react";
import Svg, { Rect } from "react-native-svg";

interface WallSectionProps {
  color?: string;
  width?: number;
  height?: number;
}

const WallSection = ({
  color = "#9CA3AF",
  width = 200,
  height = 10,
  ...props
}: WallSectionProps) => (
  <Svg
    width={width}
    height={height}
    viewBox="0 0 200 10"
    fill="none"
    {...props}
  >
    <Rect width="200" height="10" rx="5" fill={color} />
  </Svg>
);

export default WallSection;
