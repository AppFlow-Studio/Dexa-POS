import {
  Canvas,
  Circle,
  interpolateColors,
  Path,
  Text as SkiaText,
  useFont,
} from "@shopify/react-native-skia";
import React, { useEffect } from "react";
import { View } from "react-native";
import {
  useDerivedValue,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import inter from "../../../assets/fonts/Inter-Medium.ttf";
import LegendRow from "./LegendRow";

// --- Mock Data & Colors ---
const tipoutData = {
  label: "Cash before tipouts",
  value: 27.25,
  progress: 0.85, // 85% progress to match the visual
  displayValue: -2.29,
  color: "#C798F5", // purple-500
};

// --- Main Card Component ---
const ServerTipoutsCard = () => {
  // Animation Setup ---
  const progress = useSharedValue(0);
  useEffect(() => {
    progress.value = withTiming(1, { duration: 1200 });
  }, [progress]);

  // Load font for Skia Text.
  const font = useFont(inter as any, 12);
  const boldFont = useFont(inter as any, 20);

  // --- Chart Calculations ---
  const size = 120;
  const strokeWidth = 12;
  const center = size / 2;
  const radius = center - strokeWidth / 2;
  const totalAngle = 300;
  const startAngle = 120;

  const trackPath = `M ${
    center + radius * Math.cos(startAngle * (Math.PI / 180))
  } ${center + radius * Math.sin(startAngle * (Math.PI / 180))}
                   A ${radius} ${radius} 0 ${totalAngle > 180 ? 1 : 0} 1 ${
    center + radius * Math.cos((startAngle + totalAngle) * (Math.PI / 180))
  } ${center + radius * Math.sin((startAngle + totalAngle) * (Math.PI / 180))}`;

  const animatedPath = useDerivedValue(() => {
    const sweepAngle = tipoutData.progress * totalAngle * progress.value;
    const startRad = startAngle * (Math.PI / 180);
    const endRad = (startAngle + sweepAngle) * (Math.PI / 180);
    return `M ${center + radius * Math.cos(startRad)} ${
      center + radius * Math.sin(startRad)
    }
            A ${radius} ${radius} 0 ${sweepAngle > 180 ? 1 : 0} 1 ${
      center + radius * Math.cos(endRad)
    } ${center + radius * Math.sin(endRad)}`;
  });

  const animatedColor = useDerivedValue(() => {
    return interpolateColors(
      progress.value,
      [0, 1],
      ["#f3f4f6", tipoutData.color]
    );
  });

  const animatedOpacity = useDerivedValue(() => progress.value);

  const textY1 = center - 8;
  const textY2 = center + 16;
  const textX1 = font ? center - font.measureText("Total Sales").width / 2 : 0;
  const textX2 = boldFont
    ? center -
      boldFont.measureText(`${tipoutData.displayValue.toFixed(2)}`).width / 2
    : 0;

  return (
    <View>
      <View className="flex-row items-center">
        {/* Chart Container */}
        <View style={{ width: size, height: size }}>
          <Canvas style={{ flex: 1 }}>
            <Path
              path={trackPath}
              color="#f3f4f6"
              style="stroke"
              strokeWidth={strokeWidth}
              strokeCap="round"
            />
            <Path
              path={animatedPath}
              color={animatedColor}
              style="stroke"
              strokeWidth={strokeWidth}
              strokeCap="round"
            />
            <Circle
              cx={center}
              cy={center}
              r={radius - strokeWidth}
              color={tipoutData.color}
              opacity={animatedOpacity}
            />
            {font && (
              <SkiaText
                x={textX1}
                y={textY1}
                text="Total Sales"
                font={font}
                color="white"
                opacity={animatedOpacity}
              />
            )}
            {boldFont && (
              <SkiaText
                x={textX2}
                y={textY2}
                text={`${tipoutData.displayValue.toFixed(2)}`}
                font={boldFont}
                color="white"
                opacity={animatedOpacity}
              />
            )}
          </Canvas>
        </View>

        {/* Legend */}
        <View className="flex-1 ml-4 justify-center">
          <LegendRow
            color={tipoutData.color}
            label={tipoutData.label}
            value={tipoutData.value}
          />
        </View>
      </View>
    </View>
  );
};

export default ServerTipoutsCard;
