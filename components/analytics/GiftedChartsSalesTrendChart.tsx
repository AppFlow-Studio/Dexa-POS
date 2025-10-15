import { useAnalyticsStore } from "@/stores/useAnalyticsStore";
import { JSX } from "react";
import { Text, View } from "react-native";
import { LineChart } from "react-native-gifted-charts";

export default function GiftedChartsSalesTrendChart() {
  const { currentReportData, isLoading, error } = useAnalyticsStore();

  const formattedData =
    currentReportData?.chartData?.map((item, index) => ({
      value: item.value || item.revenue || item.quantity || 0,
      label: item.date || item.name || "N/A",
      date: item.date || item.name || "N/A",
    })) || [];

  if (isLoading) {
    return (
      <View className="h-[300px] w-full bg-[#303030] rounded-2xl border border-gray-600 items-center justify-center">
        <Text className="text-gray-400 text-lg">Loading chart...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View className="h-[300px] w-full bg-[#303030] rounded-2xl border border-gray-600 items-center justify-center">
        <Text className="text-red-400 text-lg">Error loading chart</Text>
      </View>
    );
  }

  if (!formattedData || formattedData.length === 0) {
    return (
      <View className="h-[300px] w-full bg-[#303030] rounded-2xl border border-gray-600 items-center justify-center">
        <Text className="text-gray-400 text-lg">No data available</Text>
      </View>
    );
  }

  return (
    <View className="h-[300px] w-full bg-[#303030] rounded-2xl border border-gray-600 p-4 overflow-hidden">
      <LineChart
        data={formattedData}
        areaChart
        curved
        isAnimated
        animateOnDataChange
        animationDuration={1000}
        // Styling properties to match the previous chart
        startFillColor="#60a5fa"
        endFillColor="#60a5fa33"
        startOpacity={0.8}
        endOpacity={0.3}
        color="#60a5fa"
        thickness={2}
        // Pointer configuration for tooltip
        pointerConfig={{
          pointerStripHeight: 160,
          pointerStripColor: "lightgray",
          pointerStripWidth: 2,
          pointerColor: "lightgray",
          radius: 6,
          pointerLabelWidth: 100,
          pointerLabelHeight: 90,
          activatePointersOnLongPress: true,
          autoAdjustPointerLabelPosition: false,
          pointerLabelComponent: (
            items: Array<{ value: number; date: string }>
          ): JSX.Element => {
            return (
              <View
                style={{
                  height: 90,
                  width: 100,
                  justifyContent: "center",
                  marginTop: -30,
                  marginLeft: -40,
                }}
              >
                <Text
                  style={{
                    color: "white",
                    fontSize: 14,
                    marginBottom: 6,
                    textAlign: "center",
                  }}
                >
                  {items[0].date}
                </Text>
                <View
                  style={{
                    paddingHorizontal: 14,
                    paddingVertical: 6,
                    borderRadius: 16,
                    backgroundColor: "white",
                  }}
                >
                  <Text style={{ fontWeight: "bold", textAlign: "center" }}>
                    {"$" + items[0].value.toFixed(2)}
                  </Text>
                </View>
              </View>
            );
          },
        }}
        // X-axis styling
        xAxisColor={"#374151"}
        xAxisLabelTextStyle={{ color: "white" }}
        // Y-axis styling
        yAxisColor={"#374151"}
        yAxisTextStyle={{ color: "white" }}
        noOfSections={4}
        // Hide data point dots
        hideDataPoints
      />
    </View>
  );
}
