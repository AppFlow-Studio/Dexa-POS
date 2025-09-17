import OrderDetailItem from "@/components/online-orders/OrderDetailItem";
import { MOCK_ONLINE_ORDERS } from "@/lib/mockData";
import { useLocalSearchParams, useRouter } from "expo-router";
import React from "react";
import { ScrollView, Text, TouchableOpacity, View } from "react-native";

const DetailRow = ({ children }: { children: React.ReactNode }) => (
  <View className="flex-row gap-8">{children}</View>
);

const DetailItem = ({ label, value, isTag = false, tagColor = "" }: any) => (
  <View className="flex-1">
    <Text className="text-xl text-gray-300 mb-1">{label}</Text>
    {isTag ? (
      <View className={`px-3 py-2 self-start rounded-md ${tagColor}`}>
        <Text className={`text-2xl font-semibold capitalize ${tagColor}`}>
          {value}
        </Text>
      </View>
    ) : (
      <Text className="text-2xl font-semibold text-white">{value}</Text>
    )}
  </View>
);

const OnlineOrderDetailsScreen = () => {
  const router = useRouter();
  const { orderId } = useLocalSearchParams();
  const order = MOCK_ONLINE_ORDERS.find((o) => o.id === `#${orderId}`);

  if (!order) {
    return (
      <View>
        <Text className="text-2xl">Order not found!</Text>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-[#212121]">
      <ScrollView className="flex-1 bg-[#212121] p-6">
        <Text className="text-5xl font-extrabold text-white text-center">
          {order.id}
        </Text>
        <View className="flex-row justify-between items-center mx-6">
          <Text className="text-3xl font-bold text-white mb-4">Basic Info</Text>
          <Text className="text-xl text-gray-300">{order.timestamp}</Text>
        </View>

        {/* --- Cards with Info --- */}
        <View className="gap-y-6">
          {/* Basic Info */}
          <View className="bg-[#303030] p-6 rounded-2xl border border-gray-600">
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
              <DetailRow>
                <DetailItem
                  label="Membership Status"
                  value="Yes"
                  isTag
                  tagColor="bg-green-500/20 text-green-400"
                />
                <DetailItem label="Membership Expiry Date" value="Lifetime" />
              </DetailRow>
            </View>
          </View>

          {/* Order Info */}
          <View className="bg-[#303030] p-6 rounded-2xl border border-gray-600">
            <View className="gap-y-4">
              <DetailRow>
                <DetailItem label="Order Placed at" value={order.timestamp} />
                <DetailItem label="Order Due time" value="02/03/25, 06:06 PM" />
              </DetailRow>
              <DetailRow>
                <DetailItem
                  label="Dining Option"
                  value={order.deliveryPartner}
                />
                <DetailItem label="Dining Behavior" value="Takeout" />
              </DetailRow>
              <DetailRow>
                <DetailItem
                  label="Payment Status"
                  value={order.paymentStatus}
                  isTag
                  tagColor="bg-green-500/20 text-green-400"
                />
                <DetailItem
                  label="Delivery Status"
                  value="Delivered"
                  isTag
                  tagColor="bg-blue-500/20 text-blue-400"
                />
              </DetailRow>
              <DetailRow>
                <DetailItem label="Tab Name" value="John's Birthday" />
                <View className="flex-1" />
              </DetailRow>
            </View>
          </View>

          {/* Items List */}
          <View className="bg-[#303030] p-6 rounded-2xl border border-gray-600">
            <Text className="text-3xl font-bold text-white mb-4">
              Items ({order.itemCount})
            </Text>
            <View className="gap-y-3">
              {order.items.map((item) => (
                <OrderDetailItem key={item.id} item={item} />
              ))}
            </View>
          </View>
        </View>

        {/* Add some gap for the floating footer */}
        <View className="h-24" />
      </ScrollView>

      {/* Footer */}
      <View className="p-6 bg-[#303030]/80 backdrop-blur-sm border-t border-gray-600 flex-row justify-end gap-3">
        <TouchableOpacity className="py-4 px-8 border border-gray-500 flex-1 rounded-lg items-center">
          <Text className="text-2xl font-bold text-gray-300">Reject</Text>
        </TouchableOpacity>
        <TouchableOpacity className="py-4 px-8 bg-blue-500 flex-1 rounded-xl items-center">
          <Text className="text-2xl font-bold text-white">Accept</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

export default OnlineOrderDetailsScreen;
