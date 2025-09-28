import {
    Circle,
    Group,
    LinearGradient,
    Rect,
    Line as SkiaLine,
    Text as SkiaText,
    useFont,
    vec
} from "@shopify/react-native-skia";
import React from "react";
import { Text, View } from "react-native";
import { SharedValue, useDerivedValue } from "react-native-reanimated";
import { CartesianChart, ChartBounds, useChartPressState } from "victory-native";
import Inter from "../../assets/fonts/Inter-Medium.ttf";

interface VictoryBarChartProps {
    data: any[];
    title?: string;
    height?: number;
    onDataPointPress?: (dataPoint: any, position: { x: number; y: number }) => void;
    // Customizable label and value properties
    labelKey?: string; // e.g., 'month', 'category', 'name', 'date'
    valueKey?: string; // e.g., 'listenCount', 'value', 'revenue', 'quantity'
    valueType?: string; // e.g., 'listens', 'revenue', 'items', 'orders'
    unit?: string; // e.g., 'listens', '$', 'items', 'orders'
    // Display customization
    showValueLabels?: boolean; // Show values on top of bars
    showTooltips?: boolean; // Show interactive tooltips
    barColor?: string; // Custom bar color
    selectedBarColor?: string; // Color when bar is selected
}

export default function VictoryBarChart({
    data,
    title,
    height = 300,
    onDataPointPress,
    labelKey = 'month', // Default to 'month' for backward compatibility
    valueKey = 'listenCount', // Default to 'listenCount' for backward compatibility
    valueType = 'listens', // Default value type
    unit = 'listens', // Default unit
    showValueLabels = true,
    showTooltips = true,
    barColor = '#60a5fa',
    selectedBarColor = '#3b82f6'
}: VictoryBarChartProps) {
    const font = useFont(Inter as any, 14);
    const { state, isActive } = useChartPressState({ x: 0, y: { y: 0 } });

    if (!data || data.length === 0) {
        return (
            <View className="h-[300px] w-full bg-[#303030] rounded-2xl border border-gray-600 items-center justify-center">
                <Text className="text-gray-400 text-lg">No data available</Text>
            </View>
        );
    }

    // Format data for Victory Native - now uses customizable keys
    const formattedData = data?.map((item: any, index: number) => {
        if (!item) {
            return {
                x: `Item ${index + 1}`,
                y: 0,
                label: `Item ${index + 1}`,
                value: 0,
                valueType: valueType,
                unit: unit,
                description: ''
            };
        }

        // Extract the value using the specified valueKey, with fallbacks
        const value = item[valueKey] || item.value || item.revenue || item.quantity || item.orders || item.y || 0;

        // Extract the label using the specified labelKey, with fallbacks
        const label = item[labelKey] || item.name || item.date || item.hour || item.employee || item.method || item.category || item.x || `Item ${index + 1}`;

        console.log(`📊 VictoryBarChart: Processing item ${index}:`, {
            originalItem: item,
            labelKey,
            valueKey,
            extractedLabel: label,
            extractedValue: value,
            finalX: label,
            finalY: value
        });

        return {
            x: label,
            y: value,
            label: label,
            value: value,
            valueType: item.valueType || valueType,
            unit: item.unit || unit,
            description: item.description || ''
        };
    }) || [];

    if (!formattedData || formattedData.length === 0) {
        return (
            <View className="h-[300px] w-full bg-[#303030] rounded-2xl border border-gray-600 items-center justify-center">
                <Text className="text-gray-400 text-lg">No data available</Text>
            </View>
        );
    }

    console.log('📊 VictoryBarChart: Formatted data:', formattedData);

    return (
        <View className="h-[300px] w-full">
            <CartesianChart
                data={formattedData}
                xKey="x"
                yKeys={["y"]}
                domainPadding={{ left: 50, right: 50, top: 30, bottom: 20 }}
                axisOptions={{
                    font: font,
                    labelColor: "white",
                    lineColor: "#374151",
                    lineWidth: 1,
                    formatXLabel: (value: any) => {
                        // Truncate long labels
                        const label = String(value);
                        return label.length > 10 ? label.substring(0, 10) + '...' : label;
                    },
                    formatYLabel: (value: any) => {
                        // Format Y-axis labels with appropriate units
                        if (unit === '$') {
                            return `$${Number(value).toFixed(0)}`;
                        } else if (unit === 'items') {
                            return `${Number(value).toFixed(0)}`;
                        } else if (unit === 'listens') {
                            return `${Number(value).toFixed(0)}`;
                        }
                        return Number(value).toFixed(0);
                    }
                }}
                chartPressState={state}
                renderOutside={({ chartBounds }) => (
                    <>
                        {isActive && showTooltips && (
                            <ActiveValueIndicator
                                xPosition={state.x.position}
                                yPosition={state.y.y.position}
                                activeValue={state.y.y.value}
                                activeValueLabel={state.x.value}
                                bottom={chartBounds.bottom}
                                top={chartBounds.top}
                                textColor="white"
                                lineColor="#60a5fa"
                                topOffset={5}
                                valueType={valueType}
                                unit={unit}
                                labelKey={labelKey}
                            />
                        )}
                    </>
                )}
            >
                {({ points, chartBounds }) => (
                    <EnhancedBar
                        chartBounds={chartBounds}
                        points={points.y}
                        isActive={isActive}
                        pressState={state}
                        data={formattedData}
                        barColor={barColor}
                        selectedBarColor={selectedBarColor}
                        showValueLabels={showValueLabels}
                        unit={unit}
                    />
                )}
            </CartesianChart>

        </View>
    );
}

