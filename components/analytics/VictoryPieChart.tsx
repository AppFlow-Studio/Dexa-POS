import { Canvas, Rect, useFont } from "@shopify/react-native-skia";
import React, { useMemo } from "react";
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

import { Skia } from '@shopify/react-native-skia';

export const createArcPath = (args: {
    startAngle: number;
    endAngle: number;
    radius: number;
    center: number;
    strokeWidth: number;
}) => {
    'worklet';
    const { startAngle, endAngle, radius, center, strokeWidth } = args;
    const path = Skia.Path.Make();

    path.addArc(
        {
            x: center - radius + strokeWidth / 2,
            y: center - radius + strokeWidth / 2,
            width: radius * 2 - strokeWidth,
            height: radius * 2 - strokeWidth,
        },
        startAngle,
        endAngle - startAngle,
    );
    return path;
};
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
    const totalValue = transformedData.reduce((acc, item) => acc + item.value, 0);
    const GAP = 8;
    const SIZE = 260; // Base SIZE
    const BASE_STROKE_WIDTH = 12;
    const MAX_STROKE_WIDTH = BASE_STROKE_WIDTH * 1.5; // Maximum stroke width during animation

    const PADDING = MAX_STROKE_WIDTH + 4; // Add a little extra space
    const ADJUSTED_SIZE = SIZE + PADDING * 2; // Increase canvas SIZE
    const CENTER = ADJUSTED_SIZE / 2; // New CENTER point

    // Adjust radius to maintain same visible SIZE
    const RADIUS = SIZE / 2;

    const pieChartSlices = useMemo(() => {
        let currentAngle = -90; // Start from top

        return transformedData.map((item, index) => {
            const proportion = item.value / totalValue;
            const fullSweepAngle = proportion * 360;

            const segmentStart = currentAngle; // Start angle of the slice
            currentAngle += fullSweepAngle; // Tracking of the current angle for the next slice

            return {
                startAngle: segmentStart,
                fullSweepAngle,
                item: item,
                index: index,
                radius: RADIUS,
                center: CENTER,
                gap: GAP,
                strokeWidth: BASE_STROKE_WIDTH,
            };
        });
    }, [transformedData]);

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

            <View style={{ flexDirection: "row", alignSelf: "center", marginTop: 5 }}>
                {transformedData.map((d, index) => {
                    return (
                        <View
                            key={index}
                            style={{
                                marginRight: 8,
                                flexDirection: "row",
                                alignItems: "center",
                            }}
                        >
                            <Canvas style={{ height: 12, width: 12, marginRight: 4 }}>
                                <Rect
                                    rect={{ x: 0, y: 0, width: 12, height: 12 }}
                                    color={d.color}
                                />
                            </Canvas>
                            <Text className="text-white">{d.label}</Text>
                        </View>
                    );
                })}
            </View>
        </View >
    );
}