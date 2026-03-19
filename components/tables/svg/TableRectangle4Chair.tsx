import * as React from "react";
import Svg, { Path, Rect } from "react-native-svg";

interface TableRectangle4ChairProps {
  color?: string;
  chairColor?: string;
  width?: number;
  height?: number;
}

const TableRectangle4Chair = ({
  color = "#2DD4BF",
  width = 140,
  height = 90,
  ...props
}: TableRectangle4ChairProps) => (
  <Svg width={width} height={height} viewBox="0 0 140 90" fill="none" {...props}>
    <Rect x="20" y="15" width="100" height="60" rx="8" fill={color} fillOpacity="0.12" stroke={color} strokeWidth="1.5" />
    <Path d="M35 4C35 1.79086 36.7909 0 39 0H59C61.2091 0 63 1.79086 63 4V8H35V4Z"
      fill={color} fillOpacity="0.08" stroke={color} strokeWidth="1" />
    <Path d="M81 4C81 1.79086 82.7909 0 85 0H105C107.209 0 109 1.79086 109 4V8H81V4Z"
      fill={color} fillOpacity="0.08" stroke={color} strokeWidth="1" />
    <Path d="M35 86C35 88.2091 36.7909 90 39 90H59C61.2091 90 63 88.2091 63 86V82H35V86Z"
      fill={color} fillOpacity="0.08" stroke={color} strokeWidth="1" />
    <Path d="M81 86C81 88.2091 82.7909 90 85 90H105C107.209 90 109 88.2091 109 86V82H81V86Z"
      fill={color} fillOpacity="0.08" stroke={color} strokeWidth="1" />
  </Svg>
);

export default TableRectangle4Chair;
