import { useAnalyticsStore } from "@/stores/useAnalyticsStore";
import {
    Circle,
    Group,
    LinearGradient,
    Path,
    Skia,
    Line as SkiaLine,
    Text as SkiaText,
    useFont,
    vec
} from "@shopify/react-native-skia";
import React from "react";
import {
    Text,
    View
} from "react-native";
import { SharedValue, useDerivedValue } from "react-native-reanimated";
import { CartesianChart, ChartBounds, PointsArray, useAreaPath, useChartPressState, useLinePath } from "victory-native";
import Inter from "../../assets/fonts/Inter-Medium.ttf";


export default function VictoryNativeSalesTrendChart() {
    const {
        currentReportData,
        isLoading,
        error,
        fetchReportData,
        clearError
    } = useAnalyticsStore();
    const font = useFont(Inter as any, 14);
    const { state, isActive } = useChartPressState({ x: 0, y: { revenue: 0 } });

    const formattedData = currentReportData?.chartData?.map((item: any) => ({
        date: item.date || item.name || 'N/A',
        revenue: item.value || item.revenue || item.quantity || 0
    })) || [];
    // Show loading or error state
    if (isLoading) {
        return (
            <View className="h-[300px] w-full bg-[#303030] rounded-2xl border border-gray-600 items-center justify-center">
                <Text className="text-gray-400 text-lg">Loading chart...</Text>
            </View>
        );
    }

    if (error) {
        return (
            <View className="h-[300px] w-full bg-[#303030] rounded-2xl border border-gray-600 items-center justify-center">
                <Text className="text-red-400 text-lg">Error loading chart</Text>
            </View>
        );
    }

    if (!formattedData || formattedData.length === 0) {
        return (
            <View className="h-[300px] w-full bg-[#303030] rounded-2xl border border-gray-600 items-center justify-center">
                <Text className="text-gray-400 text-lg">No data available</Text>
            </View>
        );
    }

    return (
        <View className="h-[300px] w-full bg-[#303030] rounded-2xl border border-gray-600 p-4">
            <CartesianChart
                data={formattedData}
                domainPadding={{ left: 20, right: 20, top: 20, bottom: 20 }}
                xKey="date"
                yKeys={["revenue"]}
                axisOptions={{
                    font: font,
                    labelColor: "white",
                    lineColor: "#374151",
                    lineWidth: 1,
                }}
                chartPressState={state}
                renderOutside={({ chartBounds }) => (
                    <>
                        {isActive &&
                            <ActiveValueIndicator
                                xPosition={state.x.position}
                                yPosition={state.y.revenue.position}
                                activeValue={state.y.revenue.value}
                                activeValueDate={state.x.value}
                                bottom={chartBounds.bottom}
                                top={chartBounds.top}
                                textColor="white"
                                lineColor="#60a5fa"
                                topOffset={5}
                            />}
                    </>

                )}

            >
                {({ points, chartBounds }) => (
                    <>
                        <StockArea
                            colorPrefix="dark"
                            points={points.revenue}
                            isWindowActive={isActive}
                            // isDeltaPositive={isDeltaPositive}
                            startX={state.x.position}
                            endX={state.x.position}
                            {...chartBounds}
                        />
                    </>
                )}
            </CartesianChart>
        </View >
    );
}


