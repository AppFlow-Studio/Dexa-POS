// components/analytics/ReportChart.tsx

import React, { useRef, useState } from 'react';
import { Dimensions, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { BarChart, PieChart } from 'react-native-chart-kit';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import VictoryLineChart from './VictoryLineChart';
import VictoryPieChart from './VictoryPieChart';

interface ChartData {
    labels: string[];
    datasets: {
        data: number[];
        color?: (opacity: number) => string;
        strokeWidth?: number;
    }[];
}

interface ReportChartProps {
    data: any[];
    chartType: 'bar' | 'line' | 'pie';
    title?: string;
    height?: number;
    onDataPointPress?: (dataPoint: any, position: { x: number; y: number }) => void;
}

const screenWidth = Dimensions.get('window').width;

const chartConfig = {
    backgroundColor: '#212121',
    backgroundGradientFrom: '#212121',
    backgroundGradientTo: '#212121',
    decimalPlaces: 2,
    color: (opacity = 1) => `rgba(59, 130, 246, ${opacity})`, // Blue
    labelColor: (opacity = 1) => `rgba(255, 255, 255, ${opacity})`,
    style: {
        borderRadius: 16,
    },
    propsForDots: {
        r: '6',
        strokeWidth: '2',
        stroke: '#3b82f6',
    },
    propsForBackgroundLines: {
        strokeDasharray: '',
        stroke: '#374151',
        strokeWidth: 1,
    },
};

// Helper function to convert ChartData interface to Victory Native format
const conformDataToVictoryFormat = (data: any[]): Array<{ x: string | number; y: number }> => {
    if (!data || !Array.isArray(data)) {
        return [];
    }

    return data.map((item: any, index: number) => {
        // Extract x value (label/date/name)
        let xValue: string | number;
        if (item.date) {
            xValue = item.date.replace('/2025', '') || `Point ${index + 1}`;
        } else if (item.name) {
            xValue = item.name;
        } else if (item.hour !== undefined) {
            xValue = item.hour;
        } else if (item.employee) {
            xValue = item.employee;
        } else if (item.method) {
            xValue = item.method;
        } else {
            xValue = index; // Fallback to index
        }

        // Extract y value (value/revenue/quantity/orders)
        let yValue: number;
        if (typeof item.value === 'number') {
            yValue = item.value;
        } else if (typeof item.revenue === 'number') {
            yValue = item.revenue;
        } else if (typeof item.quantity === 'number') {
            yValue = item.quantity;
        } else if (typeof item.orders === 'number') {
            yValue = item.orders;
        } else {
            yValue = 0; // Fallback to 0
        }

        return {
            x: xValue,
            y: yValue,
            // Preserve original data for tooltip access
            originalData: item
        };
    });
};

export default function ReportChart({ data, chartType, title, height = 250, onDataPointPress }: ReportChartProps) {
    const [tooltipVisible, setTooltipVisible] = useState(false);
    const [tooltipData, setTooltipData] = useState<any>(null);
    const [tooltipPosition, setTooltipPosition] = useState({ x: 0, y: 0 });
    const chartRef = useRef<View>(null);

    const handleChartPress = (event: any, dataPoint?: any, index?: number) => {
        if (!data || data.length === 0) return;

        const { locationX, locationY } = event.nativeEvent;

        // Calculate relative position within the chart
        const relativeX = locationX;
        const relativeY = locationY;

        let tooltipDataToShow;

        if (chartType === 'pie') {
            // For pie charts, show all segments with their data
            tooltipDataToShow = data.map((item, idx) => ({
                label: item.name || item.method || item.employee || `Segment ${idx + 1}`,
                value: item.value || item.revenue || item.orders || 0,
                color: `hsl(${(idx * 137.5) % 360}, 70%, 50%)`,
                additionalInfo: {
                    percentage: ((item.value || item.revenue || item.orders || 0) /
                        data.reduce((sum, d) => sum + (d.value || d.revenue || d.orders || 0), 0) * 100).toFixed(1) + '%'
                }
            }));
        } else {
            // For bar and line charts, show specific data point
            const item = dataPoint || data[index || 0];
            if (item) {
                tooltipDataToShow = {
                    label: item.name || item?.date?.replace('/2025', '') || item.hour || item.employee || item.method || `Data Point ${(index || 0) + 1}`,
                    value: item.value || item.quantity || item.revenue || item.orders || 0,
                    color: '#3b82f6',
                    additionalInfo: {
                        date: item.date || 'N/A',
                        category: item.category || 'N/A',
                        trend: item.trend || 'N/A'
                    }
                };
            }
        }

        if (tooltipDataToShow) {
            setTooltipData(tooltipDataToShow);
            setTooltipPosition({ x: relativeX, y: relativeY });
            setTooltipVisible(true);

            // Call the optional callback
            if (onDataPointPress) {
                onDataPointPress(tooltipDataToShow, { x: relativeX, y: relativeY });
            }
        }
    };

    // Enhanced handler that uses getCompleteDataPointInfo
    const handleDataPointClick = (event: any) => {
        const completeInfo = getCompleteDataPointInfo(event, chartType);
        console.log("Complete Data Point Info:", completeInfo);

        // Use the complete info to show tooltip
        const { formatted, eventData } = completeInfo;

        let tooltipDataToShow;

        if (chartType === 'pie') {
            // For pie charts, show all segments with their data
            tooltipDataToShow = data.map((item, idx) => ({
                label: item.name || item.method || item.employee || `Segment ${idx + 1}`,
                value: item.value || item.revenue || item.orders || 0,
                color: `hsl(${(idx * 137.5) % 360}, 70%, 50%)`,
                additionalInfo: {
                    percentage: ((item.value || item.revenue || item.orders || 0) /
                        data.reduce((sum, d) => sum + (d.value || d.revenue || d.orders || 0), 0) * 100).toFixed(1) + '%'
                }
            }));
        } else {
            // For bar and line charts, use the complete info
            tooltipDataToShow = {
                label: formatted.label,
                value: formatted.value,
                color: '#3b82f6',
                additionalInfo: {
                    date: formatted.date,
                    category: formatted.category,
                    trend: formatted.trend,
                    revenue: formatted.revenue,
                    orders: formatted.orders,
                    quantity: formatted.quantity
                }
            };
        }

        if (tooltipDataToShow) {
            setTooltipData(tooltipDataToShow);
            setTooltipPosition({ x: eventData.position.x, y: eventData.position.y });
            setTooltipVisible(true);

            // Call the optional callback with complete info
            if (onDataPointPress) {
                onDataPointPress(completeInfo, eventData.position);
            }
        }
    };

    const closeTooltip = () => {
        setTooltipVisible(false);
        setTooltipData(null);
    };

    // Helper function to get complete data point information
    const getCompleteDataPointInfo = (event: any, chartType: 'bar' | 'line' | 'pie') => {
        const { index, value, x, y } = event;

        // Get the original data point from our data array
        const originalDataPoint = data[index];

        // Create comprehensive data point info
        const completeInfo = {
            // Event data
            eventData: {
                index,
                value,
                position: { x, y },
                chartType
            },

            // Original data point
            originalData: originalDataPoint,

            // Formatted information
            formatted: {
                label: originalDataPoint?.name ||
                    originalDataPoint?.date?.replace('/2025', '') ||
                    originalDataPoint?.hour ||
                    originalDataPoint?.employee ||
                    originalDataPoint?.method ||
                    `Data Point ${index + 1}`,

                value: value,

                date: originalDataPoint?.date || 'N/A',

                category: originalDataPoint?.category || 'N/A',

                trend: originalDataPoint?.trend || 'N/A',

                // Additional fields that might be present
                revenue: originalDataPoint?.revenue || value,
                orders: originalDataPoint?.orders || 'N/A',
                quantity: originalDataPoint?.quantity || 'N/A',

                // Chart-specific info
                chartInfo: {
                    type: chartType,
                    position: { x, y },
                    index: index
                }
            },

            // Summary for tooltip
            tooltipSummary: {
                primaryLabel: originalDataPoint?.name ||
                    originalDataPoint?.date?.replace('/2025', '') ||
                    originalDataPoint?.hour ||
                    originalDataPoint?.employee ||
                    originalDataPoint?.method ||
                    `Data Point ${index + 1}`,
                primaryValue: value,
                secondaryInfo: {
                    date: originalDataPoint?.date || 'N/A',
                    category: originalDataPoint?.category || 'N/A',
                    trend: originalDataPoint?.trend || 'N/A'
                }
            }
        };

        return completeInfo;
    };

    if (!data || data.length === 0) {
        return (
            <View className="h-56 bg-[#303030] rounded-2xl border border-gray-600 items-center justify-center">
                <Text className="text-gray-400 text-lg">No data available</Text>
            </View>
        );
    }

    const formattedData = 
    data?.map((item: any) => ({
        x: item.date || item.name || item.hour || item.employee || item.method || item.category || 'N/A',
        y: item.value || item.revenue || item.quantity || 0,
        label: item.label || item.name || item.hour || item.employee || item.method || item.category || 'N/A',
        value: item.value || item.revenue || item.quantity || 0
    })) || [];
    
    const formatDataForChart = (): ChartData => {
        switch (chartType) {
            case 'bar':
                return {
                    labels: data.map(item => item.name || item?.date?.replace('/2025', '') || item.hour || item.employee || item.method || ''),
                    datasets: [{
                        data: data.map(item => item.value || item.quantity || item.revenue || item.orders || 0),
                        color: (opacity = 1) => `rgba(59, 130, 246, ${opacity})`,
                    }]
                };

            case 'line':
                return {
                    labels: data.map(item => item?.date?.replace('/2025', '') || item.name || ''),
                    datasets: [{
                        data: data.map(item => item.value || item.revenue || item.orders || 0),
                        color: (opacity = 1) => `rgba(59, 130, 246, ${opacity})`,
                        strokeWidth: 2,
                    }]
                };

            case 'pie':
                return {
                    labels: data.map(item => item.name || item.method || item.employee || ''),
                    datasets: [{
                        data: data.map(item => item.value || item.revenue || item.orders || 0),
                        color: (opacity = 1) => `rgba(59, 130, 246, ${opacity})`,
                    }]
                };

            default:
                return {
                    labels: [],
                    datasets: [{ data: [] }]
                };
        }
    };

    const chartData = formatDataForChart();

    const renderChart = () => {
        const chartWidth = screenWidth * 2; // Account for padding

        switch (chartType) {
            case 'bar':
                return (
                    <ScrollView horizontal={true} className={`w-full`} contentContainerClassName='w-fit'>
                        <TouchableOpacity
                            activeOpacity={1}
                            onPress={(event) => handleChartPress(event)}
                            ref={chartRef}
                        >
                            <BarChart
                                data={chartData}
                                width={chartWidth}
                                height={height}
                                onDataPointClick={handleDataPointClick}
                                chartConfig={chartConfig}
                                verticalLabelRotation={30}
                                showValuesOnTopOfBars={true}
                                fromZero={true}
                                yAxisLabel="$"
                                yAxisSuffix=""
                                style={{
                                    marginVertical: 8,
                                    borderRadius: 16,
                                }}
                            />
                        </TouchableOpacity>
                    </ScrollView>
                );

            case 'line':
                return (
                    <VictoryLineChart data={formattedData} />
                );

            case 'pie':
                return (
                   <VictoryPieChart data={formattedData} />
                );

            default:
                return (
                    <View className="h-56 items-center justify-center">
                        <Text className="text-gray-400">Unsupported chart type</Text>
                    </View>
                );
        }
    };

    return (
        <GestureHandlerRootView>
            <View className="bg-[#303030] rounded-2xl border border-gray-600 p-4">
                {title && (
                    <Text className="text-white text-lg font-semibold mb-4">{title}</Text>
                )}
                <View className="relative">
                    {renderChart()}
                </View>
            </View>
        </GestureHandlerRootView>
    );
}