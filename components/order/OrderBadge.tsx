import { OrderProfile } from "@/lib/types";
import { CheckCircle, Eye } from "lucide-react-native";
import React, { useState } from "react";
import { Text, TouchableOpacity, View } from "react-native";
import { Button } from "../ui/button";

interface OrderBadgeProps {
    order: OrderProfile;
    onMarkReady: () => void;
    onViewItems: () => void;
}

const OrderBadge: React.FC<OrderBadgeProps> = ({
    order,
    onMarkReady,
    onViewItems,
}) => {
    const [showTooltip, setShowTooltip] = useState(false);

    const getStatusColor = (status: string) => {
        switch (status) {
            case "Preparing":
                return {
                    dot: "#f97316", // Orange
                    bg: "#fef3c7", // Light yellow
                    border: "#fbbf24", // Yellow border
                    text: "#92400e", // Dark brown
                };
            case "Ready":
                return {
                    dot: "#10b981", // Green
                    bg: "#d1fae5", // Light green
                    border: "#34d399", // Green border
                    text: "#065f46", // Dark green
                };
            default:
                return {
                    dot: "#6b7280", // Gray
                    bg: "#f3f4f6", // Light gray
                    border: "#d1d5db", // Gray border
                    text: "#374151", // Dark gray
                };
        }
    };

    const colors = getStatusColor(order.order_status);
    const orderNumber = order.id.slice(-4); // Last 4 digits

    return (
        <View className="relative">
            <TouchableOpacity
                onPress={() => setShowTooltip(!showTooltip)}
                className="flex-row items-center px-3 py-2 rounded-full border"
                style={{
                    backgroundColor: colors.bg,
                    borderColor: colors.border,
                }}
            >
                {/* Status Dot */}
                <View
                    className="w-2 h-2 rounded-full mr-2"
                    style={{ backgroundColor: colors.dot }}
                />

                {/* Order Number and Status */}
                <Text
                    className="font-medium text-sm"
                    style={{ color: colors.text }}
                >
                    {order.customer_name ? order.customer_name : `#${orderNumber}`} - {order.order_status}
                </Text>
            </TouchableOpacity>

            {/* Tooltip */}
            {showTooltip && (
                <View className="absolute top-12 left-0 bg-white rounded-lg shadow-lg border border-gray-200 gap-y-2 pb-4 z-50 w-full min-w-[260px]">
                    <View className="flex-col justify-start items-center w-full px-4 pt-2 ">
                        <Text className="text-xl font-bold text-accent-500 w-full">{order.customer_name || "Walk-In"}</Text>
                        <Text className="text-md text-accent-500 w-full">{order.items.length} items - ${order.total_amount?.toFixed(2)}</Text>
                    </View>
                    {/* Mark Ready Button */}
                    <Button
                        variant="outline"
                        onPress={() => {
                            onMarkReady();
                            setShowTooltip(false);
                        }}
                        className="flex-row items-center px-4 py-3 bg-green-200 w-[95%] self-center border-b border-gray-100 hover:bg-gray-50"
                    >
                        <CheckCircle color="#10b981" size={16} />
                        <Text className="ml-2 font-medium text-gray-800">Mark as Done</Text>
                    </Button>

                    {/* View Items Button */}
                    <Button
                        variant="outline"
                        onPress={() => {
                            onViewItems();
                            setShowTooltip(false);
                        }}
                        className="flex-row items-center px-4 py-3  w-[95%] self-center hover:bg-gray-50"
                    >
                        <Eye color="#6b7280" size={16} />
                        <Text className="ml-2 font-medium text-gray-800">View Items</Text>
                    </Button>
                </View>
            )}

            {/* Overlay to close tooltip when clicking outside */}
            {showTooltip && (
                <TouchableOpacity
                    style={{
                        position: "absolute",
                        top: -1000,
                        left: -1000,
                        right: -1000,
                        bottom: -1000,
                        zIndex: 40,
                    }}
                    onPress={() => setShowTooltip(false)}
                    activeOpacity={1}
                />
            )}
        </View>
    );
};

export default OrderBadge;
