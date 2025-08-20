import { Canvas, Path } from "@shopify/react-native-skia";
import React from "react";
import { View } from "react-native";
import LegendRow from "./LegendRow";

// --- Mock Data & Colors ---
const totalVoidsData = [
  { label: "Void amount", value: 27.25, color: "#86efac" }, // green-300
  { label: "Void order count", value: 100, color: "#fcd34d" }, // amber-300
  { label: "Voit item count", value: 15, color: "#a5b4fc" }, // indigo-300
  { label: "Void percentage", value: 123.5, color: "#f97316" }, // orange-500
];

// --- Main Card Component ---
const TotalVoidsCard = () => {
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

  // Normalize values for arc length calculation
  const maxValue = Math.max(...totalVoidsData.map((item) => item.value));
  const totalAngle = 270; // The arc will span 270 degrees
  const startAngle = 135; // Start from the bottom-left

  // --- Helper to format values for the legend ---
  const formatValue = (item: (typeof totalVoidsData)[0]) => {
    if (item.label.includes("amount")) {
      return `$${item.value.toFixed(2)}`;
    }
    if (item.label.includes("percentage")) {
      return `${item.value.toFixed(1)}%`;
    }
    return item.value.toString();
  };

  // --- Helper to create an SVG arc path ---
  const createArcPath = (radius: number, sweepAngle: number) => {
    const startRad = startAngle * (Math.PI / 180);
    const endRad = (startAngle + sweepAngle) * (Math.PI / 180);
    return `M ${center + radius * Math.cos(startRad)} ${center + radius * Math.sin(startRad)}
            A ${radius} ${radius} 0 ${sweepAngle > 180 ? 1 : 0} 1 ${center + radius * Math.cos(endRad)} ${center + radius * Math.sin(endRad)}`;
  };

  return (
    <View className="bg-white">
      <View className="flex-row items-center">
        {/* Chart Container */}
        <View style={{ width: size, height: size }}>
          <Canvas style={{ flex: 1 }}>
            {/* Data Arcs */}

            {totalVoidsData.map((item, index) => {
              // The order of the rings is reversed to match the design (largest value = outermost ring)
              const reversedIndex = totalVoidsData.length - 1 - index;
              const sweepAngle = (item.value / maxValue) * totalAngle;
              const path = createArcPath(radii[reversedIndex], sweepAngle);
              return (
                <Path
                  key={item.label}
                  path={path}
                  color={item.color}
                  style="stroke"
                  strokeWidth={strokeWidth}
                  // 👇 This is the key for flat ends
                  strokeCap="butt"
                />
              );
            })}
          </Canvas>
        </View>

        {/* Legend */}
        <View className="flex-1 ml-6 space-y-3">
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
