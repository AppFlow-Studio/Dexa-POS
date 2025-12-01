import React from "react";
import { Svg, Text as SvgText } from "react-native-svg";

const TextLabel = ({ color = "#888", width = 100, height = 50 }) => (
  <Svg width={width} height={height} viewBox="0 0 100 50">
    <SvgText
      x="50"
      y="25"
      textAnchor="middle"
      alignmentBaseline="central"
      fontSize="24"
      fontWeight="bold"
      fill={color}
    >
      Aa
    </SvgText>
  </Svg>
);

export default TextLabel;
