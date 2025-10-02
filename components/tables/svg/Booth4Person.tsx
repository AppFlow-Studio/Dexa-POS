import * as React from "react";
import Svg, { Rect } from "react-native-svg";

interface Booth4PersonProps {
  color?: string;
  width?: number;
  height?: number;
}

const Booth4Person = ({
  color = "#F1F1F1",
  width = 120,
  height = 90,
  ...props
}: Booth4PersonProps) => (
  <Svg
    width={width}
    height={height}
    viewBox="0 0 120 90"
    fill="none"
    {...props}
  >
    {/* Table */}
    <Rect x="35" y="15" width="50" height="60" rx="6" fill={color} />
    {/* Left Booth Seat */}
    <Rect x="0" y="10" width="25" height="70" rx="6" fill={color} />
    {/* Right Booth Seat */}
    <Rect x="95" y="10" width="25" height="70" rx="6" fill={color} />
  </Svg>
);

export default Booth4Person;
