import * as React from "react";
import Svg, { Rect, Line } from "react-native-svg";

interface WallSectionProps {
  color?: string;
  width?: number;
  height?: number;
}

// viewBox 0 0 200 10
// Thick architectural wall — dark fill, neon stroke, with a lighter inner highlight
// line to suggest wall thickness/depth.
const WallSection = ({
  color = "#94A3B8",
  width = 200,
  height = 10,
}: WallSectionProps) => (
  <Svg
    width={width}
    height={height}
    viewBox="0 0 200 10"
    fill="none"
    preserveAspectRatio="none"
  >
    {/* Wall body */}
    <Rect
      x="0"
      y="0"
      width="200"
      height="10"
      fill="#1E2340"
      stroke={color}
      strokeWidth="1.5"
    />
    {/* Inner highlight line — suggests top surface of wall thickness */}
    <Line
      x1="0"
      y1="3"
      x2="200"
      y2="3"
      stroke={color}
      strokeWidth="0.5"
      strokeOpacity="0.35"
    />
    {/* Bottom shadow line */}
    <Line
      x1="0"
      y1="7.5"
      x2="200"
      y2="7.5"
      stroke={color}
      strokeWidth="0.5"
      strokeOpacity="0.15"
    />
  </Svg>
);

export default WallSection;
