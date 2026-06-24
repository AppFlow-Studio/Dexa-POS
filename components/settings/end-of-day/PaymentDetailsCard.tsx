import { Canvas, Path, interpolateColors } from "@shopify/react-native-skia";
import React, { useEffect } from "react";
import { Text, View } from "react-native";
import { useUiScale } from "@/lib/uiScale";
import {
  useDerivedValue,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import LegendRow from "./LegendRow"; // Assuming this component exists

// --- Mock Data & Colors for this specific component ---
const paymentData = {
  label: "Total",
  value: 0.0,
  progress: 0.75, // 75% progress to match the visual
  displayValue: -2.29,
  color: "#3b82f6", // blue-500
};

// --- Main Card Component ---
const PaymentDetailsCard = () => {
  const scale = useUiScale();
  const s = (value: number) => Math.round(value * scale);

  const progress = useSharedValue(0);
  useEffect(() => {
    progress.value = withTiming(1, { duration: 1200 });
  }, [progress]);

  const strokeWidth = s(12);
  const size = s(130);
  const radius = size / 2 - strokeWidth / 2;
  const center = size / 2;
  const totalAngle = 180;
  const startAngle = -180;

  const trackPath = `M ${
    center + radius * Math.cos(startAngle * (Math.PI / 180))
  } ${center + radius * Math.sin(startAngle * (Math.PI / 180))}
                   A ${radius} ${radius} 0 0 1 ${
                     center +
                     radius *
                       Math.cos((startAngle + totalAngle) * (Math.PI / 180))
                   } ${center + radius * Math.sin((startAngle + totalAngle) * (Math.PI / 180))}`;

  const animatedPath = useDerivedValue(() => {
    const sweepAngle = paymentData.progress * totalAngle * progress.value;
    const startRad = startAngle * (Math.PI / 180);
    const endRad = (startAngle + sweepAngle) * (Math.PI / 180);
    return `M ${center + radius * Math.cos(startRad)} ${
      center + radius * Math.sin(startRad)
    }
            A ${radius} ${radius} 0 0 1 ${center + radius * Math.cos(endRad)} ${
              center + radius * Math.sin(endRad)
            }`;
  });

  const animatedColor = useDerivedValue(() => {
    return interpolateColors(
      progress.value,
      [0, 1],
      ["#f3f4f6", paymentData.color]
    );
  });

  return (
    <View>
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        {/* Chart Container */}
        <View style={{ width: s(160), height: s(80), position: "relative" }}>
          <Canvas
            style={{
              width: size,
              height: size,
              position: "absolute",
              top: 0,
              left: s(10),
            }}
          >
            <Path
              path={trackPath}
              color="#f3f4f6"
              style="stroke"
              strokeWidth={strokeWidth}
              strokeCap="round"
            />
            <Path
              path={animatedPath}
              color={animatedColor}
              style="stroke"
              strokeWidth={strokeWidth}
              strokeCap="round"
            />
          </Canvas>

          {/* Center Label */}
          <View
            style={{
              position: "absolute",
              top: s(32),
              left: 0,
              right: 0,
              bottom: 0,
              alignItems: "center",
              justifyContent: "flex-start",
              paddingTop: s(4),
            }}
          >
            <Text style={{ fontSize: s(12), color: "#d1d5db" }}>Total Sales</Text>
            <Text style={{ fontSize: s(24), fontWeight: "bold", color: "#f3f4f6" }}>
              -${paymentData.displayValue.toFixed(2)}
            </Text>
          </View>
        </View>

        {/* Legend */}
        <View style={{ flex: 1, marginLeft: s(16), justifyContent: "center" }}>
          <LegendRow
            color={paymentData.color}
            label={paymentData.label}
            value={paymentData.value}
          />
        </View>
      </View>
    </View>
  );
};

export default PaymentDetailsCard;
