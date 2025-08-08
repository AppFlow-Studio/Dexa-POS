import { PARTNER_LOGO_MAP } from "@/lib/mockData";
import { OnlineOrder } from "@/lib/types";
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
  return (
    <Link href={`/online-orders/${order.id.replace("#", "")}` as Href}>
      <View className="bg-white p-4 rounded-2xl border border-gray-200">
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
        <View className="flex-row space-x-2">
          <TouchableOpacity className="flex-1 py-2.5 border border-gray-300 rounded-lg items-center">
            <Text className="font-bold text-gray-700">Reject</Text>
          </TouchableOpacity>
          <TouchableOpacity className="flex-1 py-2.5 bg-primary-400 rounded-lg items-center">
            <Text className="font-bold text-white">Accept</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Link>
  );
};

export default OnlineOrderCard;
