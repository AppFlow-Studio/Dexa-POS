import * as React from "react";
import Svg, { Circle, Path } from "react-native-svg";

interface TableCircle6ChairProps {
  color?: string;
  width?: number;
  height?: number;
}

const TableCircle6Chair = ({
  color = "#F1F1F1",
  width = 120,
  height = 120,
  ...props
}: TableCircle6ChairProps) => (
  <Svg
    width={width}
    height={height}
    viewBox="0 0 120 120"
    fill="none"
    {...props}
  >
    {/* Table */}
    <Circle cx="60" cy="60" r="35" fill={color} />
    {/* Chairs */}
    <Path
      d="M48 4C48 1.79086 49.7909 0 52 0H68C70.2091 0 72 1.79086 72 4V8H48V4Z"
      fill={color}
    />
    <Path
      d="M48 116C48 118.209 49.7909 120 52 120H68C70.2091 120 72 118.209 72 116V112H48V116Z"
      fill={color}
    />
    <Path
      d="M12 28C9.79086 28 8 29.7909 8 32V48H4V32C4 29.7909 5.79086 28 8 28H12Z"
      transform="rotate(45 12 28)"
      fill={color}
    />
    <Path
      d="M108 28C110.209 28 112 29.7909 112 32V48H116V32C116 29.7909 114.209 28 112 28H108Z"
      transform="rotate(-45 108 28)"
      fill={color}
    />
    <Path
      d="M12 92C9.79086 92 8 90.2091 8 88V72H4V88C4 90.2091 5.79086 92 8 92H12Z"
      transform="rotate(-45 12 92)"
      fill={color}
    />
    <Path
      d="M108 92C110.209 92 112 90.2091 112 88V72H116V88C116 90.2091 114.209 92 112 92H108Z"
      transform="rotate(45 108 92)"
      fill={color}
    />
  </Svg>
);

export default TableCircle6Chair;
