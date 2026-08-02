import { colors } from "@/lib/theme";
import { useAnalyticsStore } from "@/stores/useAnalyticsStore";
import { format } from "date-fns";
import { JSX } from "react";
import { Dimensions, Text, View } from "react-native";
import { LineChart } from "@/components/charts/LazyGiftedCharts";

const screenWidth = Dimensions.get("window").width;

/**
 * The slice of a report row this chart consumes. `currentReportData` is
 * declared `null as any` in useAnalyticsStore, so annotating at this boundary
 * is what types the whole pipeline below — without it every `.map`/`.filter`
 * callback param inherits `any` from the store and trips noImplicitAny.
 *
 * All fields optional: which one carries the measure depends on the report
 * (`value` for sales, `revenue`/`quantity` for the item reports), hence the
 * fallback chain in `formattedData`.
 */
interface SalesTrendDatum {
  date?: string;
  value?: number;
  revenue?: number;
  quantity?: number;
}

const getXAxisLabelInterval = (dataLength: number) => {
  if (dataLength <= 14) return 1;
  if (dataLength <= 60) return 7;
  return 30;
};

export default function GiftedChartsSalesTrendChart() {
  const { currentReportData, isLoading, error } = useAnalyticsStore();

  const rawData: SalesTrendDatum[] = currentReportData?.chartData || [];

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
        <Text style={{ color: colors.label, fontSize: 13 }}>Loading chart...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View className="h-[300px] w-full bg-panel rounded-2xl border border-border items-center justify-center">
        <Text style={{ color: colors.danger, fontSize: 13 }}>Error loading chart</Text>
      </View>
    );
  }

  if (!formattedData || formattedData.length === 0) {
    return (
      <View className="h-[300px] w-full bg-panel rounded-2xl border border-border items-center justify-center">
        <Text style={{ color: colors.label, fontSize: 13 }}>No data available</Text>
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
        startFillColor={colors.teal}
        endFillColor={`${colors.teal}33`}
        startOpacity={0.6}
        endOpacity={0.1}
        color={colors.teal}
        thickness={2}
        pointerConfig={{
          pointerStripHeight: 160,
          pointerStripColor: colors.border,
          pointerStripWidth: 1,
          pointerColor: colors.teal,
          radius: 5,
          pointerLabelWidth: 100,
          pointerLabelHeight: 70,
          activatePointersOnLongPress: true,
          autoAdjustPointerLabelPosition: false,
          pointerLabelComponent: (items: any): JSX.Element => {
            const item = items[0];
            return (
              <View style={{ height: 60, width: 100, justifyContent: 'center', marginTop: -32, marginLeft: -40 }}>
                <Text style={{ color: colors.label, fontSize: 10, textAlign: 'center', marginBottom: 3 }}>
                  {item.date}
                </Text>
                <View style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }}>
                  <Text style={{ color: colors.teal, fontWeight: '700', fontSize: 12, textAlign: 'center' }}>
                    {"$ " + item.value.toFixed(2)}
                  </Text>
                </View>
              </View>
            );
          },
        }}
        xAxisColor={colors.border}
        xAxisLabelTextStyle={{ color: colors.label, fontSize: 10 }}
        xAxisLabelTexts={xAxisLabels.filter((l) => l)}
        rotateLabel
        xAxisIndicesHeight={8}
        xAxisIndicesColor={colors.border}
        yAxisColor={colors.border}
        yAxisTextStyle={{ color: colors.label, fontSize: 10 }}
        noOfSections={4}
        hideDataPoints
      />
    </View>
  );
}
