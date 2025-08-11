import { topItemsData } from "@/lib/mockData";
import { RoundedRect, useFont } from "@shopify/react-native-skia";
import React from "react";
import { Text, View } from "react-native";
import { CartesianChart } from "victory-native";

// Assumed font path. Adjust to your project structure.
import inter from "../../assets/fonts/Inter-Medium.ttf";

// 2. Pre-process data for the chart
const processedData = topItemsData
  .slice()
  .sort((a, b) => a.quantity - b.quantity)
  .map((item, index) => ({
    ...item,
    category: index, // Add a numeric index for the Y-axis
  }));

const TopItemsBarChart = () => {
  const font = useFont(inter as any, 12);

  return (
    <View className="bg-white p-4 rounded-lg shadow">
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
            labelColor: "#6b7280",
            lineColor: "#e5e7eb",
            lineWidth: 1,
          }}
          yAxis={[
            {
              font,
              tickCount: processedData.length,
              labelColor: "#374151",
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
              <RoundedRect
                key={point.yValue}
                x={chartBounds.left} // Ensure x is a number
                y={(point?.y || 0) - barHeight / 2} // Safely access point.y
                width={point.x - chartBounds.left} // Extends from left edge to the point's x-value
                height={barHeight}
                color={"#60a5fa"}
                // Round the right corners of the bar
                r={4} // Use 'r' for uniform corner radius
              />
            ));
          }}
        </CartesianChart>
      </View>
      {/* Axis Title */}
      <Text className="text-center text-sm text-gray-600 mt-2">
        Quantity Sold
      </Text>
    </View>
  );
};

export default TopItemsBarChart;
