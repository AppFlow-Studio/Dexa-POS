import { Canvas, interpolateColors, Path } from "@shopify/react-native-skia";
import React, { useEffect, type FC } from "react";
import { View } from "react-native";
import {
  SharedValue,
  useDerivedValue,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import LegendRow from "./LegendRow"; // Assuming this component exists

// --- Mock Data & Colors ---
const totalVoidsData = [
  { label: "Void amount", value: 27.25, color: "#86efac" }, // green-300
  { label: "Void order count", value: 100, color: "#fcd34d" }, // amber-300
  { label: "Voit item count", value: 15, color: "#a5b4fc" }, // indigo-300
  { label: "Void percentage", value: 1238.5, color: "#f97316" }, // orange-500
];

// --- Type Definitions for AnimatedArc ---
interface AnimatedArcProps {
  center: number;
  radius: number;
  strokeWidth: number;
  startAngle: number;
  sweepAngle: number;
  color: string;
  progress: SharedValue<number>;
}

// Reusable Animated Arc Component ---
const AnimatedArc: FC<AnimatedArcProps> = ({
  center,
  radius,
  strokeWidth,
  startAngle,
  sweepAngle,
  color,
  progress,
}) => {
  // Animate the path of the arc based on progress
  const animatedPath = useDerivedValue(() => {
    const currentSweep = sweepAngle * progress.value;
    const startRad = startAngle * (Math.PI / 180);
    const endRad = (startAngle + currentSweep) * (Math.PI / 180);
    return `M ${center + radius * Math.cos(startRad)} ${center + radius * Math.sin(startRad)}
            A ${radius} ${radius} 0 ${currentSweep > 180 ? 1 : 0} 1 ${center + radius * Math.cos(endRad)} ${center + radius * Math.sin(endRad)}`;
  });

  // Animate the color of the arc
  const animatedColor = useDerivedValue(() => {
    return interpolateColors(progress.value, [0, 1], ["#f3f4f6", color]); // gray-100 to final color
  });

  return (
    <Path
      path={animatedPath}
      color={animatedColor}
      style="stroke"
      strokeWidth={strokeWidth}
      strokeCap="butt" // Use "butt" for flat ends
    />
  );
};

// --- Main Card Component ---
const TotalVoidsCard = () => {
  // Animation Setup ---
  const progress = useSharedValue(0);
  useEffect(() => {
    progress.value = withTiming(1, { duration: 1200 });
  }, [progress]);

  // --- Chart Calculations ---
  const size = 150;
  const strokeWidth = 15;
  const center = size / 2;
  const radii = [
    center - strokeWidth * 0.5,
    center - strokeWidth * 1.5,
    center - strokeWidth * 2.5,
    center - strokeWidth * 3.5,
  ];

  const maxValue = Math.max(...totalVoidsData.map((item) => item.value));
  const totalAngle = 270;
  const startAngle = 135;

  // --- Helper to format values for the legend ---
  const formatValue = (item: (typeof totalVoidsData)[0]) => {
    if (item.label.includes("amount")) return `$${item.value.toFixed(2)}`;
    if (item.label.includes("percentage")) return `${item.value.toFixed(1)}%`;
    return item.value.toString();
  };

  return (
    <View className="bg-white p-6 rounded-2xl border border-gray-200">
      <View className="flex-row items-center">
        {/* Chart Container */}
        <View style={{ width: size, height: size }}>
          <Canvas style={{ flex: 1 }}>
            {/* 4. Render the Animated Arcs */}
            {totalVoidsData.map((item, index) => {
              const reversedIndex = totalVoidsData.length - 1 - index;
              const sweepAngle = (item.value / maxValue) * totalAngle;
              return (
                <AnimatedArc
                  key={item.label}
                  center={center}
                  radius={radii[reversedIndex]}
                  strokeWidth={strokeWidth}
                  startAngle={startAngle}
                  sweepAngle={sweepAngle}
                  color={item.color}
                  progress={progress}
                />
              );
            })}
          </Canvas>
        </View>

        {/* Legend */}
        <View className="flex-1 ml-6 gap-y-3">
          {totalVoidsData.map((item) => (
            <LegendRow
              key={item.label}
              color={item.color}
              label={item.label}
              value={item.value}
            />
          ))}
        </View>
      </View>
    </View>
  );
};

export default TotalVoidsCard;
