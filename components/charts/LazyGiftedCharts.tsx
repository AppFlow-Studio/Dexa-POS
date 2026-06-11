/**
 * Perf F6: lazy facade over react-native-gifted-charts.
 *
 * expo-router's import mode defaults to 'sync', so every route module — and
 * everything it imports — executes during app boot. The chart lib was being
 * parsed at cold start for screens (analytics, scheduling, profile drawers)
 * that most sessions never open. Metro keeps the module in the bundle but
 * `import()` defers its execution until a chart first renders.
 *
 * Use these exports instead of importing 'react-native-gifted-charts'
 * directly anywhere outside this file.
 */
import { colors } from "@/lib/theme";
import React, { Suspense } from "react";
import { ActivityIndicator, View } from "react-native";

type GiftedCharts = typeof import("react-native-gifted-charts");
type BarChartProps = React.ComponentProps<GiftedCharts["BarChart"]>;
type PieChartProps = React.ComponentProps<GiftedCharts["PieChart"]>;
type LineChartProps = React.ComponentProps<GiftedCharts["LineChart"]>;

const LazyBarChart = React.lazy(() =>
  import("react-native-gifted-charts").then((m) => ({ default: m.BarChart })),
);
const LazyPieChart = React.lazy(() =>
  import("react-native-gifted-charts").then((m) => ({ default: m.PieChart })),
);
const LazyLineChart = React.lazy(() =>
  import("react-native-gifted-charts").then((m) => ({ default: m.LineChart })),
);

function ChartFallback() {
  return (
    <View
      style={{ minHeight: 120, alignItems: "center", justifyContent: "center" }}
    >
      <ActivityIndicator color={colors.muted} />
    </View>
  );
}

export function BarChart(props: BarChartProps) {
  return (
    <Suspense fallback={<ChartFallback />}>
      <LazyBarChart {...props} />
    </Suspense>
  );
}

export function PieChart(props: PieChartProps) {
  return (
    <Suspense fallback={<ChartFallback />}>
      <LazyPieChart {...props} />
    </Suspense>
  );
}

export function LineChart(props: LineChartProps) {
  return (
    <Suspense fallback={<ChartFallback />}>
      <LazyLineChart {...props} />
    </Suspense>
  );
}
