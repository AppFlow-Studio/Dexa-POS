import { colors } from "@/lib/theme";
import type { CartItem } from "@/lib/types";
import { useOrder } from "@/stores/selectors/orderSelectors";
import { useLocalSearchParams, useRouter } from "expo-router";
import React from "react";
import { ScrollView, Text, TouchableOpacity, View } from "react-native";

const DetailRow = ({ children }: { children: React.ReactNode }) => (
  <View className="flex-row gap-x-6">{children}</View>
);

const DetailItem = ({
  label,
  value,
  isTag = false,
}: {
  label: string;
  value: string;
  isTag?: boolean;
}) => (
  <View style={{ flex: 1 }}>
    <Text style={{ fontSize: 16, color: colors.muted, marginBottom: 4 }}>
      {label}
    </Text>
    {isTag ? (
      <View
        style={{
          paddingHorizontal: 10,
          paddingVertical: 4,
          alignSelf: "flex-start",
          borderRadius: 6,
          backgroundColor: colors.teal + "20",
        }}
      >
        <Text
          style={{
            fontSize: 16,
            fontWeight: "600",
            textTransform: "capitalize",
            color: colors.teal,
          }}
        >
          {value}
        </Text>
      </View>
    ) : (
      <Text style={{ fontSize: 18, fontWeight: "600", color: colors.heading }}>
        {value}
      </Text>
    )}
  </View>
);

function ItemRow({ item }: { item: CartItem }) {
  const mods = (item.customizations?.addOns ?? [])
    .map((a) => a?.name)
    .filter(Boolean)
    .join(", ");
  const lineTotal = (item.price ?? 0) * (item.quantity ?? 1);
  return (
    <View className="flex-row items-center justify-between p-4 border border-gray-600 rounded-xl bg-panel">
      <View className="flex-1 pr-3">
        <Text className="text-lg font-bold text-white">
          {item.quantity}× {item.name}
        </Text>
        {mods ? (
          <Text className="text-sm text-gray-300 mt-0.5">{mods}</Text>
        ) : null}
        {item.customizations?.notes ? (
          <Text className="text-sm text-gray-400 mt-0.5">
            {item.customizations.notes}
          </Text>
        ) : null}
      </View>
      <Text className="text-lg font-bold text-white">
        ${lineTotal.toFixed(2)}
      </Text>
    </View>
  );
}

const OnlineOrderDetailsScreen = () => {
  const router = useRouter();
  const { orderId } = useLocalSearchParams<{ orderId: string }>();
  const order = useOrder(orderId);

  if (!order) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: colors.screen,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Text style={{ fontSize: 20, color: colors.danger }}>
          Order not found!
        </Text>
        <TouchableOpacity
          onPress={() => router.back()}
          style={{
            marginTop: 16,
            paddingHorizontal: 16,
            paddingVertical: 8,
            backgroundColor: colors.teal,
            borderRadius: 8,
          }}
        >
          <Text style={{ color: colors.onSolid, fontSize: 18 }}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const label = order.display_number || order.order_number || order.id;
  const items = order.items ?? [];
  // QR dine-in orders carry the table label via service_location_name.
  const source = order.service_location_name
    ? `${order.service_location_name} · QR`
    : order.delivery_platform || "Online";

  return (
    <View style={{ flex: 1, backgroundColor: colors.screen }}>
      <ScrollView contentContainerStyle={{ padding: 24, paddingBottom: 120 }}>
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 24,
          }}
        >
          <Text
            style={{ fontSize: 30, fontWeight: "bold", color: colors.heading }}
          >
            Order Details #{label}
          </Text>
        </View>

        <View className="gap-y-4">
          {/* Customer */}
          <View
            style={{
              backgroundColor: colors.panel,
              padding: 16,
              borderRadius: 12,
              borderWidth: 1,
              borderColor: colors.border,
            }}
          >
            <Text
              style={{
                fontSize: 20,
                fontWeight: "bold",
                color: colors.heading,
                marginBottom: 12,
              }}
            >
              Customer
            </Text>
            <View className="gap-y-4">
              <DetailRow>
                <DetailItem
                  label="Customer Name"
                  value={order.customer_name || "Guest"}
                />
                <DetailItem label="Source" value={source} />
              </DetailRow>
            </View>
          </View>

          {/* Order Info */}
          <View
            style={{
              backgroundColor: colors.panel,
              padding: 16,
              borderRadius: 12,
              borderWidth: 1,
              borderColor: colors.border,
            }}
          >
            <Text
              style={{
                fontSize: 20,
                fontWeight: "bold",
                color: colors.heading,
                marginBottom: 12,
              }}
            >
              Order Info
            </Text>
            <View className="gap-y-4">
              <DetailRow>
                <DetailItem
                  label="Status"
                  value={order.order_status}
                  isTag
                />
                <DetailItem
                  label="Total"
                  value={`$${(order.total_amount ?? 0).toFixed(2)}`}
                />
              </DetailRow>
            </View>
          </View>

          {/* Items */}
          <View
            style={{
              backgroundColor: colors.panel,
              padding: 16,
              borderRadius: 12,
              borderWidth: 1,
              borderColor: colors.border,
            }}
          >
            <Text
              style={{
                fontSize: 20,
                fontWeight: "bold",
                color: colors.heading,
                marginBottom: 12,
              }}
            >
              Items ({items.reduce((n, i) => n + (i.quantity || 0), 0)})
            </Text>
            <View className="gap-y-2">
              {items.map((item) => (
                <ItemRow key={item.id} item={item} />
              ))}
            </View>
          </View>
        </View>
      </ScrollView>

      <View className="p-4 bg-panel/90 border-t border-border">
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
