import { useFont } from "@shopify/react-native-skia";
import React from "react";
import { Text, View } from "react-native";
import { Pie, PolarChart, useChartTransformState } from "victory-native";
import Inter from "../../assets/fonts/Inter-Medium.ttf";
import { PieChartCustomLabel } from "./pie-chart-custom-label";
function generateRandomColor(): string {
    // Generating a random number between 0 and 0xFFFFFF
    const randomColor = Math.floor(Math.random() * 0xffffff);
    // Converting the number to a hexadecimal string and padding with zeros
    return `#${randomColor.toString(16).padStart(6, "0")}`;
}
export default function VictoryPieChart({ data }: { data: any[] }) {


    if (!data || data.length === 0) {
        return (
            <View className="h-[300px] w-full bg-[#303030] rounded-2xl border border-gray-600 items-center justify-center">
                <Text className="text-gray-400 text-lg">No data available</Text>
            </View>
        );
    }
    const { state } = useChartTransformState();

    const transformedData = data.map((item, index) => ({
        value: item.value,
        color: generateRandomColor(),
        label: item.label,
    }));

    const font = useFont(Inter as any, 14);
    return (
        <View
            style={{
                height: 300,
                width: "100%",
            }}
        >
            <PolarChart
                data={transformedData}
                colorKey={"color"}
                valueKey={"value"}
                labelKey={"label"}
            >
                <Pie.Chart innerRadius="50%">
                    {({ slice }) => {
                        return (
                            <>
                                <Pie.Slice animate={{ type: "spring" }}>
                                    <Pie.Label radiusOffset={0.6}>
                                        {(position) => (
                                            <PieChartCustomLabel
                                                position={position}
                                                slice={slice}
                                                font={font}
                                            />
                                        )}
                                    </Pie.Label>
                                </Pie.Slice>

                                <Pie.SliceAngularInset
                                    angularInset={{
                                        angularStrokeWidth: 4,
                                        angularStrokeColor: '#fafafa',
                                    }}
                                />
                            </>
                        );
                    }}
                </Pie.Chart>
            </PolarChart>
        </View >
    );
}