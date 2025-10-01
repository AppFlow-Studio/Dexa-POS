import { Canvas, Path, interpolateColors } from "@shopify/react-native-skia";
import React, { useEffect, useMemo, type FC } from "react";
import { Text, View } from "react-native";
import {
  SharedValue,
  useDerivedValue,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import LegendRow from "./LegendRow";

// --- Mock Data & Colors ---
const salesTaxesData = [
  { label: "Total net sales", value: 27.25, color: "#8b5cf6" }, // purple-500
  { label: "Tax", value: 1.5, color: "#ec4899" }, // pink-500
];

const totalValue = salesTaxesData.reduce((acc, item) => acc + item.value, 0);

// --- Type Definitions for AnimatedArc ---
interface AnimatedArcProps {
  center: { x: number; y: number };
  innerRadius: number;
  strokeWidth: number;
  startAngle: number;
  sweepAngle: number;
  color: string;
  // 👇 2. Use the correct type for the progress shared value
  progress: SharedValue<number>;
}

// --- Reusable Animated Arc Component ---
const AnimatedArc: FC<AnimatedArcProps> = ({
  center,
  innerRadius,
  strokeWidth,
  startAngle,
  sweepAngle,
  color,
  progress,
}) => {
  const animatedPath = useDerivedValue(() => {
    const currentSweep = sweepAngle * progress.value;
    const startRad = startAngle * (Math.PI / 180);
    const endRad = (startAngle + currentSweep) * (Math.PI / 180);

    return `M ${center.x + innerRadius * Math.cos(startRad)} ${
      center.y + innerRadius * Math.sin(startRad)
    }
            A ${innerRadius} ${innerRadius} 0 0 1 ${
      center.x + innerRadius * Math.cos(endRad)
    } ${center.y + innerRadius * Math.sin(endRad)}`;
  });

  const animatedColor = useDerivedValue(() => {
    return interpolateColors(progress.value, [0, 1], ["#f3f4f6", color]);
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

// --- Main Card Component (No changes needed here) ---
const SalesTaxesSummaryCard = () => {
  const progress = useSharedValue(0);
  useEffect(() => {
    progress.value = withTiming(1, { duration: 1200 });
  }, [progress]);

  const strokeWidth = 16;
  const radius = 70;
  const innerRadius = radius - strokeWidth;
  const size = radius * 2;
  const center = { x: radius, y: radius };

  const chartSegments = useMemo(() => {
    let startAngle = -180;
    return salesTaxesData.map((item) => {
      const sweepAngle = (item.value / totalValue) * 180;
      const segment = { ...item, startAngle, sweepAngle };
      startAngle += sweepAngle;
      return segment;
    });
  }, []);

  return (
    <View>
      <View className="flex-row items-center">
        {/* Chart Container */}
        <View className="w-40 h-20 relative">
          <Canvas
            style={{
              width: size,
              height: size,
              position: "absolute",
              top: 0,
              left: 0,
            }}
          >
            {chartSegments.map((segment, index) => (
              <AnimatedArc
                key={index}
                center={center}
                innerRadius={innerRadius}
                strokeWidth={strokeWidth}
                startAngle={segment.startAngle}
                sweepAngle={segment.sweepAngle}
                color={segment.color}
                progress={progress}
              />
            ))}
          </Canvas>

          {/* Center Label */}
          <View className="absolute top-8 left-0 right-0 bottom-0 flex items-center justify-start pt-1">
            <Text className="text-xs text-gray-300">Total Sales</Text>
            <Text className="text-xl font-bold text-white">
              ${totalValue.toFixed(2)}
            </Text>
          </View>
        </View>

        {/* Legend */}
        <View className="flex-1 ml-4 gap-y-2">
          {salesTaxesData.map((item) => (
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

export default SalesTaxesSummaryCard;
