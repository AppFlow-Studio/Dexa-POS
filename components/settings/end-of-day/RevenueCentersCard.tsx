// 👇 1. Import the necessary hooks for animation
import { Canvas, Path, interpolateColors } from "@shopify/react-native-skia";
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
const revenueCentersData = [
  { label: "Dinning Room 1", value: 27.25, color: "#60a5fa" }, // blue-400
  { label: "Tax 2", value: 1.5, color: "#ec4899" }, // pink-500
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

// --- 2. Reusable Animated Arc Component ---
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
      strokeCap="round"
    />
  );
};

// --- Main Card Component ---
const RevenueCentersCard = () => {
  // --- 3. Animation Setup ---
  const progress = useSharedValue(0);
  useEffect(() => {
    progress.value = withTiming(1, { duration: 1200 });
  }, [progress]);

  // --- Chart Calculations ---
  const size = 150;
  const strokeWidth = 15;
  const center = size / 2;
  const radii = [center - strokeWidth / 2, center - strokeWidth * 2]; // Radii for outer and inner rings

  const maxValue = Math.max(...revenueCentersData.map((item) => item.value));
  const totalAngle = 270; // The arc will span 270 degrees
  const startAngle = -225; // Start from the bottom-left

  const trackPath = `M ${center + radii[0] * Math.cos(startAngle * (Math.PI / 180))} ${center + radii[0] * Math.sin(startAngle * (Math.PI / 180))}
                   A ${radii[0]} ${radii[0]} 0 1 1 ${center + radii[0] * Math.cos((startAngle + totalAngle) * (Math.PI / 180))} ${center + radii[0] * Math.sin((startAngle + totalAngle) * (Math.PI / 180))}`;

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
            {/* 4. Render the Animated Arcs */}
            {revenueCentersData.map((item, index) => {
              const sweepAngle = (item.value / maxValue) * totalAngle;
              return (
                <AnimatedArc
                  key={item.label}
                  center={center}
                  radius={radii[index]}
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
          {revenueCentersData.map((item) => (
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

export default RevenueCentersCard;
