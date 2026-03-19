import * as React from "react";
import Svg, { Circle, Rect, G } from "react-native-svg";

interface TableCircle6ChairProps {
  color?: string;
  chairColor?: string;
  width?: number;
  height?: number;
}

// 6 chairs evenly spaced at 0°, 60°, 120°, 180°, 240°, 300°
// Center (60,60), table r=32. Chair orbit = r + half chair thickness = 32 + 6 = 38
const ANGLES = [0, 60, 120, 180, 240, 300];
const CENTER = 60;
const CHAIR_ORBIT = 38;
const CHAIR_W = 16;
const CHAIR_H = 12;

const TableCircle6Chair = ({
  color = "#2DD4BF",
  width = 120,
  height = 120,
}: TableCircle6ChairProps) => (
  <Svg width={width} height={height} viewBox="0 0 120 120" fill="none">
    {/* Chairs rendered first so table draws on top */}
    {ANGLES.map((angleDeg) => {
      const rad = (angleDeg * Math.PI) / 180;
      const cx = CENTER + CHAIR_ORBIT * Math.sin(rad);
      const cy = CENTER - CHAIR_ORBIT * Math.cos(rad);
      return (
        <G key={angleDeg} transform={`translate(${cx}, ${cy}) rotate(${angleDeg})`}>
          <Rect
            x={-CHAIR_W / 2}
            y={-CHAIR_H / 2}
            width={CHAIR_W}
            height={CHAIR_H}
            rx="3"
            fill={color}
            fillOpacity="0.08"
            stroke={color}
            strokeWidth="1"
          />
        </G>
      );
    })}
    {/* Table surface */}
    <Circle cx="60" cy="60" r="32"
      fill={color} fillOpacity="0.12" stroke={color} strokeWidth="1.5" />
    {/* Center detail */}
    <Circle cx="60" cy="60" r="6"
      fill={color} fillOpacity="0.18" stroke={color} strokeWidth="0.75" />
  </Svg>
);

export default TableCircle6Chair;
