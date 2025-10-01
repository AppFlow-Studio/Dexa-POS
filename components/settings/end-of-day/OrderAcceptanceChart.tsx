// // src/components/charts/OrderAcceptanceChart.tsx

// import { DashPathEffect, useFont } from "@shopify/react-native-skia";
// import React, { useEffect } from "react";
// import Animated, {
//   useAnimatedStyle,
//   useSharedValue,
//   withTiming,
// } from "react-native-reanimated";
// import { Area, CartesianChart, Line, useChartPressState } from "victory-native";

// import { View } from "react-native";
// import inter from "../../../assets/fonts/Inter-Medium.ttf";

// // --- Mock Data ---
// const orderAcceptanceData = [
//   { hour: 6, dineIn: 48, takeout: 20 },
//   { hour: 8, dineIn: 68, takeout: 18 },
//   { hour: 10, dineIn: 70, takeout: 22 },
//   { hour: 12, dineIn: 45, takeout: 25 },
//   { hour: 14, dineIn: 85, takeout: 30 },
//   { hour: 16, dineIn: 90, takeout: 15 },
//   { hour: 18, dineIn: 65, takeout: 35 },
//   { hour: 20, dineIn: 105, takeout: 40 },
// ];

// const COLORS = { dineIn: "#3b82f6", takeout: "#f97316" };

// // --- Main Component ---
// const OrderAcceptanceChart = () => {
//   const font = useFont(inter as any, 12);
//   const { state, isActive } = useChartPressState({
//     x: 0,
//     y: { dineIn: 0, takeout: 0 },
//   });

//   // Animation setup for slide-up effect
//   const translateY = useSharedValue(300);
//   const animatedStyle = useAnimatedStyle(() => ({
//     transform: [{ translateY: translateY.value }],
//   }));
//   useEffect(() => {
//     translateY.value = withTiming(0, { duration: 800 });
//   }, [translateY]);

//   return (
//     <View className="h-[300px] overflow-hidden">
//       <Animated.View style={[{ height: 300 }, animatedStyle]}>
//         <CartesianChart
//           data={orderAcceptanceData}
//           xKey="hour"
//           yKeys={["dineIn", "takeout"]}
//           domainPadding={{ top: 20, bottom: 20 }}
//           axisOptions={{
//             font,
//             labelColor: "#6b7280",
//             formatYLabel: (v) => v.toString(),
//           }}
//         >
//           {({ points, chartBounds }) => (
//             <>
//               <Area
//                 points={points.dineIn}
//                 y0={chartBounds.bottom}
//                 color={COLORS.dineIn}
//                 opacity={0.2}
//                 curveType="natural"
//               />
//               <Line
//                 points={points.dineIn}
//                 color={COLORS.dineIn}
//                 strokeWidth={3}
//                 curveType="natural"
//               />
//               <Line
//                 points={points.takeout}
//                 color={COLORS.takeout}
//                 strokeWidth={3}
//                 curveType="natural"
//               >
//                 <DashPathEffect intervals={[6, 6]} />
//               </Line>
//             </>
//           )}
//         </CartesianChart>
//       </Animated.View>
//     </View>
//   );
// };

// export default OrderAcceptanceChart;
