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
}: WallSectionProps) => {
  // Scale viewBox to match actual dimensions
  const defaultWidth = 200;
  const defaultHeight = 10;
  const scaleX = (width || defaultWidth) / defaultWidth;
  const scaleY = (height || defaultHeight) / defaultHeight;

  return (
    <Svg
      width={width}
      height={height}
      viewBox="0 0 200 10"
      fill="none"
      preserveAspectRatio="none"
      {...props}
    >
      <Rect width="200" height="10" rx={5 * scaleY} fill={color} />
    </Svg>
  );
};

export default WallSection;
