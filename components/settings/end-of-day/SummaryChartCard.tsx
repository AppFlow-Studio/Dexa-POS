import React from "react";
import { Text, View } from "react-native";
// import { Pie, PolarChart } from "victory-native";

// interface ChartData {
//   x: string;
//   y: number;
// }

// interface SummaryChartCardProps {
//   title: string;
//   data: ChartData[];
//   colorScale: string[];
//   totalLabel: string; // This prop is no longer visually used but kept for API consistency
//   totalValue: string; // This prop is no longer visually used but kept for API consistency
// }

const SummaryChartCard: React.FC<SummaryChartCardProps> = ({
  title,
  data,
  colorScale,
}) => {
  // const transformedData = React.useMemo(() => {
  //   return data.map((item, index) => ({
  //     label: item.x,
  //     value: item.y,
  //     color: colorScale[index % colorScale.length],
  //   }));
  // }, [data, colorScale]);

  return (
    <View className="bg-white p-6 rounded-2xl border border-gray-200">
      <Text className="text-xl font-bold text-gray-800">{title}</Text>
      <View className="flex-row items-center mt-4">
        {/* Chart Container - adjusted for new compact size */}
        <View className="w-24 h-24">

          <View className="w-48 h-48 absolute -left-12 -top-12">
            {/* <PolarChart
              data={transformedData}
              valueKey="value"
              labelKey="label"
              colorKey="color"
            >

              <Pie.Chart
                innerRadius="75%"
                startAngle={-150} // Start from the bottom-left
                circleSweepDegrees={120} // Create a smaller 120-degree arc
              >
                {() => (
                  <>
                    <Pie.Slice />
                    <Pie.SliceAngularInset
                      angularInset={{
                        angularStrokeWidth: 4,
                        angularStrokeColor: "white",
                      }}
                    />
                  </>
                )}
              </Pie.Chart>
            </PolarChart> */}


          </View>
        </View>


        {/* Legend */}
        {/* <View className="flex-1 ml-6 space-y-2">
          {data.map((item, index) => (
            <View key={index} className="flex-row items-center">
              <View
                className="w-3 h-3 rounded-full mr-2"
                style={{
                  backgroundColor: colorScale[index % colorScale.length],
                }}
              />
              <Text className="text-gray-600">{item.x}</Text>
              <Text className="ml-auto font-semibold text-gray-800">
                ${item.y.toFixed(2)}
              </Text>
            </View>
          ))}
        </View> */}
      </View>
    </View>
  );
 };

export default SummaryChartCard;
