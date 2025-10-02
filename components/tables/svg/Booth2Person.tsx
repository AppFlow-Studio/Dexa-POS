import * as React from "react";
import Svg, { Rect } from "react-native-svg";

interface Booth2PersonProps {
  color?: string;
  width?: number;
  height?: number;
}

const Booth2Person = ({
  color = "#F1F1F1",
  width = 70,
  height = 90,
  ...props
}: Booth2PersonProps) => (
  <Svg width={width} height={height} viewBox="0 0 70 90" fill="none" {...props}>
    {/* Table */}
    <Rect x="25" y="15" width="20" height="60" rx="4" fill={color} />
    {/* Left Booth Seat */}
    <Rect x="0" y="10" width="15" height="70" rx="6" fill={color} />
    {/* Right Booth Seat */}
    <Rect x="55" y="10" width="15" height="70" rx="6" fill={color} />
  </Svg>
);

export default Booth2Person;
