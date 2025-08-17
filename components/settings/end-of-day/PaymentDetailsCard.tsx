import { Canvas, Path } from "@shopify/react-native-skia";
import React from "react";
import { Text, View } from "react-native";
import LegendRow from "./LegendRow";

// --- Mock Data & Colors for this specific component ---
const paymentData = {
  label: "Total",
  value: 0.0,
  progress: 0.75, // 75% progress to match the visual
  displayValue: -2.29,
  color: "#3b82f6", // blue-500
};

// --- Main Card Component ---
const PaymentDetailsCard = () => {
  // --- Chart Calculations ---
  const strokeWidth = 20;
  const size = 160;
  const radius = size / 2 - strokeWidth / 2;
  const center = size / 2;
  const totalAngle = 180; // A full semi-circle
  const startAngle = -180; // Start from the left

  // --- Helper to create an SVG arc path ---
  const createArcPath = (sweepAngle: number) => {
    const startRad = startAngle * (Math.PI / 180);
    const endRad = (startAngle + sweepAngle) * (Math.PI / 180);
    return `M ${center + radius * Math.cos(startRad)} ${center + radius * Math.sin(startRad)}
            A ${radius} ${radius} 0 0 1 ${center + radius * Math.cos(endRad)} ${center + radius * Math.sin(endRad)}`;
  };

  const trackPath = createArcPath(totalAngle);
  const progressPath = createArcPath(paymentData.progress * totalAngle);

  return (
    <View className="bg-white">
      <View className="flex-row items-center">
        {/* Chart Container */}
        <View className="w-48 h-24 relative">
          {/* Canvas for drawing the gauge */}
          <Canvas
            style={{
              width: size,
              height: size,
              position: "absolute",
              top: 0,
              left: 15,
            }}
          >
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
              color={paymentData.color}
              style="stroke"
              strokeWidth={strokeWidth}
              strokeCap="round"
            />
          </Canvas>

          {/* Center Label */}
          <View className="absolute top-10 left-0 right-0 bottom-0 flex items-center justify-start pt-2">
            <Text className="text-sm text-gray-500">Total Sales</Text>
            <Text className="text-3xl font-bold text-gray-800">
              -${paymentData.displayValue.toFixed(2)}
            </Text>
          </View>
        </View>

        {/* Legend */}
        <View className="flex-1 ml-6 space-y-3 justify-center">
          <LegendRow
            color={paymentData.color}
            label={paymentData.label}
            value={paymentData.value}
          />
        </View>
      </View>
    </View>
  );
};

export default PaymentDetailsCard;
