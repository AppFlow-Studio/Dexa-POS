import React from "react";
import { Svg, Text as SvgText } from "react-native-svg";

const TextLabel = ({ color = "#888", width = 100, height = 50 }) => {
  const defaultWidth = 100;
  const defaultHeight = 50;
  const scaleY = (height || defaultHeight) / defaultHeight;

  return (
    <Svg width={width} height={height} viewBox="0 0 100 50" preserveAspectRatio="none">
      <SvgText
        x="50"
        y="25"
        textAnchor="middle"
        alignmentBaseline="central"
        fontSize={24 * scaleY}
        fontWeight="bold"
        fill={color}
      >
        Aa
      </SvgText>
    </Svg>
  );
};

export default TextLabel;
