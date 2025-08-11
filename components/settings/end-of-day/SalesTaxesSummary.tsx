import React from "react";
import { Text, View } from "react-native";
import { Pie, PolarChart } from "victory-native";

// --- Mock Data & Colors for this specific component ---
const salesTaxesData = [
  { label: "Total net sales", value: 27.25, color: "#8b5cf6" }, // purple-500
  { label: "Tax", value: 1.5, color: "#ec4899" }, // pink-500
];

const totalValue = salesTaxesData.reduce((acc, item) => acc + item.value, 0);

const LegendRow = ({
  color,
  label,
  value,
}: {
  color: string;
  label: string;
  value: number;
}) => {
  return (
    <View className="flex-row items-center justify-between">
      <View className="flex-row items-center">
        <View
          className="w-2.5 h-2.5 rounded-full mr-3"
          style={{ backgroundColor: color }}
        />
        <Text className="text-gray-600 text-sm">{label}</Text>
      </View>
      <Text className="font-semibold text-gray-800 text-sm">
        ${value.toFixed(2)}
      </Text>
    </View>
  );
};

// --- Main Component ---
const SalesTaxesSummary = () => {
  return (
    <View className="bg-white p-6 rounded-2xl border border-gray-200">
      {/* Card Header */}
      <View className="flex-row justify-between items-start">
        <Text className="text-xl font-bold text-gray-800">
          Sales & Taxes Summary
        </Text>
      </View>

      {/* Card Body */}
      <View className="flex-row items-center mt-4">
        {/* Chart Container */}
        <View className="w-48 h-24 overflow-hidden">
          {/* This container creates the semi-circle clipping effect */}
          <View className="w-48 h-48 -mt-24">
            <PolarChart
              data={salesTaxesData}
              valueKey="value"
              colorKey="color"
              labelKey="label"
            >
              <Pie.Chart
                innerRadius="70%"
                startAngle={-90}
                circleSweepDegrees={180}
              >
                {() => (
                  <>
                    <Pie.Slice />
                    <Pie.SliceAngularInset
                      angularInset={{
                        angularStrokeWidth: 4,
                        angularStrokeColor: "white",
                      }}
                    />
                  </>
                )}
              </Pie.Chart>
            </PolarChart>
            {/* Center Label */}
            <View className="absolute flex items-center justify-center">
              <Text className="text-sm text-gray-500">Total Sales</Text>
              <Text className="text-3xl font-bold text-gray-800">
                ${totalValue.toFixed(2)}
              </Text>
            </View>
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

export default SalesTaxesSummary;
