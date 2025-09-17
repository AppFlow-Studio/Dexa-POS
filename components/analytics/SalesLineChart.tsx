import { salesData } from "@/lib/mockData";
import {
  Circle,
  DashPathEffect,
  Path,
  RoundedRect,
  Skia,
  Text as SkiaText,
  useFont,
} from "@shopify/react-native-skia";
import React, { useEffect } from "react";
import { Text, View } from "react-native";
import Animated, {
  SharedValue,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { Area, CartesianChart, Line, useChartPressState } from "victory-native";

// Assumed font path. Please adjust to your project structure.
import interBold from "../../assets/fonts/Inter-Bold.ttf";
import inter from "../../assets/fonts/Inter-Medium.ttf";

const COLORS = {
  today: "#3b82f6", // blue-500
  yesterday: "#f97316", // orange-500
  text: "#6b7280", // gray-500
  grid: "#e5e7eb", // gray-200
  cursor: "#d1d5db", // gray-300
  tooltipText: "#333333",
};

// The Tooltip component remains the same.
// Your corrections to remove the 'size' prop from SkiaText were correct,
// as the font size is defined in the `useFont` hook.
function Tooltip({
  x,
  y,
  activeValueToday,
  activeValueYesterday,
  font,
  boldFont,
}: {
  x: SharedValue<number>;
  y: SharedValue<number>;
  activeValueToday: SharedValue<number>;
  activeValueYesterday: SharedValue<number>;
  font: any;
  boldFont: any;
}) {
  const TOOLTIP_WIDTH = 120;
  const TOOLTIP_HEIGHT = 80;
  const tooltipX = useDerivedValue(() => x.value - TOOLTIP_WIDTH / 2);
  const tooltipY = useDerivedValue(() => y.value - TOOLTIP_HEIGHT - 15);
  const formattedToday = useDerivedValue(
    () => `${Math.round(activeValueToday.value)}`
  );
  const formattedYesterday = useDerivedValue(
    () => `${Math.round(activeValueYesterday.value)}`
  );
  const trianglePath = useDerivedValue(() => {
    const p = Skia.Path.Make();
    p.moveTo(x.value - 8, tooltipY.value + TOOLTIP_HEIGHT);
    p.lineTo(x.value + 8, tooltipY.value + TOOLTIP_HEIGHT);
    p.lineTo(x.value, tooltipY.value + TOOLTIP_HEIGHT + 8);
    p.close();
    return p;
  });

  if (!font || !boldFont) return null;

  return (
    <>
      <RoundedRect
        x={tooltipX}
        y={tooltipY}
        width={TOOLTIP_WIDTH}
        height={TOOLTIP_HEIGHT}
        r={5}
        color="white"
      />
      <Path path={trianglePath} color="white" />
      <Circle
        cx={tooltipX.value + 15}
        cy={tooltipY.value + 22}
        r={5}
        color={COLORS.yesterday}
      />
      <SkiaText
        x={tooltipX.value + 25}
        y={tooltipY.value + 27}
        text="Yesterday"
        font={font}
        color={COLORS.text}
      />
      <SkiaText
        x={tooltipX.value + TOOLTIP_WIDTH - 15}
        y={tooltipY.value + 27}
        text={formattedYesterday}
        font={boldFont}
        color={COLORS.tooltipText}
      />
      <Circle
        cx={tooltipX.value + 15}
        cy={tooltipY.value + 45}
        r={5}
        color={COLORS.today}
      />
      <SkiaText
        x={tooltipX.value + 25}
        y={tooltipY.value + 50}
        text="Today"
        font={font}
        color={COLORS.text}
      />
      <SkiaText
        x={tooltipX.value + TOOLTIP_WIDTH - 15}
        y={tooltipY.value + 50}
        text={formattedToday}
        font={boldFont}
        color={COLORS.tooltipText}
      />
    </>
  );
}

const SalesLineChart = () => {
  const font = useFont(inter as any, 14);
  const boldFont = useFont(interBold as any, 16);

  const { state, isActive } = useChartPressState({
    x: 0,
    y: { today: 0, yesterday: 0 },
  });

  const translateY = useSharedValue(300);

  const animatedStyle = useAnimatedStyle(() => {
    return {
      transform: [{ translateY: translateY.value }],
    };
  });

  useEffect(() => {
    translateY.value = withTiming(0, { duration: 800 });
  }, [translateY]);

  return (
    <View>
      <View className="flex-row justify-end mt-2 mb-3 ">
        <View className="flex-row items-center ml-5">
          <View
            className="w-3 h-3 rounded-full mr-2"
            style={{ backgroundColor: COLORS.today }}
          />
          <Text className="text-xl text-gray-500">Today</Text>
        </View>
        <View className="flex-row items-center ml-5">
          <View
            className="w-3 h-3 rounded-full mr-2"
            style={{ backgroundColor: COLORS.yesterday }}
          />
          <Text className="text-xl text-gray-500">Yesterday</Text>
        </View>
      </View>
      <View className="h-[300px] overflow-hidden">
        <Animated.View style={[{ height: 300 }, animatedStyle]}>
          <CartesianChart
            data={salesData}
            xKey="hour"
            yKeys={["today", "yesterday"]}
            domainPadding={{ top: 30, bottom: 20 }}
            axisOptions={{
              font,
              labelColor: COLORS.text,
              // 👇 Renamed from labelFormatter to formatXLabel
              formatXLabel: (v) =>
                `${v % 12 === 0 ? 12 : v % 12}:00 ${v < 12 ? "AM" : "PM"}`,
            }}
            yAxis={[
              {
                font,
                labelColor: COLORS.text,
                // 👇 Renamed from labelFormatter to formatYLabel
                formatYLabel: (v) => `${v}`,
                lineColor: COLORS.grid,
                lineWidth: 1,
                linePathEffect: <DashPathEffect intervals={[4, 8]} />,
              },
            ]}
            chartPressState={state}
          >
            {({ points, chartBounds }) => (
              <>
                <Area
                  points={points.today}
                  y0={chartBounds.bottom}
                  color={COLORS.today}
                  opacity={0.2}
                  curveType="natural"
                  animate={{ type: "timing", duration: 800 }}
                />
                <Line
                  points={points.today}
                  color={COLORS.today}
                  strokeWidth={4}
                  curveType="natural"
                  animate={{ type: "timing", duration: 800 }}
                />
                <Line
                  points={points.yesterday}
                  color={COLORS.yesterday}
                  strokeWidth={3}
                  curveType="natural"
                  animate={{ type: "timing", duration: 800 }}
                >
                  <DashPathEffect intervals={[5, 5]} />
                </Line>

                {isActive && (
                  <>
                    {/* The points array for the cursor line is cleaner without unnecessary xValue/yValue */}
                    <Line
                      points={[
                        {
                          x: state.x.position.value,
                          y: chartBounds.top,
                          xValue: 0,
                          yValue: 0,
                        },
                        {
                          x: state.x.position.value,
                          y: chartBounds.bottom,
                          xValue: 0,
                          yValue: 0,
                        },
                      ]}
                      color={COLORS.cursor}
                      strokeWidth={1}
                      animate={{ type: "timing", duration: 800 }}
                    />
                    <Circle
                      cx={state.x.position}
                      cy={state.y.today.position}
                      r={6}
                      color={COLORS.today}
                    />
                    <Circle
                      cx={state.x.position}
                      cy={state.y.yesterday.position}
                      r={6}
                      color={COLORS.yesterday}
                    />
                    <Tooltip
                      x={state.x.position}
                      y={state.y.today.position}
                      activeValueToday={state.y.today.value}
                      activeValueYesterday={state.y.yesterday.value}
                      font={font}
                      boldFont={boldFont}
                    />
                  </>
                )}
              </>
            )}
          </CartesianChart>
        </Animated.View>
      </View>
    </View>
  );
};

export default SalesLineChart;
