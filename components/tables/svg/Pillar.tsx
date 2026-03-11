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
}: PillarProps) => {
  const defaultWidth = 40;
  const defaultHeight = 40;
  const scaleY = (height || defaultHeight) / defaultHeight;

  return (
    <Svg
      width={width}
      height={height}
      viewBox="0 0 40 40"
      fill="none"
      preserveAspectRatio="none"
      {...props}
    >
      <Rect width="40" height="40" rx={8 * scaleY} fill={color} />
    </Svg>
  );
};

export default Pillar;
