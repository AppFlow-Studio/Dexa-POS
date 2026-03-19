import * as React from "react";
import Svg, { Rect, Circle, Line } from "react-native-svg";

interface BarSectionProps {
  color?: string;
  width?: number;
  height?: number;
}

// viewBox 0 0 170 100
// Bar counter seen from above:
//   - Large rect = bar top surface (back of bar, against wall)
//   - Thinner rect at front = bar ledge/overhang
//   - 4 bar stools (circles) along the front edge
const BarSection = ({
  color = "#94A3B8",
  width = 170,
  height = 100,
}: BarSectionProps) => (
  <Svg width={width} height={height} viewBox="0 0 170 100" fill="none">
    {/* Bar back body — deep storage/counter area */}
    <Rect
      x="5"
      y="8"
      width="160"
      height="52"
      rx="4"
      fill="#1E2340"
      stroke={color}
      strokeWidth="1.5"
    />
    {/* Bar top surface fill */}
    <Rect
      x="5"
      y="8"
      width="160"
      height="52"
      rx="4"
      fill={color}
      fillOpacity="0.10"
    />
    {/* Inner counter detail line — suggests bar equipment/shelves */}
    <Rect
      x="12"
      y="15"
      width="146"
      height="16"
      rx="2"
      fill={color}
      fillOpacity="0.06"
      stroke={color}
      strokeWidth="0.75"
      strokeOpacity="0.4"
    />
    {/* Second shelf detail */}
    <Rect
      x="12"
      y="36"
      width="146"
      height="16"
      rx="2"
      fill={color}
      fillOpacity="0.06"
      stroke={color}
      strokeWidth="0.75"
      strokeOpacity="0.4"
    />
    {/* Bar front ledge — overhang customers lean on */}
    <Rect
      x="5"
      y="60"
      width="160"
      height="10"
      rx="2"
      fill={color}
      fillOpacity="0.15"
      stroke={color}
      strokeWidth="1"
    />
    {/* Bar stools — 4 circles along front edge */}
    <Circle
      cx="25"
      cy="83"
      r="9"
      fill={color}
      fillOpacity="0.08"
      stroke={color}
      strokeWidth="1"
    />
    <Circle
      cx="63"
      cy="83"
      r="9"
      fill={color}
      fillOpacity="0.08"
      stroke={color}
      strokeWidth="1"
    />
    <Circle
      cx="107"
      cy="83"
      r="9"
      fill={color}
      fillOpacity="0.08"
      stroke={color}
      strokeWidth="1"
    />
    <Circle
      cx="145"
      cy="83"
      r="9"
      fill={color}
      fillOpacity="0.08"
      stroke={color}
      strokeWidth="1"
    />
    {/* Stool center details */}
    <Circle cx="25" cy="83" r="3" fill={color} fillOpacity="0.2" />
    <Circle cx="63" cy="83" r="3" fill={color} fillOpacity="0.2" />
    <Circle cx="107" cy="83" r="3" fill={color} fillOpacity="0.2" />
    <Circle cx="145" cy="83" r="3" fill={color} fillOpacity="0.2" />
  </Svg>
);

export default BarSection;
