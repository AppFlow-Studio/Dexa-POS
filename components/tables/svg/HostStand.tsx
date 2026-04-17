import * as React from "react";
import Svg, { Rect, Path } from "react-native-svg";

interface HostStandProps {
  color?: string;
  width?: number;
  height?: number;
}

// viewBox 0 0 40 35
// Host stand / podium seen from above:
//   - Outer rect = podium body
//   - Angled inner shape = reading/writing surface (tapered toward front)
//   - Small rect = book/tablet resting on surface
const HostStand = React.memo(function HostStand({
  color = "#94A3B8",
  width = 40,
  height = 35,
}: HostStandProps) {
  return (
    <Svg width={width} height={height} viewBox="0 0 40 35" fill="none">
      {/* Podium outer body */}
      <Rect
      x="0.75"
      y="0.75"
      width="38.5"
      height="33.5"
      rx="3"
      fill="#1E2340"
      stroke={color}
      strokeWidth="1.5"
    />
    {/* Slanted reading surface — trapezoid, wider at back, narrower at front */}
    <Path
      d="M5 4 L35 4 L31 28 L9 28 Z"
      fill={color}
      fillOpacity="0.10"
      stroke={color}
      strokeWidth="0.75"
      strokeOpacity="0.5"
      strokeLinejoin="round"
    />
    {/* Book / menu / tablet on surface */}
    <Rect
      x="12"
      y="9"
      width="16"
      height="13"
      rx="2"
      fill={color}
      fillOpacity="0.18"
      stroke={color}
      strokeWidth="0.75"
    />
    {/* Book spine line */}
    <Rect
      x="19"
      y="9"
      width="1"
      height="13"
      rx="0.5"
      fill={color}
      fillOpacity="0.3"
    />
    </Svg>
  );
});

export default HostStand;
