import React, { useEffect } from "react";
import { View } from "react-native";
import { LineChart } from "@/components/charts/LazyGiftedCharts";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

// --- Mock Data ---
const orderAcceptanceData = [
  { hour: 6, dineIn: 48, takeout: 20 },
  { hour: 8, dineIn: 68, takeout: 18 },
  { hour: 10, dineIn: 70, takeout: 22 },
  { hour: 12, dineIn: 45, takeout: 25 },
  { hour: 14, dineIn: 85, takeout: 30 },
  { hour: 16, dineIn: 90, takeout: 15 },
  { hour: 18, dineIn: 65, takeout: 35 },
  { hour: 20, dineIn: 105, takeout: 40 },
];

const COLORS = { dineIn: "#3b82f6", takeout: "#f97316" };

const OrderAcceptanceChart = () => {
  // --- Data Transformation ---
  // react-native-gifted-charts needs separate arrays for each line.

  // Data for the first line (Dine-In). This array includes the labels for the X-axis.
  const dineInData = orderAcceptanceData.map((item) => ({
    value: item.dineIn,
    label: item.hour.toString(), // X-axis labels go here
  }));

  // Data for the second line (Takeout). No labels needed here.
  const takeoutData = orderAcceptanceData.map((item) => ({
    value: item.takeout,
  }));

  // Animation setup for slide-up effect (preserved from your original code)
  const translateY = useSharedValue(300);
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));
  useEffect(() => {
    translateY.value = withTiming(0, { duration: 800 });
  }, [translateY]);

  return (
    <View className="h-[300px] overflow-hidden">
      <Animated.View style={[{ height: 300 }, animatedStyle]}>
        <LineChart
          // --- Data ---
          data={dineInData} // Primary line data
          data2={takeoutData} // Secondary line data
          // --- Chart-wide Styling ---
          curved
          isAnimated
          animationDuration={1200}
          // --- Line 1 Styling (Dine-In) ---
          areaChart // Enable area chart for the first line
          color={COLORS.dineIn}
          startFillColor={COLORS.dineIn}
          startOpacity={0.2}
          endOpacity={0.05}
          thickness={3}
          // --- Line 2 Styling (Takeout) ---
          color2={COLORS.takeout}
          thickness2={3}
          dashWidth={6} // Set dash properties for the second line
          dashGap={6}
          // --- Axis Styling ---
          xAxisColor={"#e5e7eb"}
          yAxisColor={"#e5e7eb"}
          rulesColor={"#e5e7eb"}
          yAxisTextStyle={{ color: "#6b7280" }}
          xAxisLabelTextStyle={{ color: "#6b7280" }}
          // yAxisLabelFormatter={(value) => value.toString()} // Format Y-axis labels
          // Hide the dots on the lines for a cleaner look
          hideDataPoints
        />
      </Animated.View>
    </View>
  );
};

export default OrderAcceptanceChart;
