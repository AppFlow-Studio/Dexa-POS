import * as React from "react";
import Svg, { Path, Circle, Ellipse, Line } from "react-native-svg";

interface DecorativePlantProps {
  color?: string;
  width?: number;
  height?: number;
}

const DecorativePlant = ({
  color = "#34D399",
  width = 50,
  height = 50,
}: DecorativePlantProps) => (
  <Svg width={width} height={height} viewBox="0 0 50 60" fill="none">
    {/* ── Pot shadow ── */}
    <Ellipse
      cx="25"
      cy="57"
      rx="9"
      ry="2"
      fill="#000000"
      fillOpacity="0.18"
    />

    {/* ── Pot body ── */}
    <Path
      d="M16 38 L34 38 L31 52 L19 52 Z"
      fill="#1A1F35"
      stroke={color}
      strokeWidth="1"
      strokeOpacity="0.5"
      strokeLinejoin="round"
    />
    {/* Pot highlight stripe */}
    <Path
      d="M19 41 L31 41"
      stroke={color}
      strokeWidth="0.75"
      strokeOpacity="0.2"
      strokeLinecap="round"
    />

    {/* ── Pot rim ── */}
    <Path
      d="M14 36 L36 36 L34 40 L16 40 Z"
      fill={color}
      fillOpacity="0.15"
      stroke={color}
      strokeWidth="0.9"
      strokeOpacity="0.6"
      strokeLinejoin="round"
    />

    {/* ── Stem ── */}
    <Line
      x1="25"
      y1="36"
      x2="25"
      y2="28"
      stroke={color}
      strokeWidth="1.5"
      strokeOpacity="0.5"
      strokeLinecap="round"
    />

    {/* ── Left branch leaf ── */}
    <Path
      d="M25 31 Q18 26 14 20 Q20 22 25 31Z"
      fill={color}
      fillOpacity="0.55"
      stroke={color}
      strokeWidth="0.5"
      strokeOpacity="0.4"
    />
    {/* ── Right branch leaf ── */}
    <Path
      d="M25 29 Q32 24 36 18 Q30 21 25 29Z"
      fill={color}
      fillOpacity="0.55"
      stroke={color}
      strokeWidth="0.5"
      strokeOpacity="0.4"
    />

    {/* ── Back foliage cluster (darker, behind) ── */}
    <Circle
      cx="25"
      cy="17"
      r="11"
      fill={color}
      fillOpacity="0.12"
      stroke={color}
      strokeWidth="0.75"
      strokeOpacity="0.3"
    />

    {/* ── Main foliage blobs ── */}
    <Circle
      cx="19"
      cy="21"
      r="8"
      fill={color}
      fillOpacity="0.45"
      stroke={color}
      strokeWidth="1"
      strokeOpacity="0.7"
    />
    <Circle
      cx="31"
      cy="21"
      r="8"
      fill={color}
      fillOpacity="0.45"
      stroke={color}
      strokeWidth="1"
      strokeOpacity="0.7"
    />
    <Circle
      cx="25"
      cy="14"
      r="9"
      fill={color}
      fillOpacity="0.5"
      stroke={color}
      strokeWidth="1"
      strokeOpacity="0.8"
    />
    <Circle
      cx="25"
      cy="23"
      r="7"
      fill={color}
      fillOpacity="0.4"
      stroke={color}
      strokeWidth="0.75"
      strokeOpacity="0.5"
    />

    {/* ── Top highlight (light specular dot) ── */}
    <Circle
      cx="22"
      cy="10"
      r="3.5"
      fill={color}
      fillOpacity="0.35"
    />
    <Circle
      cx="22"
      cy="10"
      r="1.5"
      fill="#ffffff"
      fillOpacity="0.18"
    />
  </Svg>
);

export default DecorativePlant;
