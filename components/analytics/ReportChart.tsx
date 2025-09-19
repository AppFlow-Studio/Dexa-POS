import { ChartData } from "@/stores/useAnalyticsStore";
import React from "react";
import { Dimensions, Text, View } from "react-native";

interface ReportChartProps {
    data: ChartData[];
    chartType: 'bar' | 'line';
}

const { width: screenWidth } = Dimensions.get('window');
const CHART_WIDTH = screenWidth - 100; // Account for padding
const CHART_HEIGHT = 200;
const BAR_WIDTH = 30;
const BAR_SPACING = 10;

const ReportChart: React.FC<ReportChartProps> = ({ data, chartType }) => {
    if (!data || data.length === 0) {
        return (
            <View className="h-[200px] items-center justify-center">
                <Text className="text-gray-400 text-lg">No data available</Text>
            </View>
        );
    }

    const maxValue = Math.max(...data.map(item => item.value));
    const minValue = Math.min(...data.map(item => item.value));
    const valueRange = maxValue - minValue;

    const renderBarChart = () => {
        const availableWidth = CHART_WIDTH - (data.length - 1) * BAR_SPACING;
        const barWidth = Math.min(BAR_WIDTH, availableWidth / data.length);

        return (
            <View className="h-[200px] justify-end">
                <View className="flex-row items-end justify-between h-full px-4">
                    {data.map((item, index) => {
                        const height = valueRange > 0 ? (item.value / maxValue) * (CHART_HEIGHT - 40) : 20;
                        const color = item.color || '#3b82f6';

                        return (
                            <View key={index} className="items-center">
                                <View
                                    className="rounded-t-lg"
                                    style={{
                                        width: barWidth,
                                        height: height,
                                        backgroundColor: color,
                                        marginBottom: 4,
                                    }}
                                />
                                <Text className="text-xs text-gray-400 mt-2 text-center" numberOfLines={2}>
                                    {item.label}
                                </Text>
                                <Text className="text-xs text-gray-500 mt-1">
                                    {typeof item.value === 'number' ? item.value.toLocaleString() : item.value}
                                </Text>
                            </View>
                        );
                    })}
                </View>
            </View>
        );
    };

    const renderLineChart = () => {
        const availableWidth = CHART_WIDTH - 40;
        const pointSpacing = availableWidth / (data.length - 1);

        // Calculate points for the line
        const points = data.map((item, index) => {
            const x = 20 + (index * pointSpacing);
            const y = CHART_HEIGHT - 40 - ((item.value / maxValue) * (CHART_HEIGHT - 40));
            return { x, y, value: item.value, label: item.label };
        });

        // Create SVG path for the line
        const pathData = points.reduce((path, point, index) => {
            if (index === 0) {
                return `M ${point.x} ${point.y}`;
            }
            return `${path} L ${point.x} ${point.y}`;
        }, '');

        return (
            <View className="h-[200px] relative">
                {/* Y-axis labels */}
                <View className="absolute left-0 top-0 h-full justify-between">
                    {[maxValue, maxValue * 0.75, maxValue * 0.5, maxValue * 0.25, 0].map((value, index) => (
                        <Text key={index} className="text-xs text-gray-500 -ml-8">
                            {value.toLocaleString()}
                        </Text>
                    ))}
                </View>

                {/* Chart area */}
                <View className="ml-8 h-full">
                    {/* Grid lines */}
                    {[0, 0.25, 0.5, 0.75, 1].map((ratio, index) => (
                        <View
                            key={index}
                            className="absolute w-full border-t border-gray-700"
                            style={{ top: ratio * (CHART_HEIGHT - 40) }}
                        />
                    ))}

                    {/* Data points and line */}
                    <View className="relative h-full">
                        {points.map((point, index) => (
                            <View key={index}>
                                {/* Line segment */}
                                {index > 0 && (
                                    <View
                                        className="absolute bg-blue-500"
                                        style={{
                                            left: points[index - 1].x - 20,
                                            top: points[index - 1].y,
                                            width: Math.sqrt(
                                                Math.pow(point.x - points[index - 1].x, 2) +
                                                Math.pow(point.y - points[index - 1].y, 2)
                                            ),
                                            height: 2,
                                            transform: [{
                                                rotate: `${Math.atan2(
                                                    point.y - points[index - 1].y,
                                                    point.x - points[index - 1].x
                                                )}rad`
                                            }],
                                        }}
                                    />
                                )}

                                {/* Data point */}
                                <View
                                    className="absolute w-3 h-3 bg-blue-500 rounded-full border-2 border-white"
                                    style={{
                                        left: point.x - 20 - 6,
                                        top: point.y - 6,
                                    }}
                                />
                            </View>
                        ))}
                    </View>
                </View>

                {/* X-axis labels */}
                <View className="absolute bottom-0 left-8 right-0 flex-row justify-between">
                    {data.map((item, index) => (
                        <Text key={index} className="text-xs text-gray-400 text-center" numberOfLines={2}>
                            {item.label}
                        </Text>
                    ))}
                </View>
            </View>
        );
    };

    return (
        <View className="bg-[#212121] rounded-xl p-4">
            <View className="mb-4">
                <Text className="text-lg font-semibold text-white">
                    {chartType === 'bar' ? 'Bar Chart' : 'Line Chart'}
                </Text>
                <Text className="text-sm text-gray-400">
                    {data.length} data points • Range: {minValue.toLocaleString()} - {maxValue.toLocaleString()}
                </Text>
            </View>

            <View className="bg-[#303030] rounded-lg p-4">
                {chartType === 'bar' ? renderBarChart() : renderLineChart()}
            </View>

            {/* Legend */}
            <View className="mt-4">
                <View className="flex-row flex-wrap gap-4">
                    {data.slice(0, 5).map((item, index) => (
                        <View key={index} className="flex-row items-center">
                            <View
                                className="w-3 h-3 rounded-full mr-2"
                                style={{ backgroundColor: item.color || '#3b82f6' }}
                            />
                            <Text className="text-sm text-gray-300">{item.label}</Text>
                        </View>
                    ))}
                    {data.length > 5 && (
                        <Text className="text-sm text-gray-500">+{data.length - 5} more</Text>
                    )}
                </View>
            </View>
        </View>
    );
};

export default ReportChart;
