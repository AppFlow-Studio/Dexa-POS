import React from "react";
import { Dimensions, Text, View } from "react-native";
import { BarChart, LineChart } from "react-native-gifted-charts";
import { PieChart } from "./PieChart";

// --- Main ReportChart Component Types ---
interface ReportChartProps {
  data: any[];
  chartType: "bar" | "line" | "pie";
  title?: string;
  onDataPointPress?: (dataPoint: any) => void;
}

interface ChartDataItem {
  value: number;
  label: string;
  topLabelComponent?: () => React.ReactElement;
  originalData?: any;
  name?: string;
}

export default function ReportChart({
  data,
  chartType,
  title,
  onDataPointPress,
}: ReportChartProps) {
  if (!data || data.length === 0) {
    return (
      <View className="h-64 bg-[#303030] rounded-2xl border border-gray-600 items-center justify-center p-4">
        <Text className="text-gray-400 text-lg">No data available</Text>
      </View>
    );
  }

  const renderChart = () => {
    switch (chartType) {
      case "bar": {
        const formattedData: ChartDataItem[] = data.map((item) => ({
          value:
            item.value || item.revenue || item.quantity || item.orders || 0,
          label:
            item.name ||
            item.date?.replace("/2025", "") ||
            item.hour ||
            item.employee ||
            item.method ||
            "N/A",
          topLabelComponent: () => (
            <Text
              style={{
                color: "white",
                fontSize: 10,
                width: 50,
                textAlign: "center",
              }}
            >
              {item.value || item.revenue || item.quantity || item.orders || 0}
            </Text>
          ),
          originalData: item,
        }));

        const chartWidth = Dimensions.get("window").width - 70;

        return (
          <BarChart
            data={formattedData}
            isAnimated
            animationDuration={800}
            width={chartWidth}
            disableScroll
            spacing={20}
            frontColor={"#60a5fa"}
            xAxisLabelTextStyle={{
              color: "white",
              fontSize: 10,
              textAlign: "center",
            }}
            yAxisTextStyle={{ color: "white" }}
            xAxisColor={"#374151"}
            yAxisColor={"#374151"}
            rulesColor={"#374151"}
            onPress={(item: any) => {
              if (onDataPointPress) {
                onDataPointPress(item.originalData);
              }
            }}
          />
        );
      }

      case "line": {
        const formattedData: ChartDataItem[] = data.map((item) => ({
          value:
            item.value || item.revenue || item.quantity || item.orders || 0,
          label:
            item.name || item.date?.replace("/2025", "") || item.hour || "N/A",
          originalData: item,
        }));

        return (
          <LineChart
            isAnimated
            animationDuration={1000}
            animateOnDataChange
            onDataChangeAnimationDuration={500}
            data={formattedData}
            curved
            areaChart
            startFillColor="#60a5fa"
            endFillColor="#60a5fa33"
            startOpacity={0.8}
            endOpacity={0.3}
            color="#60a5fa"
            thickness={2}
            xAxisLabelTextStyle={{ color: "white" }}
            yAxisTextStyle={{ color: "white" }}
            xAxisColor={"#374151"}
            yAxisColor={"#374151"}
            rulesColor={"#374151"}
            hideDataPoints
            pointerConfig={{
              pointerStripHeight: 160,
              pointerStripColor: "lightgray",
              pointerStripWidth: 2,
              pointerColor: "lightgray",
              radius: 6,
              pointerLabelWidth: 120,
              pointerLabelHeight: 90,
              activatePointersOnLongPress: true,
              autoAdjustPointerLabelPosition: false,
              pointerLabelComponent: (items: any[]) => {
                if (onDataPointPress && items[0]?.originalData) {
                  onDataPointPress(items[0].originalData);
                }
                return (
                  <View className="h-24 w-28 justify-center items-center mt-[-30px] ml-[-40px]">
                    <Text className="text-white text-center mb-2">
                      {items[0].label}
                    </Text>
                    <View className="px-4 py-2 rounded-2xl bg-white">
                      <Text className="font-bold text-center">
                        {"$" + items[0].value.toFixed(2)}
                      </Text>
                    </View>
                  </View>
                );
              },
            }}
          />
        );
      }

      case "pie": {
        const formattedData = data.map((item) => ({
          value:
            item.value || item.revenue || item.quantity || item.orders || 0,
          name:
            item.name || item.date?.replace("/2025", "") || item.hour || "N/A",
          originalData: item,
        }));
        return (
          <PieChart data={formattedData} onDataPointPress={onDataPointPress} />
        );
      }

      default:
        return (
          <View className="h-56 items-center justify-center">
            <Text className="text-gray-400">
              Unsupported chart type: {chartType}
            </Text>
          </View>
        );
    }
  };

  return (
    <View className="bg-[#303030] min-h-[350px] overflow-hidden">
      {title && (
        <Text className="text-white text-lg font-semibold mb-4">{title}</Text>
      )}
      <View>{renderChart()}</View>
    </View>
  );
}
