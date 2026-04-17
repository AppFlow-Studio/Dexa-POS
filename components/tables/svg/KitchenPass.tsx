import * as React from "react";
import Svg, { Rect, Line } from "react-native-svg";

interface KitchenPassProps {
  color?: string;
  width?: number;
  height?: number;
}

// viewBox 0 0 180 25
// Kitchen pass-through window seen from above:
//   - Outer rect = the pass-through opening frame / ledge
//   - Inner rect = the opening/window area (slightly lighter fill)
//   - Dashed center line = suggests the window opening plane
//   - Small tick marks at intervals = shelf support points
const KitchenPass = React.memo(function KitchenPass({
  color = "#94A3B8",
  width = 180,
  height = 25,
}: KitchenPassProps) {
  return (
    <Svg width={width} height={height} viewBox="0 0 180 25" fill="none">
    {/* Frame / surround */}
    <Rect
      x="0.75"
      y="0.75"
      width="178.5"
      height="23.5"
      rx="2"
      fill="#1E2340"
      stroke={color}
      strokeWidth="1.5"
    />
    {/* Pass-through opening — lighter inner fill */}
    <Rect
      x="6"
      y="4"
      width="168"
      height="17"
      rx="1"
      fill={color}
      fillOpacity="0.10"
      stroke={color}
      strokeWidth="0.75"
      strokeOpacity="0.4"
    />
    {/* Center dashed line — the pass-through plane / window edge */}
    <Line
      x1="6"
      y1="12.5"
      x2="174"
      y2="12.5"
      stroke={color}
      strokeWidth="0.75"
      strokeOpacity="0.5"
      strokeDasharray="8 5"
    />
    {/* Tick marks — shelf support points at ~30px intervals */}
    <Line x1="36" y1="4" x2="36" y2="21" stroke={color} strokeWidth="0.75" strokeOpacity="0.3" />
    <Line x1="66" y1="4" x2="66" y2="21" stroke={color} strokeWidth="0.75" strokeOpacity="0.3" />
    <Line x1="96" y1="4" x2="96" y2="21" stroke={color} strokeWidth="0.75" strokeOpacity="0.3" />
    <Line x1="126" y1="4" x2="126" y2="21" stroke={color} strokeWidth="0.75" strokeOpacity="0.3" />
    <Line x1="156" y1="4" x2="156" y2="21" stroke={color} strokeWidth="0.75" strokeOpacity="0.3" />
    </Svg>
  );
});

export default KitchenPass;
