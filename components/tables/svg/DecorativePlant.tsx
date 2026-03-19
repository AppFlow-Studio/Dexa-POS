import * as React from "react";
import Svg, { Path, Circle, Ellipse } from "react-native-svg";

interface DecorativePlantProps {
  color?: string;
  width?: number;
  height?: number;
}

// viewBox 0 0 50 50
// Pot: trapezoid shape at bottom (wider at top, narrower at base)
// Foliage: overlapping circles clustered at top to suggest a leafy plant
// Default green neon color
const DecorativePlant = ({
  color = "#34D399",
  width = 50,
  height = 50,
}: DecorativePlantProps) => (
  <Svg width={width} height={height} viewBox="0 0 50 50" fill="none">
    {/* Pot body — trapezoid via path: wide top, narrow base */}
    <Path
      d="M15 32 L35 32 L31 45 L19 45 Z"
      fill="#1E2340"
      stroke={color}
      strokeWidth="1.25"
      strokeLinejoin="round"
    />
    {/* Pot rim — slight highlight at top of pot */}
    <Path
      d="M13 30 L37 30 L35 34 L15 34 Z"
      fill={color}
      fillOpacity="0.12"
      stroke={color}
      strokeWidth="1"
      strokeLinejoin="round"
    />
    {/* Main foliage blob */}
    <Circle
      cx="25"
      cy="20"
      r="14"
      fill={color}
      fillOpacity="0.13"
      stroke={color}
      strokeWidth="1.25"
    />
    {/* Secondary foliage blobs — left and right to give bushy silhouette */}
    <Circle
      cx="16"
      cy="23"
      r="9"
      fill={color}
      fillOpacity="0.09"
      stroke={color}
      strokeWidth="0.75"
      strokeOpacity="0.6"
    />
    <Circle
      cx="34"
      cy="23"
      r="9"
      fill={color}
      fillOpacity="0.09"
      stroke={color}
      strokeWidth="0.75"
      strokeOpacity="0.6"
    />
    {/* Top highlight blob */}
    <Circle
      cx="25"
      cy="13"
      r="7"
      fill={color}
      fillOpacity="0.1"
      stroke={color}
      strokeWidth="0.5"
      strokeOpacity="0.4"
    />
    {/* Center leaf highlight */}
    <Ellipse
      cx="25"
      cy="20"
      rx="4"
      ry="6"
      fill={color}
      fillOpacity="0.2"
    />
  </Svg>
);

export default DecorativePlant;
