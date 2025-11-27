import React from "react";
import { Svg, Rect } from "react-native-svg";

const ZoneRectangle = ({ color = "#888", width = 100, height = 100 }) => (
  <Svg width={width} height={height} viewBox="0 0 100 100">
    <Rect
      width="100"
      height="100"
      fill={color}
      fillOpacity="0.2"
      stroke={color}
      strokeWidth="2"
      strokeDasharray="5,5"
    />
  </Svg>
);

export default ZoneRectangle;