const ActiveValueIndicator = ({
    xPosition,
    yPosition,
    top,
    bottom,
    activeValue,
    activeValueLabel,
    textColor,
    lineColor,
    topOffset = 0,
    valueType,
    unit,
    labelKey
}: {
    xPosition: SharedValue<number>;
    yPosition: SharedValue<number>;
    activeValue: SharedValue<number>;
    activeValueLabel: SharedValue<number>;
    bottom: number;
    top: number;
    textColor: string;
    lineColor: string;
    topOffset?: number;
    valueType?: string;
    unit?: string;
    labelKey?: string;
}) => {
    const FONT_SIZE = 14;
    const font = useFont(Inter as any, FONT_SIZE);

    const start = useDerivedValue(() => vec(xPosition.value, bottom));
    const end = useDerivedValue(() =>
        vec(xPosition.value, top + 1.5 * FONT_SIZE + topOffset),
    );

    // Format the value display based on type and unit
    const activeValueDisplay = useDerivedValue(() => {
        const value = activeValue.value;
        const label = activeValueLabel?.value || 0;

        let formattedValue: string;
        if (unit === '$') {
            formattedValue = `$${value.toLocaleString()}`;
        } else if (unit === 'items') {
            formattedValue = `${value.toLocaleString()} items`;
        } else if (unit === 'listens') {
            formattedValue = `${value.toLocaleString()} listens`;
        } else {
            formattedValue = value.toLocaleString();
        }

        const labelPrefix = labelKey === 'month' ? 'Month' :
            labelKey === 'category' ? 'Category' :
                labelKey === 'name' ? 'Name' :
                    labelKey === 'date' ? 'Date' :
                        labelKey === 'hour' ? 'Hour' :
                            labelKey === 'employee' ? 'Employee' :
                                labelKey === 'method' ? 'Method' :
                                    '';

        return `${labelPrefix} ${label}: ${formattedValue}`;
    });

    const activeValueWidth = useDerivedValue(
        () => {
            if (!font || !activeValueDisplay.value) return 0;
            try {
                return font
                    ?.getGlyphWidths?.(font.getGlyphIDs(activeValueDisplay.value))
                    .reduce((sum, value) => sum + value, 0) || 0;
            } catch (error) {
                console.warn('Error calculating text width:', error);
                return 0;
            }
        }
    );

    const activeValueX = useDerivedValue(
        () => xPosition.value - activeValueWidth.value / 2,
    );

    return (
        <>
            <SkiaLine p1={start} p2={end} color={lineColor} strokeWidth={1} />
            <Circle cx={xPosition} cy={yPosition} r={8} color="#60a5fa" />
            <Circle
                cx={xPosition}
                cy={yPosition}
                r={6}
                color="hsla(0, 0, 100%, 0.25)"
            />
            <SkiaText
                color={textColor}
                font={font}
                text={activeValueDisplay}
                x={activeValueX}
                y={top + FONT_SIZE + topOffset}
            />
        </>
    );
};

const EnhancedBar = ({
    chartBounds,
    points,
    isActive,
    pressState,
    data,
    barColor,
    selectedBarColor,
    showValueLabels,
    unit
}: {
    chartBounds: ChartBounds;
    points: any;
    isActive: boolean;
    pressState: any;
    data: any[];
    barColor: string;
    selectedBarColor: string;
    showValueLabels: boolean;
    unit: string;
}) => {
    const font = useFont(Inter as any, 12);

    return (
        <Group>
            {points.map((point: any, index: number) => {
                if (!point || !data[index]) return null;

                const isSelected = isActive && pressState.x.value === data[index]?.x;
                const barHeight = chartBounds.bottom - point.y;
                const barWidth = Math.max(20, (chartBounds.right - chartBounds.left) / data.length * 0.6);
                const barX = point.x - barWidth / 2;

                return (
                    <Group key={index}>
                        {/* Bar shadow */}
                        <Rect
                            x={barX + 2}
                            y={point.y + 2}
                            width={barWidth}
                            height={barHeight}
                            color="rgba(0, 0, 0, 0.1)"
                        />

                        {/* Main bar */}
                        <Rect
                            x={barX}
                            y={point.y}
                            width={barWidth}
                            height={barHeight}
                            color={isSelected ? selectedBarColor : barColor}
                        >
                            <LinearGradient
                                start={vec(0, point.y)}
                                end={vec(0, chartBounds.bottom)}
                                colors={
                                    isSelected
                                        ? [selectedBarColor, selectedBarColor + "80"]
                                        : [barColor, barColor + "80"]
                                }
                            />
                        </Rect>

                        {/* Rounded top corners */}
                        <Rect
                            x={barX}
                            y={point.y}
                            width={barWidth}
                            height={8}
                            color={isSelected ? selectedBarColor : barColor}
                        />
                        
                    </Group>
                );
            })}
        </Group>
    );
};