const StockArea = ({
    colorPrefix,
    points,
    isWindowActive,
    isDeltaPositive,
    startX,
    endX,
    left,
    right,
    top,
    bottom,
}: {
    colorPrefix: "dark" | "light";
    points: PointsArray;
    isWindowActive: boolean;
    isDeltaPositive?: SharedValue<boolean>;
    startX: SharedValue<number>;
    endX: SharedValue<number>;
} & ChartBounds) => {
    const { path: areaPath } = useAreaPath(points, bottom);
    const { path: linePath } = useLinePath(points);

    const backgroundClip = useDerivedValue(() => {
        const path = Skia.Path.Make();

        if (isWindowActive) {
            path.addRect(Skia.XYWHRect(left, top, startX.value - left, bottom - top));
            path.addRect(
                Skia.XYWHRect(endX.value, top, right - endX.value, bottom - top),
            );
        } else {
            path.addRect(Skia.XYWHRect(left, top, right - left, bottom - top));
        }

        return path;
    });

    const windowClip = useDerivedValue(() => {
        if (!isWindowActive) return Skia.Path.Make();

        const path = Skia.Path.Make();
        path.addRect(
            Skia.XYWHRect(startX.value, top, endX.value - startX.value, bottom - top),
        );
        return path;
    });


    return (
        <>
            {/* Base */}
            <Group clip={backgroundClip} opacity={isWindowActive ? 0.3 : 1}>
                <Path path={areaPath} style="fill">
                    <LinearGradient
                        start={vec(0, 0)}
                        end={vec(top, bottom)}
                        colors={
                            ["#60a5fa", "#60a5fa33"]
                        }
                    />
                </Path>
                <Path
                    path={linePath}
                    style="stroke"
                    strokeWidth={2}
                    color={
                        "#60a5fa"
                    }
                />
            </Group>
            {/* Clipped window */}
            {isWindowActive && (
                <Group clip={windowClip}>
                    <Path path={areaPath} style="fill">
                        <LinearGradient
                            start={vec(0, 0)}
                            end={vec(top, bottom)}
                            colors={
                                !isWindowActive
                                    ? ["#60a5fa", "#60a5fa33"]
                                    : isDeltaPositive?.value
                                        ? [
                                            "#60a5fa",
                                            "#60a5fa33",
                                        ]
                                        : [
                                            "#60a5fa",
                                            "#60a5fa33",
                                        ]
                            }
                        />
                    </Path>
                    <Path
                        path={linePath}
                        style="stroke"
                        strokeWidth={2}
                        color={"#60a5fa"}
                    />
                </Group>
            )}
        </>
    );
};

const ActiveValueIndicator = ({
    xPosition,
    yPosition,
    top,
    bottom,
    activeValue,
    activeValueDate,
    textColor,
    lineColor,
    indicatorColor,
    topOffset = 0,
}: {
    xPosition: SharedValue<number>;
    yPosition: SharedValue<number>;
    activeValue: SharedValue<number>;
    activeValueDate?: SharedValue<string>;
    bottom: number;
    top: number;
    textColor: string;
    lineColor: string;
    indicatorColor?: SharedValue<string>;
    topOffset?: number;
}) => {
    const FONT_SIZE = 16;
    const font = useFont(Inter as any, FONT_SIZE);
    const start = useDerivedValue(() => vec(xPosition.value, bottom));
    const end = useDerivedValue(() =>
        vec(xPosition.value, top + 1.5 * FONT_SIZE + topOffset),
    );
    // Text label
    const activeValueDisplay = useDerivedValue(
        () => "$" + activeValue.value.toFixed(2) + ' - ' + activeValueDate?.value,
    );

    // const activeValueDateDisplay = useDerivedValue(
    //     () => activeValueDate?.value || "N/A",
    // );
    const activeValueWidth = useDerivedValue(
        () =>
            font
                ?.getGlyphWidths?.(font.getGlyphIDs(activeValueDisplay.value))
                .reduce((sum, value) => sum + value, 0) || 0,
    );
    const activeValueX = useDerivedValue(
        () => xPosition.value - activeValueWidth.value / 2,
    );

    return (
        <>
            <SkiaLine p1={start} p2={end} color={lineColor} strokeWidth={1} />
            <Circle cx={xPosition} cy={yPosition} r={10} color={indicatorColor || "#60a5fa"} />
            <Circle
                cx={xPosition}
                cy={yPosition}
                r={8}
                color="hsla(0, 0, 100%, 0.25)"
            />
            <SkiaText
                color={textColor}
                font={font}
                text={activeValueDisplay}
                x={activeValueX}
                y={top + FONT_SIZE + topOffset}
            />
            {/* <SkiaText
                color={textColor}
                font={font}
                text={activeValueDate?.value || "N/A"}
                x={activeValueX}
                y={top + FONT_SIZE + topOffset + 20}
            /> */}
        </>
    );
};