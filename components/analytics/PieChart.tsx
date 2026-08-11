import { iosOnly } from "@/lib/safeAnimations";
import { colors as themeColors } from "@/lib/theme";
import React, { FC, useEffect, useState } from "react";
import { Text, TouchableOpacity, View } from "react-native";
import Animated, {
  FadeIn,
  FadeOut,
  interpolate,
  SharedValue,
  useAnimatedProps,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import Svg, { Circle, Path } from "react-native-svg";

// --- TYPE DEFINITIONS (from your code) ---

export type RevenueDataItem = {
  name: string;
  originalData: {
    name: string;
    quantity: number;
    revenue: number;
  };
  value: number;
};

type PieChartProps = {
  data: RevenueDataItem[];
  size?: number;
  strokeWidth?: number;
  colors?: string[];
  animationDuration?: number;
  onDataPointPress?: (data: PieChartDataItem | null) => void;
};

export type PieChartDataItem = {
  color: string;
  percent: number;
  name: string;
  value: number;
  originalData: RevenueDataItem["originalData"];
};

// --- HELPER COMPONENTS ---

const AnimatedPath = Animated.createAnimatedComponent(Path);

const polarToCartesian = (
  centerX: number,
  centerY: number,
  radius: number,
  angleInDegrees: number
): { x: number; y: number } => {
  "worklet";
  const angleInRadians = ((angleInDegrees - 90) * Math.PI) / 180.0;
  return {
    x: centerX + radius * Math.cos(angleInRadians),
    y: centerY + radius * Math.sin(angleInRadians),
  };
};

// Function to calculate the SVG Path 'd' attribute for an arc segment
const describeArc = (
  x: number,
  y: number,
  radius: number,
  startAngle: number,
  endAngle: number
): string => {
  "worklet";
  const start = polarToCartesian(x, y, radius, endAngle);
  const end = polarToCartesian(x, y, radius, startAngle);
  const largeArcFlag = endAngle - startAngle <= 180 ? "0" : "1";

  return [
    "M",
    start.x,
    start.y,
    "A",
    radius,
    radius,
    0,
    largeArcFlag,
    0,
    end.x,
    end.y,
  ].join(" ");
};

export const PieChartSegment: FC<{
  center: number;
  radius: number;
  strokeWidth: number;
  color: string;
  circumference: number;
  angle: number; // Start Angle of the segment
  percent: number;
  progress: SharedValue<number>;
  onPress?: () => void;
  isPressed?: boolean;
}> = ({
  center,
  radius,
  strokeWidth,
  color,
  angle,
  percent,
  progress,
  onPress,
  isPressed = false,
}) => {
  // Calculate the end angle for the full segment
  const segmentEndAngle = angle + percent * 360;

  const animatedProps = useAnimatedProps(() => {
    // Animate the end angle from the start angle to the final end angle
    const currentEndAngle = interpolate(
      progress.value,
      [0, 1],
      [angle, segmentEndAngle]
    );

    // Calculate the path for the animated angle
    const path = describeArc(center, center, radius, angle, currentEndAngle);

    return {
      d: path, // Animate the Path 'd' attribute
      // No need for separate transform here as path is drawn correctly
    };
  });

  const segmentColor = isPressed ? `${color}99` : color;

  return (
    <AnimatedPath
      fill="transparent"
      stroke={segmentColor}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      // @ts-ignore
      animatedProps={animatedProps}
      onPress={onPress}
    />
  );
};

// ... (Rest of the helper components/functions are the same)
const Tooltip: FC<{ item: PieChartDataItem }> = ({ item }) => {
  if (!item) return null;
  return (
    <Animated.View
      entering={iosOnly(FadeIn.duration(200))}
      exiting={iosOnly(FadeOut.duration(200))}
      style={{
        position: 'absolute',
        top: -20,
        backgroundColor: themeColors.card,
        padding: 10,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: themeColors.border,
        zIndex: 10,
      }}
    >
      <Text style={{ fontSize: 12, fontWeight: '700', color: themeColors.heading, textAlign: 'center', marginBottom: 2 }}>
        {item.name}
      </Text>
      <Text style={{ fontSize: 11, color: themeColors.label, textAlign: 'center' }}>
        ${item.value.toFixed(2)} ({(item.percent * 100).toFixed(1)}%)
      </Text>
    </Animated.View>
  );
};

const DEFAULT_COLORS = [themeColors.teal, "#60A5FA", "#FBBF24", "#34D399", "#F87171", "#A78BFA", "#FB923C"];

const convertToPieChartData = (
  data: RevenueDataItem[],
  colors: string[] = DEFAULT_COLORS
): PieChartDataItem[] => {
  const totalValue = data.reduce((sum, item) => sum + item.value, 0);
  return data.map((item, index) => ({
    name: item.name,
    value: item.value,
    originalData: item.originalData,
    percent: totalValue > 0 ? item.value / totalValue : 0,
    color: colors[index % colors.length],
  }));
};

export const PieChart = ({
  data,
  size = 220,
  strokeWidth = 24,
  colors = DEFAULT_COLORS,
  animationDuration = 1000,
  onDataPointPress,
}: PieChartProps) => {
  const progress = useSharedValue(0);
  const [chartData, setChartData] = useState<PieChartDataItem[]>([]);
  const [startAngles, setStartAngles] = useState<number[]>([]);
  const [selectedSegment, setSelectedSegment] = useState<number | null>(null);

  const center = size / 2;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  useEffect(() => {
    if (data && data.length > 0) {
      const convertedData = convertToPieChartData(data, colors);
      let angle = 0;
      const angles: number[] = [];
      convertedData.forEach((item) => {
        angles.push(angle);
        angle += item.percent * 360;
      });
      setChartData(convertedData);
      setStartAngles(angles);
      progress.value = 0;
      progress.value = withTiming(1, { duration: animationDuration });
    }
  }, [data, colors]);

  const handleSegmentPress = (index: number | null) => {
    const newIndex = selectedSegment === index ? null : index;
    setSelectedSegment(newIndex);
    if (onDataPointPress) {
      onDataPointPress(newIndex === null ? null : chartData[newIndex]);
    }
  };

  if (!data || data.length === 0) {
    return (
      <View style={{ backgroundColor: themeColors.panel, borderRadius: 10, padding: 16, borderWidth: 1, borderColor: themeColors.border, alignItems: 'center', justifyContent: 'center', height: 180 }}>
        <Text style={{ fontSize: 13, color: themeColors.label }}>No data available</Text>
      </View>
    );
  }

  const selectedItem =
    selectedSegment !== null ? chartData[selectedSegment] : null;

  return (
    <View className="flex-row items-center justify-between">
      {/* Left Side: Chart and Tooltip */}
      <View className="w-1/2 items-center justify-center relative">
        {selectedItem && <Tooltip item={selectedItem} />}

        {/* Note: Rotation is handled by the Path logic, but we still apply a -90deg rotation on the whole SVG for the 12 o'clock start */}
        <View style={{ transform: [{ rotateZ: "-90deg" }] }}>
          <Svg viewBox={`0 0 ${size} ${size}`} width={size} height={size}>
            {/* Background Track (Circle) */}
            <Circle
              cx={center}
              cy={center}
              r={radius}
              stroke={themeColors.border}
              strokeWidth={strokeWidth}
              fill="transparent"
            />
            {/* Data Segments (Path - which has a precise touch area) */}
            {chartData.map((item, index) => (
              <PieChartSegment
                key={`${item.color}-${index}`}
                center={center}
                radius={radius}
                circumference={circumference}
                angle={startAngles[index]}
                color={item.color}
                percent={item.percent}
                strokeWidth={strokeWidth}
                progress={progress}
                onPress={() => handleSegmentPress(index)}
                isPressed={selectedSegment === index}
              />
            ))}

            {/* FIX: Blocking Circle to catch presses in the donut hole */}
            {/* r is slightly smaller than radius - strokeWidth / 2 for visual clearance */}
            <Circle
              cx={center}
              cy={center}
              r={radius - strokeWidth / 2}
              fill="transparent"
              onPress={() => handleSegmentPress(null)} // Deselect on donut hole press
            />
          </Svg>
        </View>
      </View>

      {/* Right Side: Legend */}
      <View className="w-1/2 pl-4">
        {chartData.map((item, index) => (
          <TouchableOpacity
            key={item.name}
            onPress={() => handleSegmentPress(index)}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              padding: 6,
              borderRadius: 8,
              marginBottom: 4,
              backgroundColor: selectedSegment === index ? themeColors.card : 'transparent',
            }}
          >
            <View
              style={{ width: 10, height: 10, borderRadius: 5, marginRight: 8, backgroundColor: item.color }}
            />
            <View style={{ flex: 1 }}>
              <Text style={{ color: themeColors.heading, fontSize: 12, fontWeight: '500' }} numberOfLines={1}>
                {item.name}
              </Text>
              <Text style={{ color: themeColors.label, fontSize: 11 }}>
                ${item.value.toFixed(2)}
              </Text>
            </View>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
};
