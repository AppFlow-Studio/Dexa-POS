import React from "react";
import { Svg, Rect } from "react-native-svg";

const ZoneRectangle = ({ color = "#888", width = 100, height = 100 }) => {
  const defaultSize = 100;
  const scaleX = (width || defaultSize) / defaultSize;

  return (
    <Svg width={width} height={height} viewBox="0 0 100 100" preserveAspectRatio="none">
      <Rect
        width="100"
        height="100"
        fill={color}
        fillOpacity="0.2"
        stroke={color}
        strokeWidth={2 * scaleX}
        strokeDasharray="5,5"
      />
    </Svg>
  );
};

export default ZoneRectangle;
