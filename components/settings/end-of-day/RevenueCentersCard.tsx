import { Canvas, Path } from "@shopify/react-native-skia";
import React from "react";
import { View } from "react-native";
import LegendRow from "./LegendRow";

// --- Mock Data & Colors ---
const revenueCentersData = [
  { label: "Dinning Room 1", value: 27.25, color: "#60a5fa" }, // blue-400
  { label: "Tax 2", value: 1.5, color: "#ec4899" }, // pink-500
];
// --- Main Card Component ---
const RevenueCentersCard = () => {
  // --- Chart Calculations ---
  const size = 150;
  const strokeWidth = 15;
  const center = size / 2;
  const radii = [center - strokeWidth / 2, center - strokeWidth * 2]; // Radii for outer and inner rings

  const maxValue = Math.max(...revenueCentersData.map((item) => item.value));
  const totalAngle = 270; // The arc will span 270 degrees
  const startAngle = -225; // Start from the bottom-left

  // --- Helper to create an SVG arc path ---
  const createArcPath = (radius: number, sweepAngle: number) => {
    const startRad = startAngle * (Math.PI / 180);
    const endRad = (startAngle + sweepAngle) * (Math.PI / 180);
    return `M ${center + radius * Math.cos(startRad)} ${center + radius * Math.sin(startRad)}
            A ${radius} ${radius} 0 ${sweepAngle > 180 ? 1 : 0} 1 ${center + radius * Math.cos(endRad)} ${center + radius * Math.sin(endRad)}`;
  };

  const trackPath = createArcPath(radii[0], totalAngle); // Background track for the outer ring

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
            {/* Data Arcs */}
            {revenueCentersData.map((item, index) => {
              const sweepAngle = (item.value / maxValue) * totalAngle;
              const path = createArcPath(radii[index], sweepAngle);
              return (
                <Path
                  key={item.label}
                  path={path}
                  color={item.color}
                  style="stroke"
                  strokeWidth={strokeWidth}
                  strokeCap="round"
                />
              );
            })}
          </Canvas>
        </View>

        {/* Legend */}
        <View className="flex-1 ml-6 space-y-3">
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
