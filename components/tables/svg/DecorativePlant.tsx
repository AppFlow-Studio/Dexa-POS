import * as React from "react";
import Svg, { Circle } from "react-native-svg";

interface DecorativePlantProps {
  color?: string;
  width?: number;
  height?: number;
}

const DecorativePlant = ({
  color = "#9CA3AF",
  width = 50,
  height = 50,
  ...props
}: DecorativePlantProps) => {
  const defaultSize = 50;
  const scale = Math.min((width || defaultSize) / defaultSize, (height || defaultSize) / defaultSize);

  return (
    <Svg width={width} height={height} viewBox="0 0 50 50" fill="none" preserveAspectRatio="none" {...props}>
      <Circle cx="25" cy="25" r={22 * scale} fill={color} />
    </Svg>
  );
};

export default DecorativePlant;
