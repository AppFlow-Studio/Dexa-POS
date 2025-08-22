import { PARTNER_LOGO_MAP } from "@/lib/mockData";
import { OnlineOrder } from "@/lib/types";
import { useOnlineOrderStore } from "@/stores/useOnlineOrderStore";
import { Href, Link } from "expo-router";
import React from "react";
import { Image, Text, TouchableOpacity, View } from "react-native";

const partnerColors: { [key: string]: string } = {
  "Door Dash": "bg-red-100",
  "Uber-Eats": "bg-green-100",
  grubhub: "bg-orange-100",
  "Food Panda": "bg-pink-100",
};

const OnlineOrderCard: React.FC<{ order: OnlineOrder }> = ({ order }) => {
  // 2. Get the actions from the store
  const { updateOrderStatus, rejectOrder, archiveOrder } =
    useOnlineOrderStore();

  // 3. --- This is the new conditional logic for the footer ---
  const renderFooter = () => {
    switch (order.status) {
      case "New Orders":
        return (
          <View className="flex-row gap-2">
            <TouchableOpacity
              onPress={() => rejectOrder(order.id)}
              className="flex-1 py-2.5 border border-gray-300 rounded-xl items-center"
            >
              <Text className="font-bold text-gray-700">Reject</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() =>
                updateOrderStatus(order.id, "Confirmed/In-Process")
              }
              className="flex-1 py-2.5 bg-primary-400 rounded-xl items-center"
            >
              <Text className="font-bold text-white">Accept</Text>
            </TouchableOpacity>
          </View>
        );
      case "Confirmed/In-Process":
        return (
          <TouchableOpacity
            onPress={() => updateOrderStatus(order.id, "Ready to Dispatch")}
            className="w-full py-2.5 bg-primary-400 rounded-xl items-center"
          >
            <Text className="font-bold text-white">Mark as Ready</Text>
          </TouchableOpacity>
        );
      case "Ready to Dispatch":
        return (
          <TouchableOpacity
            onPress={() => updateOrderStatus(order.id, "Dispatched")}
            className="w-full py-2.5 bg-primary-400 rounded-xl items-center"
          >
            <Text className="font-bold text-white">Dispatch</Text>
          </TouchableOpacity>
        );
      case "Dispatched":
        return (
          <TouchableOpacity
            onPress={() => archiveOrder(order.id)}
            className="py-2.5 bg-green-100 rounded-xl items-center"
          >
            <Text className="font-bold text-green-800">Archive</Text>
          </TouchableOpacity>
        );
      default:
        return null;
    }
  };
  return (
    <Link href={`/online-orders/${order.id.replace("#", "")}` as Href}>
      <View className="bg-white p-4 rounded-2xl border border-background-400 w-full">
        {/* Header */}
        <View className="flex-row justify-between items-center">
          <View>
            <Text className="text-sm text-gray-500">
              Items: {order.itemCount}
            </Text>
            <Text className="font-bold text-primary-400 mt-1">
              View Order Details
            </Text>
          </View>
          <Text className="text-sm text-gray-500">{order.timestamp}</Text>
        </View>
        {/* Body */}
        <View className="flex-row items-center my-4">
          <View
            className={`w-12 h-12 rounded-full items-center justify-center ${partnerColors[order.deliveryPartner]}`}
          >
            <Image
              source={PARTNER_LOGO_MAP[order.deliveryPartner]}
              className="w-8 h-8"
              resizeMode="contain"
            />
          </View>
          <View className="ml-3 flex-1">
            <Text className="text-base font-bold text-gray-800">
              {order.id}
            </Text>
            <Text className="text-base text-gray-600">
              {order.customerName}
            </Text>
          </View>
          <Text className="text-2xl font-bold text-gray-800">
            ${order.total}
          </Text>
        </View>
        {/* Footer */}
        <View className="mt-4">{renderFooter()}</View>
      </View>
    </Link>
  );
};

export default OnlineOrderCard;
