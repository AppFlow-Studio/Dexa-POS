import * as React from "react";
import Svg, { Rect } from "react-native-svg";

interface Booth4PersonProps {
  color?: string;
  chairColor?: string;
  width?: number;
  height?: number;
}

const Booth4Person = ({
  color = "#2DD4BF",
  width = 120,
  height = 90,
  ...props
}: Booth4PersonProps) => (
  <Svg width={width} height={height} viewBox="0 0 120 90" fill="none" {...props}>
    <Rect x="35" y="15" width="50" height="60" rx="6" fill={color} fillOpacity="0.12" stroke={color} strokeWidth="1.5" />
    <Rect x="0" y="10" width="25" height="70" rx="6" fill={color} fillOpacity="0.08" stroke={color} strokeWidth="1" />
    <Rect x="95" y="10" width="25" height="70" rx="6" fill={color} fillOpacity="0.08" stroke={color} strokeWidth="1" />
  </Svg>
);

export default Booth4Person;
