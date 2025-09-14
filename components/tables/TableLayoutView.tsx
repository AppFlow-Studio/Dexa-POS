import { TableType } from "@/lib/types";
import { useFloorPlanStore } from "@/stores/useFloorPlanStore";
import { Minus, Plus } from "lucide-react-native";
import React from "react";
import { StyleSheet, TouchableOpacity, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
    useAnimatedStyle,
    useSharedValue,
} from "react-native-reanimated";
import Svg, { Line } from "react-native-svg";
import DraggableTable from "./DraggableTable";
import SelectableTable from "./SelectableTable";

interface TableLayoutViewProps {
    tables: TableType[];
    onTablePress?: (table: TableType) => void;
    isEditMode?: boolean;
    showConnections?: boolean;
    className?: string;
    isSelectionMode?: boolean;
    selectedTableId?: string | null;
    onTableSelect?: (table: TableType) => void;
    activeOrderId?: string | null;
}

const TableLayoutView: React.FC<TableLayoutViewProps> = ({
    tables,
    onTablePress,
    isEditMode = false,
    showConnections = true,
    className = "",
    isSelectionMode = false,
    selectedTableId = null,
    onTableSelect,
    activeOrderId = null,
}) => {
    const { updateTablePosition, updateTableRotation, removeTable } = useFloorPlanStore();

    // Gesture handling for pan and zoom
    const translateX = useSharedValue(0);
    const translateY = useSharedValue(0);
    const scale = useSharedValue(1);

    const panGesture = Gesture.Pan()
        .onUpdate((event) => {
            translateX.value = event.translationX;
            translateY.value = event.translationY;
        });

    const pinchGesture = Gesture.Pinch()
        .onUpdate((event) => {
            scale.value = event.scale;
        });

    const combinedGesture = Gesture.Simultaneous(panGesture, pinchGesture);

    const canvasAnimatedStyle = useAnimatedStyle(() => {
        return {
            transform: [
                { translateX: translateX.value },
                { translateY: translateY.value },
                { scale: scale.value },
            ],
        };
    });

    return (
        <View className={`flex-1 relative overflow-hidden ${className}`}>
            <View className="absolute top-2 left-2 flex flex-col z-20 gap-y-2">
                <View className="w-fit">
                    <TouchableOpacity
                        onPress={() => {
                            scale.value += 0.1;
                        }}
                        className={`flex-row items-center bg-[#303030] border border-gray-600 rounded-lg px-4 py-3 justify-start`}
                    >
                        <Plus color="#9CA3AF" size={20} />
                        {/* <Text className="text-gray-300 ml-4">Search</Text> */}
                    </TouchableOpacity>
                </View>
                {/* Open Item */}
                <View className="w-fit">
                    <TouchableOpacity
                        onPress={() => {
                            scale.value -= 0.1;
                        }}
                        className={`flex-row items-center bg-[#303030] border border-gray-600 rounded-lg px-4 py-3 justify-start `}
                    >
                        <Minus color="#9CA3AF" size={20} />
                    </TouchableOpacity>
                </View>
            </View>
            <GestureDetector gesture={combinedGesture}>
                {/* This Animated.View is our "canvas" that will move and scale */}
                <Animated.View
                    style={canvasAnimatedStyle}
                    className="w-full h-full"
                >
                    {showConnections && (
                        <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
                            {tables.map((table) => {
                                if (table.isPrimary && table.mergedWith) {
                                    const primaryCenter = {
                                        x: table.x + 50,
                                        y: table.y + 50,
                                    }; // Approx center
                                    return table.mergedWith.map((mergedId) => {
                                        const mergedTable = tables.find(
                                            (t) => t.id === mergedId
                                        );
                                        if (!mergedTable) return null;
                                        const mergedCenter = {
                                            x: mergedTable.x + 50,
                                            y: mergedTable.y + 50,
                                        };
                                        return (
                                            <Line
                                                key={`${table.id}-${mergedId}`}
                                                x1={primaryCenter.x}
                                                y1={primaryCenter.y}
                                                x2={mergedCenter.x}
                                                y2={mergedCenter.y}
                                                stroke="#F59E0B" // Amber-500
                                                strokeWidth="4"
                                                strokeDasharray="8, 4"
                                            />
                                        );
                                    });
                                }
                                return null;
                            })}
                        </Svg>
                    )}
                    {tables.map((table) => {
                        if (isSelectionMode) {
                            return (
                                <SelectableTable
                                    key={table.id}
                                    table={table}
                                    isSelected={selectedTableId === table.id}
                                    onSelect={onTableSelect || (() => { })}
                                    canvasScale={scale}
                                    activeOrderId={activeOrderId}
                                />
                            );
                        } else {
                            return (
                                <DraggableTable
                                    key={table.id}
                                    table={table}
                                    isEditMode={isEditMode}
                                    isSelected={false} // Can be controlled by parent if needed
                                    onSelect={() => { }} // Can be controlled by parent if needed
                                    canvasScale={scale}
                                    onPress={onTablePress ? () => onTablePress(table) : undefined}
                                />
                            );
                        }
                    })}
                </Animated.View>
            </GestureDetector>
        </View>
    );
};

export default TableLayoutView;
