import React, { useEffect } from "react";
import { View } from "react-native";
// 👇 Import Skia and Reanimated hooks
import { Canvas, Path, interpolateColors } from "@shopify/react-native-skia";
import {
  SharedValue,
  useDerivedValue,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import LegendRow from "./LegendRow"; // Assuming LegendRow is in a separate file

// --- Mock Data & Colors ---
const itemsSoldData = [
  { label: "Foods", value: 52.1, color: "#f97316" }, // orange-500
  { label: "Drinks", value: 22.8, color: "#60a5fa" }, // blue-400
  { label: "Desserts", value: 13.9, color: "#86efac" }, // green-300
  { label: "Snaks", value: 11.2, color: "#a5b4fc" }, // indigo-300
];

interface AnimatedSliceProps {
  center: number;
  radius: number;
  strokeWidth: number;
  startAngle: number;
  sweepAngle: number;
  color: string;
  progress: SharedValue<number>;
  gap: number;
}

// --- A helper component to render and animate each individual slice ---
const AnimatedSlice = ({
  center,
  radius,
  strokeWidth,
  startAngle,
  sweepAngle,
  color,
  progress,
  gap,
}: AnimatedSliceProps) => {
  // We apply a small gap to the sweep angle to create the space between slices
  const adjustedSweepAngle = sweepAngle - gap;

  // Animate the path of the arc
  const animatedPath = useDerivedValue(() => {
    const currentSweep = adjustedSweepAngle * progress.value;
    const startRad = startAngle * (Math.PI / 180);
    const endRad = (startAngle + currentSweep) * (Math.PI / 180);

    return `M ${center + radius * Math.cos(startRad)} ${center + radius * Math.sin(startRad)}
            A ${radius} ${radius} 0 ${currentSweep > 180 ? 1 : 0} 1 ${center + radius * Math.cos(endRad)} ${center + radius * Math.sin(endRad)}`;
  });

  // Animate the color of the arc
  const animatedColor = useDerivedValue(() => {
    return interpolateColors(progress.value, [0, 1], ["#e5e7eb", color]); // gray-200 to final color
  });

  return (
    <Path
      path={animatedPath}
      style="stroke"
      strokeWidth={strokeWidth}
      color={animatedColor}
      // 👇 This is the key for the rounded ends
      strokeCap="round"
    />
  );
};

// --- Main Component ---
const TotalItemsSoldChart = () => {
  // --- Chart Calculations ---
  const size = 200;
  const strokeWidth = 30;
  const center = size / 2;
  const radius = size / 2 - strokeWidth / 2;
  const totalValue = itemsSoldData.reduce((acc, item) => acc + item.value, 0);
  const gap = 4; // The gap between slices in degrees

  // --- Animation Setup ---
  const progress = useSharedValue(0);
  useEffect(() => {
    progress.value = withTiming(1, { duration: 1200 });
  }, [progress]);

  // --- Calculate Angles ---
  const segments = React.useMemo(() => {
    let startAngle = -90; // Start from the top
    return itemsSoldData.map((item) => {
      // Each slice starts a little further along to create the gap
      const effectiveStartAngle = startAngle + gap / 2;
      const sweepAngle = (item.value / totalValue) * 360;
      const segment = { ...item, startAngle: effectiveStartAngle, sweepAngle };
      startAngle += sweepAngle;
      return segment;
    });
  }, [totalValue]);

  return (
    <View>
      <View className="h-[300px] w-[200px] m-auto">
        <Canvas style={{ flex: 1 }}>
          {segments.map((segment, index) => (
            <AnimatedSlice
              key={index}
              center={center}
              radius={radius}
              strokeWidth={strokeWidth}
              startAngle={segment.startAngle}
              sweepAngle={segment.sweepAngle}
              color={segment.color}
              progress={progress}
              gap={gap}
            />
          ))}
        </Canvas>
      </View>
      <View className="mt-4 gap-y-3">
        {itemsSoldData.map((item) => (
          <LegendRow key={item.label} {...item} />
        ))}
      </View>
    </View>
  );
};

export default TotalItemsSoldChart;
