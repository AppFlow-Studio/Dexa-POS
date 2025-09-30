import { Skia, useFont } from "@shopify/react-native-skia";
import React, { useMemo, useState } from "react";
import { Text, View } from "react-native";
import { Gesture } from 'react-native-gesture-handler';
import {
    runOnJS,
    useSharedValue,
    withSpring
} from 'react-native-reanimated';
// import { useChartTransformState } from "victory-native";
import Inter from "../../assets/fonts/Inter-Medium.ttf";
import InteractivePieChart from "./InteractivePieChart";

function generateRandomColor(): string {
    // Generating a random number between 0 and 0xFFFFFF
    const randomColor = Math.floor(Math.random() * 0xffffff);
    // Converting the number to a hexadecimal string and padding with zeros
    return `#${randomColor.toString(16).padStart(6, "0")}`;
}


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
    const [selectedSlice, setSelectedSlice] = useState<number | null>(null);
    const [tooltipVisible, setTooltipVisible] = useState(false);
    const [tooltipData, setTooltipData] = useState<{ x: number; y: number; data: any } | null>(null);

    if (!data || data.length === 0) {
        return (
            <View className="h-[300px] w-full bg-[#303030] rounded-2xl border border-gray-600 items-center justify-center">
                <Text className="text-gray-400 text-lg">No data available</Text>
            </View>
        );
    }
    // const { state } = useChartTransformState();

    const transformedData = data.map((item, index) => ({
        value: item.value,
        color: generateRandomColor(),
        label: item.label,
        valueType: item.valueType || 'value', // 'revenue', 'items', 'orders', etc.
        unit: item.unit || '', // '$', 'items', 'orders', etc.
        description: item.description || '', // Additional context
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

    // Animation values
    const animationProgress = useSharedValue(0);
    const selectedSliceValue = useSharedValue<number | null>(null);

    // Start animation on mount
    React.useEffect(() => {
        animationProgress.value = withSpring(1, {
            damping: 15,
            stiffness: 100,
        });
    }, []);

    // Handle touch events
    const handleTouch = (x: number, y: number) => {
        const dx = x - CENTER;
        const dy = y - CENTER;
        const distance = Math.sqrt(dx * dx + dy * dy);

        // Check if point is within radius bounds
        if (distance < RADIUS - BASE_STROKE_WIDTH / 2 || distance > RADIUS + BASE_STROKE_WIDTH / 2) {
            return;
        }

        // Calculate angle of the point
        let angle = Math.atan2(dy, dx) * (180 / Math.PI);
        if (angle < 0) angle += 360;

        // Find which slice contains this angle
        let currentAngle = -90;
        for (let i = 0; i < transformedData.length; i++) {
            const proportion = transformedData[i].value / totalValue;
            const sweepAngle = proportion * 360;
            const startAngle = currentAngle;
            const endAngle = currentAngle + sweepAngle - GAP;

            if (angle >= startAngle && angle <= endAngle) {
                const newSelectedSlice = selectedSlice === i ? null : i;
                setSelectedSlice(newSelectedSlice);
                selectedSliceValue.value = newSelectedSlice;

                if (newSelectedSlice !== null) {
                    setTooltipData({
                        x: x,
                        y: y,
                        data: transformedData[i],
                    });
                    setTooltipVisible(true);
                } else {
                    setTooltipVisible(false);
                }
                break;
            }

            currentAngle += sweepAngle;
        }
    };

    // Gesture handler
    const gesture = Gesture.Tap()
        .onEnd((event) => {
            runOnJS(handleTouch)(event.x, event.y);
        });

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
                width: "100%",
            }}
        >
            {/* <GestureDetector gesture={gesture}>
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
            </GestureDetector> */}

            <InteractivePieChart
                data={transformedData}
                onSlicePress={(index, data) => {
                    console.log('Pie slice pressed:', { index, data });
                }}
            />

            {/* <View style={{ flexDirection: "row", alignSelf: "center", marginTop: 5 }}>
                {transformedData.map((d, index) => {
                    const isSelected = selectedSlice === index;
                    return (
                        <TouchableOpacity
                            key={index}
                            onPress={() => {
                                const newSelectedSlice = selectedSlice === index ? null : index;
                                setSelectedSlice(newSelectedSlice);
                                selectedSliceValue.value = newSelectedSlice;
                            }}
                            style={{
                                marginRight: 8,
                                flexDirection: "row",
                                alignItems: "center",
                                padding: 4,
                                borderRadius: 8,
                                backgroundColor: isSelected ? '#374151' : 'transparent',
                            }}
                        >
                            <Canvas style={{ height: 12, width: 12, marginRight: 4 }}>
                                <Rect
                                    rect={{ x: 0, y: 0, width: 12, height: 12 }}
                                    color={d.color}
                                />
                            </Canvas>
                            <Text className={`text-white ${isSelected ? 'font-semibold' : ''}`}>
                                {d.label}
                            </Text>
                        </TouchableOpacity>
                    );
                })}
            </View> */}

            {/* Tooltip for selected slice */}
            {selectedSlice !== null && tooltipVisible && tooltipData && (
                <View
                    className="absolute bg-gray-800 border border-gray-600 rounded-lg p-3 shadow-lg"
                    style={{
                        left: Math.min(tooltipData.x, 300),
                        top: Math.max(tooltipData.y - 80, 10),
                        zIndex: 1000,
                        maxWidth: 200,
                    }}
                >
                    <Text className="text-white font-semibold text-base">{tooltipData.data.label}</Text>
                    <Text className="text-gray-300 text-sm mt-1">
                        Value: {tooltipData.data.value.toLocaleString()}
                    </Text>
                    <Text className="text-gray-300 text-sm">
                        Percentage: {((tooltipData.data.value / totalValue) * 100).toFixed(1)}%
                    </Text>
                </View>
            )}
        </View >
    );
}