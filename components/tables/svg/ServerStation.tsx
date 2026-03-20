import * as React from "react";
import Svg, { Rect, Line } from "react-native-svg";

interface ServerStationProps {
  color?: string;
  width?: number;
  height?: number;
}

// viewBox 0 0 60 40
// Server station seen from above:
//   - Outer rect = station body
//   - Two inner shelf/compartment rects (stacked) suggesting storage cubbies
//   - A small rect on the right side = POS terminal / ticket printer
const ServerStation = ({
  color = "#94A3B8",
  width = 60,
  height = 40,
}: ServerStationProps) => (
  <Svg width={width} height={height} viewBox="0 0 60 40" fill="none">
    {/* Station body */}
    <Rect
      x="0.75"
      y="0.75"
      width="58.5"
      height="38.5"
      rx="4"
      fill="#1E2340"
      stroke={color}
      strokeWidth="1.5"
    />
    {/* Top shelf / compartment */}
    <Rect
      x="6"
      y="5"
      width="36"
      height="13"
      rx="2"
      fill={color}
      fillOpacity="0.08"
      stroke={color}
      strokeWidth="0.75"
      strokeOpacity="0.5"
    />
    {/* Bottom shelf / compartment */}
    <Rect
      x="6"
      y="22"
      width="36"
      height="13"
      rx="2"
      fill={color}
      fillOpacity="0.08"
      stroke={color}
      strokeWidth="0.75"
      strokeOpacity="0.5"
    />
    {/* Divider between shelves */}
    <Line
      x1="6"
      y1="20"
      x2="42"
      y2="20"
      stroke={color}
      strokeWidth="0.5"
      strokeOpacity="0.3"
    />
    {/* Right side: ticket printer / POS terminal */}
    <Rect
      x="46"
      y="6"
      width="9"
      height="28"
      rx="2"
      fill={color}
      fillOpacity="0.12"
      stroke={color}
      strokeWidth="0.75"
    />
    {/* Printer paper slot */}
    <Rect
      x="48"
      y="18"
      width="5"
      height="2"
      rx="1"
      fill={color}
      fillOpacity="0.3"
    />
  </Svg>
);

export default ServerStation;
