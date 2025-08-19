import { Canvas, Path, interpolateColors } from "@shopify/react-native-skia";
import React, { useEffect } from "react";
import { View } from "react-native";
import {
  useDerivedValue,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

interface DonutChartProps {
  data: {
    value: number;
    color: string;
  }[];
  size: number;
  strokeWidth: number;
}

const AnimatedDonutChart: React.FC<DonutChartProps> = ({
  data,
  size,
  strokeWidth,
}) => {
  const center = size / 2;
  const radius = size / 2 - strokeWidth / 2;
  const totalValue = data.reduce((acc, item) => acc + item.value, 0);

  // 1. Create a shared value for the animation progress
  const progress = useSharedValue(0);

  useEffect(() => {
    // Animate from 0 to 1 over 1.2 seconds
    progress.value = withTiming(1, { duration: 1200 });
  }, [progress]);

  // Create memoized start and sweep angles for each slice
  const segments = React.useMemo(() => {
    let startAngle = -90; // Start from the top
    return data.map((item) => {
      const sweepAngle = (item.value / totalValue) * 360;
      const segment = { ...item, startAngle, sweepAngle };
      startAngle += sweepAngle;
      return segment;
    });
  }, [data, totalValue]);

  return (
    <View style={{ width: size, height: size }}>
      <Canvas style={{ flex: 1 }}>
        {segments.map((segment, index) => (
          <AnimatedSlice
            key={index}
            center={center}
            radius={radius}
            strokeWidth={strokeWidth}
            startAngle={segment.startAngle}
            sweepAngle={segment.sweepAngle}
            color={segment.color}
            progress={progress}
          />
        ))}
      </Canvas>
    </View>
  );
};

// A helper component to render and animate each individual slice
const AnimatedSlice = ({
  center,
  radius,
  strokeWidth,
  startAngle,
  sweepAngle,
  color,
  progress,
}: any) => {
  // 2. Animate the path of the arc
  const animatedPath = useDerivedValue(() => {
    const currentSweep = sweepAngle * progress.value;
    const startRad = startAngle * (Math.PI / 180);
    const endRad = (startAngle + currentSweep) * (Math.PI / 180);

    // Create the SVG path string for the arc
    return `M ${center + radius * Math.cos(startRad)} ${
      center + radius * Math.sin(startRad)
    }
            A ${radius} ${radius} 0 ${currentSweep > 180 ? 1 : 0} 1 ${
              center + radius * Math.cos(endRad)
            } ${center + radius * Math.sin(endRad)}`;
  });

  // 3. Animate the color of the arc
  const animatedColor = useDerivedValue(() => {
    return interpolateColors(progress.value, [0, 1], ["#e5e7eb", color]); // gray-200 to final color
  });

  return (
    <Path
      path={animatedPath}
      style="stroke"
      strokeWidth={strokeWidth}
      color={animatedColor} // Use the animated color
    />
  );
};

export default AnimatedDonutChart;
