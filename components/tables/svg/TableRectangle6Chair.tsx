import * as React from "react";
import Svg, { Path, Rect } from "react-native-svg";

interface TableRectangle6ChairProps {
  color?: string;
  width?: number;
  height?: number;
}

const TableRectangle6Chair = ({
  color = "#F1F1F1",
  width = 180,
  height = 90,
  ...props
}: TableRectangle6ChairProps) => (
  <Svg
    width={width}
    height={height}
    viewBox="0 0 180 90"
    fill="none"
    {...props}
  >
    {/* Table */}
    <Rect x="20" y="15" width="140" height="60" rx="8" fill={color} />
    {/* Top Chairs */}
    <Path
      d="M35 4C35 1.79086 36.7909 0 39 0H59C61.2091 0 63 1.79086 63 4V8H35V4Z"
      fill={color}
    />
    <Path
      d="M80 4C80 1.79086 81.7909 0 84 0H104C106.209 0 108 1.79086 108 4V8H80V4Z"
      fill={color}
    />
    <Path
      d="M125 4C125 1.79086 126.791 0 129 0H149C151.209 0 153 1.79086 153 4V8H125V4Z"
      fill={color}
    />
    {/* Bottom Chairs */}
    <Path
      d="M35 86C35 88.2091 36.7909 90 39 90H59C61.2091 90 63 88.2091 63 86V82H35V86Z"
      fill={color}
    />
    <Path
      d="M80 86C80 88.2091 81.7909 90 84 90H104C106.209 90 108 88.2091 108 86V82H80V86Z"
      fill={color}
    />
    <Path
      d="M125 86C125 88.2091 126.791 90 129 90H149C151.209 90 153 88.2091 153 86V82H125V86Z"
      fill={color}
    />
  </Svg>
);

export default TableRectangle6Chair;
