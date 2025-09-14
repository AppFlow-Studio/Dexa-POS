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

    const getStatusColor = (status: string, paidStatus: string) => {
        if (status === "Preparing") {
            if (paidStatus === "Paid") {
                // Preparing (Paid) - teal/green
                return {
                    dot: "#2563eb", // Teal
                    bg: "#bae6fd", // Light blue
                    border: "#2dd4bf", // Teal border
                    text: "#134e4a", // Dark teal
                };
            } else {
                // Preparing (Unpaid or Pending) - orange
                return {
                    dot: "#f97316", // Orange
                    bg: "#fef3c7", // Light yellow
                    border: "#fbbf24", // Yellow border
                    text: "#92400e", // Dark brown
                };
            }
        }
        if (status === "Ready") {
            return {
                dot: "#10b981", // Green
                bg: "#d1fae5", // Light green
                border: "#34d399", // Green border
                text: "#065f46", // Dark green
            };
        }
        // Default
        return {
            dot: "#6b7280", // Gray
            bg: "#f3f4f6", // Light gray
            border: "#d1d5db", // Gray border
            text: "#374151", // Dark gray
        };
    };

    const colors = getStatusColor(order.order_status, order.paid_status);
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
                    {order.customer_name ? order.customer_name : `#${orderNumber}`} - {order.order_status} ({order.paid_status})
                </Text>
            </TouchableOpacity>

            {/* Tooltip */}
            {showTooltip && (
                <View className="absolute top-12 left-0 bg-white rounded-lg shadow-lg border border-gray-200 gap-y-2 pb-4 z-50 w-[400px]">
                    <View className="flex-col justify-between items-center w-full px-4 pt-2 gap-y-2">
                        <View className="w-full flex flex-row  items-center">
                            <Text className="text-xl font-bold text-accent-500 mr-4">{order.customer_name || "Walk-In"}</Text>
                            <View className="flex-row gap-2">
                                {/* Order ID Badge */}
                                <View className="px-2 py-0.5 rounded-full bg-gray-100 border border-gray-300">
                                    <Text className="text-xs font-semibold text-gray-700">#{order.id.slice(-4)}</Text>
                                </View>
                                {/* Order Type Badge */}
                                <View className="px-2 py-0.5 rounded-full bg-blue-100 border border-blue-200">
                                    <Text className="text-xs font-semibold text-blue-700">{order.order_type}</Text>
                                </View>
                                {/* Paid Status Badge */}
                                <View
                                    className={`px-2 py-0.5 rounded-full border ${
                                        order.paid_status === "Paid"
                                            ? "bg-green-100 border-green-200"
                                            : order.paid_status === "Pending"
                                            ? "bg-yellow-100 border-yellow-200"
                                            : "bg-red-100 border-red-200"
                                    }`}
                                >
                                    <Text
                                        className={`text-xs font-semibold ${
                                            order.paid_status === "Paid"
                                                ? "text-green-700"
                                                : order.paid_status === "Pending"
                                                ? "text-yellow-700"
                                                : "text-red-700"
                                        }`}
                                    >
                                        {order.paid_status}
                                    </Text>
                                </View>
                                {/* Order Status Badge */}
                                <View
                                    className={`px-2 py-0.5 rounded-full border ${
                                        order.order_status === "Ready"
                                            ? "bg-green-50 border-green-200"
                                            : order.order_status === "Preparing"
                                            ? "bg-yellow-50 border-yellow-200"
                                            : "bg-gray-100 border-gray-200"
                                    }`}
                                >
                                    <Text
                                        className={`text-xs font-semibold ${
                                            order.order_status === "Ready"
                                                ? "text-green-700"
                                                : order.order_status === "Preparing"
                                                ? "text-yellow-700"
                                                : "text-gray-700"
                                        }`}
                                    >
                                        {order.order_status}
                                    </Text>
                                </View>
                            </View>
                        </View>
                        <View className="flex-row justify-between items-center w-full">
                            <Text className="text-md text-accent-500 ">{order.items.length} items - {order.paid_status === "Paid" ? `$${order.total_amount?.toFixed(2)}` : "Pending"}</Text>
                            <Text>Opened at {new Date(order.opened_at).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}</Text>
                        </View>
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
