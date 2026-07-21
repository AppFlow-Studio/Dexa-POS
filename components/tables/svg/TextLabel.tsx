import * as React from "react";
import { Svg, Text as SvgText } from "react-native-svg";

const TextLabel = React.memo(function TextLabel({ color = "#94A3B8", width = 100, height = 50, label = "Label" }: { color?: string; width?: number; height?: number; label?: string }) {
  const defaultHeight = 50;
  const scaleY = (height || defaultHeight) / defaultHeight;

  return (
    <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMid meet">
      <SvgText
        x={width / 2}
        y={height / 2}
        textAnchor="middle"
        alignmentBaseline="central"
        fontSize={Math.max(10, Math.min(28, height * 0.45 * scaleY))}
        fontWeight="bold"
        fill={color}
        fillOpacity="0.85"
      >
        {label}
      </SvgText>
    </Svg>
  );
});

export default TextLabel;
