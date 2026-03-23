import * as React from "react";
import Svg, { Rect } from "react-native-svg";

interface Booth2PersonProps {
  color?: string;
  chairColor?: string;
  width?: number;
  height?: number;
}

const Booth2Person = ({
  color = "#2DD4BF",
  width = 70,
  height = 90,
  ...props
}: Booth2PersonProps) => (
  <Svg width={width} height={height} viewBox="0 0 70 90" fill="none" {...props}>
    {/* Table surface */}
    <Rect x="25" y="15" width="20" height="60" rx="4"
      fill={color} fillOpacity="0.18" stroke={color} strokeWidth="1.5" strokeOpacity="0.8" />
    {/* Booth sides */}
    <Rect x="0" y="10" width="15" height="70" rx="6"
      fill={color} fillOpacity="0.12" stroke={color} strokeWidth="1" strokeOpacity="0.5" />
    <Rect x="55" y="10" width="15" height="70" rx="6"
      fill={color} fillOpacity="0.12" stroke={color} strokeWidth="1" strokeOpacity="0.5" />
  </Svg>
);

export default Booth2Person;
