import React from "react";
import { Svg, Rect } from "react-native-svg";

const ZoneRectangle = ({ color = "#2DD4BF", width = 100, height = 100 }) => {
  const defaultSize = 100;
  const scaleX = (width || defaultSize) / defaultSize;

  return (
    <Svg width={width} height={height} viewBox="0 0 100 100" preserveAspectRatio="none">
      <Rect
        width="100"
        height="100"
        fill={color}
        fillOpacity="0.07"
        stroke={color}
        strokeWidth={1.5 * scaleX}
        strokeDasharray="6,4"
        strokeOpacity="0.6"
      />
    </Svg>
  );
};

export default ZoneRectangle;
