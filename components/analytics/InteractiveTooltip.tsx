import React from 'react';
import { Dimensions, Text, TouchableOpacity, View } from 'react-native';
import Animated, {
    useAnimatedStyle,
    useSharedValue,
    withSpring
} from 'react-native-reanimated';

const { width: screenWidth } = Dimensions.get('window');

interface TooltipData {
    label: string;
    value: number | string;
    color?: string;
    additionalInfo?: Record<string, any>;
}

interface InteractiveTooltipProps {
    visible: boolean;
    position: { x: number; y: number };
    data: TooltipData | TooltipData[];
    onClose: () => void;
    chartType: 'bar' | 'line' | 'pie';
    maxWidth?: number;
}

const InteractiveTooltip: React.FC<InteractiveTooltipProps> = ({
    visible,
    position,
    data,
    onClose,
    chartType,
    maxWidth = 200
}) => {
    const opacity = useSharedValue(0);
    const scale = useSharedValue(0.8);

    React.useEffect(() => {
        if (visible) {
            opacity.value = withSpring(1, { damping: 15, stiffness: 150 });
            scale.value = withSpring(1, { damping: 15, stiffness: 150 });
        } else {
            opacity.value = withSpring(0, { damping: 15, stiffness: 150 });
            scale.value = withSpring(0.8, { damping: 15, stiffness: 150 });
        }
    }, [visible]);

    const animatedStyle = useAnimatedStyle(() => ({
        opacity: opacity.value,
        transform: [{ scale: scale.value }],
    }));

    // Calculate tooltip position to keep it within screen bounds
    const getTooltipPosition = () => {
        const tooltipWidth = maxWidth;
        const tooltipHeight = Array.isArray(data) ? 60 + (data.length * 40) : 80;

        let x = position.x - tooltipWidth / 2;
        let y = position.y - tooltipHeight - 20;

        // Keep tooltip within screen bounds
        if (x < 10) x = 10;
        if (x + tooltipWidth > screenWidth - 10) x = screenWidth - tooltipWidth - 10;
        if (y < 10) y = position.y + 20; // Show below if no space above

        return { x, y };
    };

    const tooltipPosition = getTooltipPosition();

    if (!visible) return null;

    const renderTooltipContent = () => {
        if (Array.isArray(data)) {
            // Multiple data points (for pie charts or multi-series)
            return (
                <View className="space-y-2 min-w-2xl w-full">
                    {data.map((item, index) => {
                        if (item.value === null || item.value === undefined || item.value === 'N/A') return null;
                        return (
                            <View key={index} className="flex-row items-center justify-between">
                                <View className="flex-row items-center flex-1">
                                    {item.color && (
                                        <View
                                            className="w-3 h-3 rounded-full mr-2"
                                            style={{ backgroundColor: item.color }}
                                        />
                                    )}
                                    <Text className="text-white text-sm flex-1" numberOfLines={1}>
                                        {item.label}
                                    </Text>
                                </View>
                                <Text className="text-white font-semibold text-sm ml-2">
                                    {typeof item.value === 'number' ? item.value.toLocaleString() : item.value}
                                </Text>
                            </View>
                        )
                    }
                    )}
                </View>
            );
        } else {
            // Single data point
            return (
                <View className="space-y-1 min-w-2xl w-full">
                    <View className="flex-row items-center">
                        {data.color && (
                            <View
                                className="w-3 h-3 rounded-full mr-2"
                                style={{ backgroundColor: data.color }}
                            />
                        )}
                        <Text className="text-white font-semibold text-sm" numberOfLines={1}>
                            {data.label}
                        </Text>
                    </View>
                    <Text className="text-white text-lg font-bold">
                        {typeof data.value === 'number' ? data.value.toLocaleString() : data.value}
                    </Text>
                    {data.additionalInfo && (
                        <View className="mt-2 space-y-1">
                            {Object.entries(data.additionalInfo).map(([key, value]) => {
                                if (value === null || value === undefined || value === 'N/A') return null;
                                return (
                                    <Text key={key} className="text-gray-300 text-xs">
                                        {key}: {typeof value === 'number' ? key == 'revenue' ? `$${value.toLocaleString()}` : value.toLocaleString() : value}
                                    </Text>
                                )
                            })}
                        </View>
                    )}
                </View>
            );
        }
    };

    return (
        <Animated.View
            style={[
                {
                    position: 'absolute',
                    left: tooltipPosition.x,
                    top: tooltipPosition.y,
                    zIndex: 1000,
                },
                animatedStyle,
            ]}
        >
            <View
                className="bg-gray-800 border border-gray-600 w-full rounded-lg p-3 shadow-lg"
                style={{ maxWidth }}
            >
                {/* Close button */}
                <TouchableOpacity
                    onPress={onClose}
                    className="absolute -top-2 -right-2 w-6 h-6 bg-gray-700 rounded-full items-center justify-center z-10"
                >
                    <Text className="text-white text-xs font-bold">×</Text>
                </TouchableOpacity>

                {/* Tooltip content */}
                {renderTooltipContent()}

                {/* Arrow pointing to data point */}
                <View
                    className="absolute w-0 h-0 border-l-4 border-r-4 border-t-4 border-l-transparent border-r-transparent border-t-gray-600"
                    style={{
                        left: position.x - tooltipPosition.x - 4,
                        bottom: -4,
                    }}
                />
            </View>
        </Animated.View>
    );
};

export default InteractiveTooltip;
