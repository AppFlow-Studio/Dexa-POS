import React from "react";
import { View } from "react-native";
// 👇 Import Skia components and the useFont hook
import {
  Canvas,
  Circle,
  Path,
  Text as SkiaText,
  useFont,
} from "@shopify/react-native-skia";
// 👇 Make sure you have a font file in your assets
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
  // Load font for Skia Text. The `as any` is a common workaround for this hook.
  const font = useFont(inter as any, 14);
  const boldFont = useFont(inter as any, 24);

  // --- Chart Calculations ---
  const size = 150;
  const strokeWidth = 15;
  const center = size / 2;
  const radius = center - strokeWidth / 2;
  const totalAngle = 300; // The arc will span 300 degrees
  const startAngle = 120; // Start angle to center the gap at the top

  // --- Helper to create an SVG arc path ---
  const createArcPath = (sweepAngle: number) => {
    const startRad = startAngle * (Math.PI / 180);
    const endRad = (startAngle + sweepAngle) * (Math.PI / 180);
    return `M ${center + radius * Math.cos(startRad)} ${center + radius * Math.sin(startRad)}
            A ${radius} ${radius} 0 ${sweepAngle > 180 ? 1 : 0} 1 ${center + radius * Math.cos(endRad)} ${center + radius * Math.sin(endRad)}`;
  };

  const trackPath = createArcPath(totalAngle);
  const progressPath = createArcPath(tipoutData.progress * totalAngle);

  // Calculate text positions for Skia Text
  const textY1 = center - 10;
  const textY2 = center + 20;
  let textX1 = 0;
  let textX2 = 0;
  if (font) {
    textX1 = center - font.measureText("Total Sales").width / 2;
  }
  if (boldFont) {
    textX2 =
      center -
      boldFont.measureText(`-${tipoutData.displayValue.toFixed(2)}`).width / 2;
  }

  return (
    <View className="bg-white">
      <View className="flex-row items-center">
        {/* Chart Container */}
        <View style={{ width: size, height: size }}>
          <Canvas style={{ flex: 1 }}>
            {/* Background Track */}
            <Path
              path={trackPath}
              color="#f3f4f6" // gray-100
              style="stroke"
              strokeWidth={strokeWidth}
              strokeCap="round"
            />
            {/* Progress Arc */}
            <Path
              path={progressPath}
              color={tipoutData.color}
              style="stroke"
              strokeWidth={strokeWidth}
              strokeCap="round"
            />
            {/* Center Circle */}
            <Circle
              cx={center}
              cy={center}
              r={radius - strokeWidth}
              color={`${tipoutData.color}`}
            />
            {/* Center Text (using SkiaText) */}
            {font && (
              <SkiaText
                x={textX1}
                y={textY1}
                text="Total Sales"
                font={font}
                color="white"
              />
            )}
            {boldFont && (
              <SkiaText
                x={textX2}
                y={textY2}
                text={`${tipoutData.displayValue.toFixed(2)}`}
                font={boldFont}
                color="white"
              />
            )}
          </Canvas>
        </View>

        {/* Legend */}
        <View className="flex-1 ml-6 space-y-3 justify-center">
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
