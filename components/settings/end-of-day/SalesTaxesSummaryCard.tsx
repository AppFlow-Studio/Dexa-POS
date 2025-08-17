import { Canvas, Path } from "@shopify/react-native-skia";
import React from "react";
import { Text, View } from "react-native";
import LegendRow from "./LegendRow";

// --- Mock Data & Colors ---
const salesTaxesData = [
  { label: "Total net sales", value: 27.25, color: "#8b5cf6" }, // purple-500
  { label: "Tax", value: 1.5, color: "#ec4899" }, // pink-500
];

const totalValue = salesTaxesData.reduce((acc, item) => acc + item.value, 0);

// --- Main Card Component ---
const SalesTaxesSummaryCard = () => {
  // --- Chart Calculations ---
  const strokeWidth = 20;
  const radius = 80;
  const innerRadius = radius - strokeWidth;
  const size = radius * 2;
  const center = { x: radius, y: radius };

  // Calculate the sweep angle for each segment
  let startAngle = -180; // Start from the far left
  const chartSegments = salesTaxesData.map((item) => {
    const sweepAngle = (item.value / totalValue) * 180; // 180 degrees for a semi-circle
    const path = `M ${center.x + innerRadius * Math.cos(startAngle * (Math.PI / 180))} ${center.y + innerRadius * Math.sin(startAngle * (Math.PI / 180))}
                   A ${innerRadius} ${innerRadius} 0 0 1 ${center.x + innerRadius * Math.cos((startAngle + sweepAngle) * (Math.PI / 180))} ${center.y + innerRadius * Math.sin((startAngle + sweepAngle) * (Math.PI / 180))}`;

    startAngle += sweepAngle;
    return { ...item, path };
  });

  return (
    <View className="bg-white ">
      <View className="flex-row items-center">
        {/* Chart Container */}
        <View className="w-48 h-24 relative">
          <Canvas
            style={{
              width: size,
              height: size,
              position: "absolute",
              top: 0,
              left: 0,
            }}
          >
            {/* The comment has been removed from here */}
            {chartSegments.map((segment, index) => (
              <Path
                key={index}
                path={segment.path}
                color={segment.color}
                style="stroke"
                strokeWidth={strokeWidth}
                strokeCap="round"
              />
            ))}
          </Canvas>

          {/* This part is correct because it's OUTSIDE the Canvas */}
          <View className="absolute top-10 left-0 right-0 bottom-0 flex items-center justify-start pt-2">
            <Text className="text-sm text-gray-500">Total Sales</Text>
            <Text className="text-2xl font-bold text-gray-800">
              ${totalValue.toFixed(2)}
            </Text>
          </View>
        </View>

        {/* Legend */}
        <View className="flex-1 ml-6 space-y-3">
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
