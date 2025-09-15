import { topItemsData } from "@/lib/mockData";
import { RoundedRect, useFont } from "@shopify/react-native-skia";
import React, { useEffect } from "react";
import { Text, View } from "react-native";
import { CartesianChart } from "victory-native";

// Assumed font path. Adjust to your project structure.
import {
  useDerivedValue,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import inter from "../../assets/fonts/Inter-Medium.ttf";

// 2. Pre-process data for the chart
const processedData = topItemsData
  .slice()
  .sort((a, b) => a.quantity - b.quantity)
  .map((item, index) => ({
    ...item,
    category: index, // Add a numeric index for the Y-axis
  }));

const AnimatedBar = ({
  point,
  chartBounds,
  barHeight,
  color,
}: {
  point: { x: number; y: number };
  chartBounds: { left: number; top: number; right: number; bottom: number };
  barHeight: number;
  color: string;
}) => {
  // Shared value for animation progress (0 to 1)
  const progress = useSharedValue(0);

  // Animate the progress value when the component mounts
  useEffect(() => {
    progress.value = withTiming(1, { duration: 800 });
  }, [progress]);

  // Create a derived value for the animated width
  const animatedWidth = useDerivedValue(() => {
    return (point.x - chartBounds.left) * progress.value;
  });

  return (
    <RoundedRect
      x={chartBounds.left}
      y={point.y - barHeight / 2}
      width={animatedWidth}
      height={barHeight}
      color={color}
      r={4}
    />
  );
};

const TopItemsBarChart = () => {
  const font = useFont(inter as any, 12);

  return (
    <View className="bg-[#303030] p-4 rounded-lg shadow border border-background-400">
      {/* Chart container */}
      <View className="h-[250px]">
        <CartesianChart
          data={processedData}
          xKey="quantity"
          yKeys={["category"]}
          domain={{ x: [0, 50] }} // Set the X-axis domain explicitly
          domainPadding={{ top: 20, bottom: 20 }}
          xAxis={{
            font,
            labelColor: "white",
            lineColor: "#e5e7eb",
            lineWidth: 1,
          }}
          yAxis={[
            {
              font,
              tickCount: processedData.length,
              labelColor: "white",
              formatYLabel: (value) => processedData[value]?.name || "",
              lineColor: "transparent",
            },
          ]}
        >
          {/* 👇 This is the fix: Manually render each bar as a RoundedRect */}
          {({ points, chartBounds }) => {
            // Calculate the height for each bar based on available space
            const bandHeight =
              (chartBounds.bottom - chartBounds.top) / processedData.length;
            const barHeight = bandHeight * 0.8; // 80% of the band, leaving 20% for padding

            return points.category.map((point) => (
              <AnimatedBar
                key={point.yValue}
                point={{ x: point.x, y: point.y || 0 }}
                chartBounds={chartBounds}
                barHeight={barHeight}
                color={"#60a5fa"}
              />
            ));
          }}
        </CartesianChart>
      </View>
      {/* Axis Title */}
      <Text className="text-center text-sm text-white mt-2">
        Quantity Sold
      </Text>
    </View>
  );
};

export default TopItemsBarChart;
