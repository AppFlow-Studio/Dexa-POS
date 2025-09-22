import { Canvas, Path, interpolateColors } from "@shopify/react-native-skia";
import React, { useEffect } from "react";
import { Text, View } from "react-native";
import {
  useDerivedValue,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import LegendRow from "./LegendRow"; // Assuming this component exists

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
  // Animation Setup ---
  const progress = useSharedValue(0);
  useEffect(() => {
    // Animate from 0 to 1 over 1.2 seconds
    progress.value = withTiming(1, { duration: 1200 });
  }, [progress]);

  // --- Chart Calculations ---
  const strokeWidth = 15;
  const size = 160;
  const radius = size / 2 - strokeWidth / 2;
  const center = size / 2;
  const totalAngle = 180; // A full semi-circle
  const startAngle = -180; // Start from the left

  // Static path for the gray background track
  const trackPath = `M ${center + radius * Math.cos(startAngle * (Math.PI / 180))} ${center + radius * Math.sin(startAngle * (Math.PI / 180))}
                   A ${radius} ${radius} 0 0 1 ${center + radius * Math.cos((startAngle + totalAngle) * (Math.PI / 180))} ${center + radius * Math.sin((startAngle + totalAngle) * (Math.PI / 180))}`;

  // Create animated values for the progress arc ---
  const animatedPath = useDerivedValue(() => {
    const sweepAngle = paymentData.progress * totalAngle * progress.value; // Grow the arc with progress
    const startRad = startAngle * (Math.PI / 180);
    const endRad = (startAngle + sweepAngle) * (Math.PI / 180);
    return `M ${center + radius * Math.cos(startRad)} ${center + radius * Math.sin(startRad)}
            A ${radius} ${radius} 0 0 1 ${center + radius * Math.cos(endRad)} ${center + radius * Math.sin(endRad)}`;
  });

  const animatedColor = useDerivedValue(() => {
    return interpolateColors(
      progress.value,
      [0, 1],
      ["#f3f4f6", paymentData.color]
    ); // gray-100 to final blue
  });

  return (
    <View className="bg-white">
      <View className="flex-row items-center">
        {/* Chart Container */}
        <View className="w-48 h-24 relative">
          <Canvas
            style={{
              width: size,
              height: size,
              position: "absolute",
              top: 0,
              left: 15,
            }}
          >
            {/* Background Track (Static) */}
            <Path
              path={trackPath}
              color="#f3f4f6" // gray-100
              style="stroke"
              strokeWidth={strokeWidth}
              strokeCap="round"
            />
            {/* Progress Arc (Animated) */}
            <Path
              path={animatedPath}
              color={animatedColor}
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
        <View className="flex-1 ml-6 gap-y-3 justify-center">
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
