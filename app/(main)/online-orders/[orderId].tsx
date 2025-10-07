import OrderDetailItem from "@/components/online-orders/OrderDetailItem";
import { MOCK_ONLINE_ORDERS } from "@/lib/mockData";
import { useLocalSearchParams, useRouter } from "expo-router";
import React from "react";
import { ScrollView, Text, TouchableOpacity, View } from "react-native";

const DetailRow = ({ children }: { children: React.ReactNode }) => (
  <View className="flex-row gap-x-6">{children}</View>
);

const DetailItem = ({ label, value, isTag = false, tagColor = "" }: any) => (
  <View className="flex-1">
    <Text className="text-base text-gray-400 mb-1">{label}</Text>
    {isTag ? (
      <View className={`px-2.5 py-1 self-start rounded-md ${tagColor}`}>
        <Text className={`text-base font-semibold capitalize ${tagColor}`}>
          {value}
        </Text>
      </View>
    ) : (
      <Text className="text-lg font-semibold text-white">{value}</Text>
    )}
  </View>
);

const OnlineOrderDetailsScreen = () => {
  const router = useRouter();
  const { orderId } = useLocalSearchParams();
  const order = MOCK_ONLINE_ORDERS.find((o) => o.id === `#${orderId}`);

  if (!order) {
    return (
      <View className="flex-1 bg-[#212121] items-center justify-center">
        <Text className="text-xl text-red-400">Order not found!</Text>
        <TouchableOpacity
          onPress={() => router.back()}
          className="mt-4 px-4 py-2 bg-blue-600 rounded-lg"
        >
          <Text className="text-white text-lg">Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-[#212121]">
      <ScrollView contentContainerStyle={{ padding: 24, paddingBottom: 120 }}>
        <View className="flex-row justify-between items-center mb-6">
          <Text className="text-3xl font-bold text-white">
            Order Details {order.id}
          </Text>
          <Text className="text-lg text-gray-400">{order.timestamp}</Text>
        </View>

        <View className="gap-y-4">
          {/* Basic Info */}
          <View className="bg-[#303030] p-4 rounded-xl border border-gray-700">
            <Text className="text-xl font-bold text-white mb-3">
              Basic Info
            </Text>
            <View className="gap-y-4">
              <DetailRow>
                <DetailItem
                  label="Customer ID"
                  value={order.customerDetails.id}
                />
                <DetailItem label="Customer Name" value={order.customerName} />
              </DetailRow>
              <DetailRow>
                <DetailItem
                  label="Phone Number"
                  value={order.customerDetails.phone}
                />
                <DetailItem label="Email" value={order.customerDetails.email} />
              </DetailRow>
            </View>
          </View>

          {/* Order Info */}
          <View className="bg-[#303030] p-4 rounded-xl border border-gray-700">
            <Text className="text-xl font-bold text-white mb-3">
              Order Info
            </Text>
            <View className="gap-y-4">
              <DetailRow>
                <DetailItem label="Order Placed at" value={order.timestamp} />
                <DetailItem
                  label="Delivery Partner"
                  value={order.deliveryPartner}
                />
              </DetailRow>
              <DetailRow>
                <DetailItem
                  label="Payment Status"
                  value={order.paymentStatus}
                  isTag
                  tagColor="bg-green-900/30 text-green-400"
                />
                <DetailItem
                  label="Delivery Status"
                  value={order.status}
                  isTag
                  tagColor="bg-blue-900/30 text-blue-400"
                />
              </DetailRow>
            </View>
          </View>

          {/* Items List */}
          <View className="bg-[#303030] p-4 rounded-xl border border-gray-700">
            <Text className="text-xl font-bold text-white mb-3">
              Items ({order.itemCount})
            </Text>
            <View className="gap-y-2">
              {order.items.map((item) => (
                <OrderDetailItem key={item.id} item={item} />
              ))}
            </View>
          </View>
        </View>
      </ScrollView>

      <View className="p-4 bg-[#303030]/90 backdrop-blur-sm border-t border-gray-700">
        <TouchableOpacity
          onPress={() => router.back()}
          className="py-3 bg-blue-600 rounded-xl items-center"
        >
          <Text className="text-lg font-bold text-white">Close</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

export default OnlineOrderDetailsScreen;
