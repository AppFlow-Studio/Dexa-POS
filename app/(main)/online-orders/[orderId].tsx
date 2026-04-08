import OrderDetailItem from "@/components/online-orders/OrderDetailItem";
import { MOCK_ONLINE_ORDERS } from "@/lib/mockData";
import { colors } from "@/lib/theme";
import { useLocalSearchParams, useRouter } from "expo-router";
import React from "react";
import { ScrollView, Text, TouchableOpacity, View } from "react-native";

const DetailRow = ({ children }: { children: React.ReactNode }) => (
  <View className="flex-row gap-x-6">{children}</View>
);

const DetailItem = ({ label, value, isTag = false, tagColor = "" }: any) => (
  <View style={{ flex: 1 }}>
    <Text style={{ fontSize: 16, color: colors.muted, marginBottom: 4 }}>{label}</Text>
    {isTag ? (
      <View style={{ paddingHorizontal: 10, paddingVertical: 4, alignSelf: "flex-start", borderRadius: 6, backgroundColor: colors.teal + "20" }}>
        <Text style={{ fontSize: 16, fontWeight: "600", textTransform: "capitalize", color: colors.teal }}>
          {value}
        </Text>
      </View>
    ) : (
      <Text style={{ fontSize: 18, fontWeight: "600", color: colors.heading }}>{value}</Text>
    )}
  </View>
);

const OnlineOrderDetailsScreen = () => {
  const router = useRouter();
  const { orderId } = useLocalSearchParams();
  const order = MOCK_ONLINE_ORDERS.find((o) => o.id === `#${orderId}`);

  if (!order) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.screen, alignItems: "center", justifyContent: "center" }}>
        <Text style={{ fontSize: 20, color: colors.danger }}>Order not found!</Text>
        <TouchableOpacity
          onPress={() => router.back()}
          style={{ marginTop: 16, paddingHorizontal: 16, paddingVertical: 8, backgroundColor: colors.teal, borderRadius: 8 }}
        >
          <Text style={{ color: colors.onSolid, fontSize: 18 }}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.screen }}>
      <ScrollView contentContainerStyle={{ padding: 24, paddingBottom: 120 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
          <Text style={{ fontSize: 30, fontWeight: "bold", color: colors.heading }}>
            Order Details {order.id}
          </Text>
          <Text style={{ fontSize: 18, color: colors.muted }}>{order.timestamp}</Text>
        </View>

        <View className="gap-y-4">
          {/* Basic Info */}
          <View style={{ backgroundColor: colors.panel, padding: 16, borderRadius: 12, borderWidth: 1, borderColor: colors.border }}>
            <Text style={{ fontSize: 20, fontWeight: "bold", color: colors.heading, marginBottom: 12 }}>
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
          <View style={{ backgroundColor: colors.panel, padding: 16, borderRadius: 12, borderWidth: 1, borderColor: colors.border }}>
            <Text style={{ fontSize: 20, fontWeight: "bold", color: colors.heading, marginBottom: 12 }}>
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
          <View style={{ backgroundColor: colors.panel, padding: 16, borderRadius: 12, borderWidth: 1, borderColor: colors.border }}>
            <Text style={{ fontSize: 20, fontWeight: "bold", color: colors.heading, marginBottom: 12 }}>
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

      <View className="p-4 bg-panel/90 backdrop-blur-sm border-t border-border">
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
