import { colors } from "@/lib/theme";
import { useAnalyticsStore } from "@/stores/useAnalyticsStore";
import { format } from "date-fns";
import { JSX } from "react";
import { Dimensions, Text, View } from "react-native";
import { LineChart } from "react-native-gifted-charts";

const screenWidth = Dimensions.get("window").width;

const getXAxisLabelInterval = (dataLength: number) => {
  if (dataLength <= 14) return 1;
  if (dataLength <= 60) return 7;
  return 30;
};

export default function GiftedChartsSalesTrendChart() {
  const { currentReportData, isLoading, error } = useAnalyticsStore();

  const rawData = currentReportData?.chartData || [];

  const processedData = rawData
    .map((item) => {
      const parts = item.date?.split("/");
      let date = new Date();
      if (parts?.length === 3) {
        // Assuming MM/DD/YYYY
        date = new Date(`${parts[2]}-${parts[0]}-${parts[1]}`);
      }
      return {
        ...item,
        dateObj: date,
        isValid: !isNaN(date.getTime()),
      };
    })
    .filter((item) => item.isValid)
    .sort((a, b) => a.dateObj.getTime() - b.dateObj.getTime());

  const formattedData = processedData.map((item) => ({
    value: item.value || item.revenue || item.quantity || 0,
    label: format(item.dateObj, "M/d"),
    date: format(item.dateObj, "yyyy-MM-dd"),
  }));

  const containerWidth = screenWidth * 0.9;
  const dataSpacing =
    formattedData.length > 1 ? containerWidth / formattedData.length : 0;

  const interval = getXAxisLabelInterval(formattedData.length);
  const xAxisLabels = formattedData
    .map((item, index) => (index % interval === 0 ? item.label : null))
    .filter((l): l is string => l !== null);

  if (isLoading) {
    return (
      <View className="h-[300px] w-full bg-panel rounded-2xl border border-border items-center justify-center">
        <Text className="text-gray-400 text-lg">Loading chart...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View className="h-[300px] w-full bg-panel rounded-2xl border border-border items-center justify-center">
        <Text className="text-red-400 text-lg">Error loading chart</Text>
      </View>
    );
  }

  if (!formattedData || formattedData.length === 0) {
    return (
      <View className="h-[300px] w-full bg-panel rounded-2xl border border-border items-center justify-center">
        <Text className="text-gray-400 text-lg">No data available</Text>
      </View>
    );
  }

  return (
    <View className="h-[300px] w-full flex justify-end bg-panel rounded-2xl border border-border p-4 overflow-hidden pb-8">
      <LineChart
        data={formattedData}
        areaChart
        curved
        isAnimated
        disableScroll
        focusEnabled
        spacing={dataSpacing}
        animateOnDataChange
        animationDuration={1000}
        startFillColor={colors.info}
        endFillColor={`${colors.info}33`}
        startOpacity={0.8}
        endOpacity={0.3}
        color={colors.info}
        thickness={2}
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
          pointerLabelComponent: (items: any): JSX.Element => {
            const item = items[0];
            return (
              <View className="h-36 w-28 justify-center -mt-8 -ml-10">
                <Text className="color-white text-sm mb-1.5 text-center">
                  {item.date}
                </Text>
                <View className="px-3.5 py-1.5 rounded-2xl bg-white">
                  <Text className="font-bold text-center">
                    {"$ " + item.value.toFixed(2)}
                  </Text>
                </View>
              </View>
            );
          },
        }}
        xAxisColor={colors.border}
        xAxisLabelTextStyle={{ color: "white" }}
        xAxisLabelTexts={xAxisLabels.filter((l) => l)}
        rotateLabel
        xAxisIndicesHeight={10}
        xAxisIndicesColor="white"
        yAxisColor={colors.border}
        yAxisTextStyle={{ color: "white" }}
        noOfSections={4}
        hideDataPoints
      />
    </View>
  );
}
