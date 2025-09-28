import { Canvas, Path, Skia, useFont } from '@shopify/react-native-skia';
import React, { useMemo, useState } from 'react';
import { Dimensions, Text, TouchableOpacity, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import {
    runOnJS
} from 'react-native-reanimated';

import Inter from '@/assets/fonts/Inter-Medium.ttf';
const { width: screenWidth } = Dimensions.get('window');

interface PieChartData {
    value: number;
    color: string;
    label: string;
    percentage?: number;
    valueType?: string; // 'revenue', 'items', 'orders', etc.
    unit?: string; // '$', 'items', 'orders', etc.
    description?: string; // Additional context
}

interface InteractivePieChartProps {
    data: PieChartData[];
    size?: number;
    strokeWidth?: number;
    onSlicePress?: (index: number, data: PieChartData) => void;
    showLabels?: boolean;
    showPercentages?: boolean;
}

const InteractivePieChart: React.FC<InteractivePieChartProps> = ({
    data,
    size = 300,
    strokeWidth = 20,
    onSlicePress,
    showLabels = true,
    showPercentages = true,
}) => {
    const [selectedSlice, setSelectedSlice] = useState<number | null>(null);
    const [tooltipVisible, setTooltipVisible] = useState(false);
    const [tooltipData, setTooltipData] = useState<{ x: number; y: number; data: PieChartData } | null>(null);

    const font = useFont(Inter as any, 14);
    const center = size / 2;
    const radius = (size - strokeWidth) / 2;
    const totalValue = data.reduce((sum, item) => sum + item.value, 0);

    // Calculate angles for each slice
    const slices = useMemo(() => {
        let currentAngle = -90; // Start from top
        const gap = 2; // Gap between slices in degrees

        return data.map((item, index) => {
            const proportion = item.value / totalValue;
            const sweepAngle = proportion * 360;
            const startAngle = currentAngle;
            const endAngle = currentAngle + sweepAngle - gap;

            currentAngle += sweepAngle;

            return {
                ...item,
                index,
                startAngle,
                endAngle,
                sweepAngle: sweepAngle - gap,
                percentage: (item.value / totalValue) * 100,
            };
        });
    }, [data, totalValue]);

    // Create arc path for a slice
    const createArcPath = (startAngle: number, endAngle: number, radius: number, center: number) => {
        'worklet';
        const path = Skia.Path.Make();

        // Convert angles to radians
        const startRad = (startAngle * Math.PI) / 180;
        const endRad = (endAngle * Math.PI) / 180;

        path.addArc(
            {
                x: center - radius,
                y: center - radius,
                width: radius * 2,
                height: radius * 2,
            },
            startAngle,
            endAngle - startAngle,
        );

        return path;
    };

    // Check if point is inside arc
    const isPointInArc = (x: number, y: number, startAngle: number, endAngle: number) => {
        'worklet';
        const dx = x - center;
        const dy = y - center;
        const distance = Math.sqrt(dx * dx + dy * dy);

        // Check if point is within radius bounds
        if (distance < radius - strokeWidth / 2 || distance > radius + strokeWidth / 2) {
            return false;
        }

        // Calculate angle of the point
        let angle = Math.atan2(dy, dx) * (180 / Math.PI);
        if (angle < 0) angle += 360;

        // Normalize angles
        const normalizedStart = (startAngle + 360) % 360;
        const normalizedEnd = (endAngle + 360) % 360;

        if (normalizedStart <= normalizedEnd) {
            return angle >= normalizedStart && angle <= normalizedEnd;
        } else {
            return angle >= normalizedStart || angle <= normalizedEnd;
        }
    };

    // Handle touch events
    const handleTouch = (x: number, y: number) => {
        for (let i = 0; i < slices.length; i++) {
            const slice = slices[i];
            if (isPointInArc(x, y, slice.startAngle, slice.endAngle)) {
                setSelectedSlice(selectedSlice === i ? null : i);
                if (onSlicePress) {
                    onSlicePress(i, slice);
                }
                return;
            }
        }
    };

    // Gesture handler
    const gesture = Gesture.Tap()
        .onEnd((event) => {
            runOnJS(handleTouch)(event.x, event.y);
        });

    if (!data || data.length === 0) {
        return (
            <View className="h-[300px] w-full bg-[#303030] rounded-2xl border border-gray-600 items-center justify-center">
                <Text className="text-gray-400 text-lg">No data available</Text>
            </View>
        );
    }

    return (
        <View className=" w-full bg-[#303030] flex items-center justify-center rounded-2xl border border-gray-600 p-6 ">
            <GestureDetector gesture={gesture}>
                <Canvas style={{ width: size + 50, height: size + 20, alignSelf: 'center', overflow: 'visible' }}>
                    {/* Render non-selected slices first */}
                    {slices.map((slice, index) => {
                        const isSelected = selectedSlice === index;
                        if (isSelected) return null; // Skip selected slice for now

                        return (
                            <Path
                                key={index}
                                path={createArcPath(slice.startAngle, slice.endAngle, radius, center)}
                                color={slice.color}
                                style="stroke"
                                strokeWidth={strokeWidth}
                                strokeCap="round"
                            />
                        );
                    })}

                    {/* Render selected slice on top with higher z-index */}
                    {selectedSlice !== null && (
                        <Path
                            key={`selected-${selectedSlice}`}
                            path={createArcPath(
                                slices[selectedSlice].startAngle,
                                slices[selectedSlice].endAngle,
                                radius,
                                center
                            )}
                            color={slices[selectedSlice].color}
                            style="stroke"
                            strokeWidth={strokeWidth * 1.2}
                            strokeCap="round"
                        />
                    )}
                </Canvas>
            </GestureDetector>

            {/* Center information display */}
            {selectedSlice !== null && (
                <View
                    className="absolute items-center justify-center"
                    style={{
                        left: size / 2 - 80,
                        top: size / 2 - 40,
                        width: 160,
                        height: 80,
                        zIndex: 1000,
                    }}
                >
                    <View className="bg-gray-800 border border-gray-600 rounded-lg p-3 items-center">
                        <Text className="text-white font-semibold text-lg text-center">
                            {slices[selectedSlice].label}
                        </Text>
                        <Text className="text-gray-300 text-lg mt-1">
                            {slices[selectedSlice].valueType === 'revenue' ? 'Revenue' :
                                slices[selectedSlice].valueType === 'items' ? 'Items Sold' :
                                    slices[selectedSlice].valueType === 'orders' ? 'Orders' : 'Value'}:
                            {slices[selectedSlice].unit === '$' ? '$' : ''}{slices[selectedSlice].value.toLocaleString()}
                            {slices[selectedSlice].unit && slices[selectedSlice].unit !== '$' ? ` ${slices[selectedSlice].unit}` : ''}
                        </Text>
                        <Text className="text-gray-300 text-lg">
                            {slices[selectedSlice].percentage?.toFixed(1)}%
                        </Text>
                        {slices[selectedSlice].description && (
                            <Text className="text-gray-400 text-sm mt-1 text-center">
                                {slices[selectedSlice].description}
                            </Text>
                        )}
                    </View>
                </View>
            )}

            {/* Legend */}
            {showLabels && (
                <View className="flex-row flex-wrap justify-center mt-4 gap-2">
                    {slices.map((slice, index) => (
                        <TouchableOpacity
                            key={index}
                            onPress={() => {
                                setSelectedSlice(selectedSlice === index ? null : index);
                                if (onSlicePress) {
                                    onSlicePress(index, slice);
                                }
                            }}
                            className={`flex-row items-center px-3 py-2 rounded-lg ${selectedSlice === index ? 'bg-gray-700' : 'bg-gray-800'
                                }`}
                        >
                            <View
                                className="w-3 h-3 rounded-full mr-2"
                                style={{ backgroundColor: slice.color }}
                            />
                            <Text className="text-white text-sm font-medium">
                                {slice.label}
                                {showPercentages && ` (${slice.percentage?.toFixed(1)}%)`}
                            </Text>
                        </TouchableOpacity>
                    ))}
                </View>
            )}

            {/* Tooltip for selected slice */}
            {selectedSlice !== null && tooltipVisible && tooltipData && (
                <View
                    className="absolute bg-gray-800 border border-gray-600 rounded-lg p-3 shadow-lg"
                    style={{
                        left: tooltipData.x,
                        top: tooltipData.y - 60,
                        zIndex: 1000,
                    }}
                >
                    <Text className="text-white font-semibold">{tooltipData.data.label}</Text>
                    <Text className="text-gray-300 text-sm">
                        Value: {tooltipData.data.value}
                    </Text>
                    <Text className="text-gray-300 text-sm">
                        Percentage: {tooltipData.data.percentage?.toFixed(1)}%
                    </Text>
                </View>
            )}
        </View>
    );
};

export default InteractivePieChart;
