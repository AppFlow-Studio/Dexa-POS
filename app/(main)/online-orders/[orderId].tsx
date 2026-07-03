import MarkOrderReadyDialog from "@/components/online-orders/MarkOrderReadyDialog";
import DeliveryPlatformBadge from "@/components/order/DeliveryPlatformBadge";
import { useOnlineOrderActions } from "@/hooks/orders/useOnlineOrderActions";
import { colors } from "@/lib/theme";
import type { CartItem } from "@/lib/types";
import { useOrder } from "@/stores/selectors/orderSelectors";
import { useOrderStore } from "@/stores/useOrderStore";
import { useLocalSearchParams, useRouter } from "expo-router";
import React from "react";
import {
  ActivityIndicator,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

const DetailRow = ({ children }: { children: React.ReactNode }) => (
  <View className="flex-row gap-x-6">{children}</View>
);

const DetailItem = ({
  label,
  value,
  isTag = false,
  children,
}: {
  label: string;
  value?: string;
  isTag?: boolean;
  children?: React.ReactNode;
}) => (
  <View style={{ flex: 1 }}>
    <Text style={{ fontSize: 16, color: colors.muted, marginBottom: 4 }}>
      {label}
    </Text>
    {children ? (
      children
    ) : isTag ? (
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
    <View className="flex-row items-center justify-between p-4 border border-border rounded-xl bg-panel">
      <View className="flex-1 pr-3">
        <Text className="text-lg font-bold text-heading">
          {item.quantity}× {item.name}
        </Text>
        {mods ? (
          <Text className="text-sm text-label mt-0.5">{mods}</Text>
        ) : null}
        {item.customizations?.notes ? (
          <Text className="text-sm text-hint mt-0.5">
            {item.customizations.notes}
          </Text>
        ) : null}
      </View>
      <Text className="text-lg font-bold text-heading">
        ${lineTotal.toFixed(2)}
      </Text>
    </View>
  );
}

const OnlineOrderDetailsScreen = () => {
  const router = useRouter();
  const { orderId } = useLocalSearchParams<{ orderId: string }>();
  const order = useOrder(orderId);
  const [fetchingItems, setFetchingItems] = React.useState(false);
  const { markReadyOrder, markDoneOrder } = useOnlineOrderActions();
  const [showMarkReady, setShowMarkReady] = React.useState(false);
  const [markingReady, setMarkingReady] = React.useState(false);
  const [markingDone, setMarkingDone] = React.useState(false);

  // Online/OrderOut orders arrive via the header-only realtime broadcast with
  // `items: []` until a bulk refetch. Lazy-load full line items + totals from
  // get_order_details on mount so the details screen isn't stuck at Items(0)/$0.
  React.useEffect(() => {
    if (!orderId) return;
    let cancelled = false;
    setFetchingItems(true);
    useOrderStore
      .getState()
      .syncOrderFromBackendComplete(orderId, { force: true })
      .finally(() => {
        if (!cancelled) setFetchingItems(false);
      });
    return () => {
      cancelled = true;
    };
  }, [orderId]);

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

  // Mark-ready only for delivery-platform (OrderOut) orders still in the kitchen —
  // QR dine-in has no external platform to notify.
  const canMarkReady =
    !!order.delivery_platform &&
    (order.order_status === "accepted" ||
      order.order_status === "sent_to_kitchen" ||
      order.order_status === "preparing");

  const onMarkReadyConfirm = async () => {
    setShowMarkReady(false);
    setMarkingReady(true);
    await markReadyOrder(orderId);
    setMarkingReady(false);
  };

  // Mark-done pushes a stuck "Ready" online order to Done (completed) when the
  // kitchen never bumped it off the KDS.
  const canMarkDone = order.order_status === "ready";

  const onMarkDone = async () => {
    setMarkingDone(true);
    await markDoneOrder(orderId);
    setMarkingDone(false);
  };

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
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <Text
              style={{
                fontSize: 30,
                fontWeight: "bold",
                color: colors.heading,
              }}
            >
              Order Details #{label}
            </Text>
            <DeliveryPlatformBadge
              deliveryPlatform={order.delivery_platform}
              orderSource={order.order_source}
              size="md"
            />
          </View>
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
                <DetailItem label="Source">
                  {order.delivery_platform && !order.service_location_name ? (
                    <View style={{ alignSelf: "flex-start", marginTop: 2 }}>
                      <DeliveryPlatformBadge
                        deliveryPlatform={order.delivery_platform}
                        orderSource={order.order_source}
                        size="kds"
                      />
                    </View>
                  ) : (
                    <Text
                      style={{
                        fontSize: 18,
                        fontWeight: "600",
                        color: colors.heading,
                      }}
                    >
                      {source}
                    </Text>
                  )}
                </DetailItem>
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
              {items.length === 0 ? (
                <View className="flex-row items-center gap-x-2 py-2">
                  {fetchingItems ? (
                    <>
                      <ActivityIndicator size="small" color={colors.muted} />
                      <Text style={{ fontSize: 15, color: colors.muted }}>
                        Loading items…
                      </Text>
                    </>
                  ) : (
                    <Text style={{ fontSize: 15, color: colors.muted }}>
                      No items on this order.
                    </Text>
                  )}
                </View>
              ) : null}
            </View>
          </View>
        </View>
      </ScrollView>

      <View className="p-4 bg-panel/90 border-t border-border flex-row gap-x-3">
        {canMarkReady && (
          <TouchableOpacity
            onPress={() => setShowMarkReady(true)}
            disabled={markingReady}
            className="flex-1 py-3 rounded-xl items-center justify-center border"
            style={{
              backgroundColor: colors.teal + "20",
              borderColor: colors.teal + "40",
            }}
          >
            {markingReady ? (
              <ActivityIndicator color={colors.teal} />
            ) : (
              <Text
                className="text-lg font-bold"
                style={{ color: colors.teal }}
              >
                Mark ready
              </Text>
            )}
          </TouchableOpacity>
        )}
        {canMarkDone && (
          <TouchableOpacity
            onPress={onMarkDone}
            disabled={markingDone}
            className="flex-1 py-3 rounded-xl items-center justify-center border"
            style={{
              backgroundColor: colors.success + "20",
              borderColor: colors.success + "40",
            }}
          >
            {markingDone ? (
              <ActivityIndicator color={colors.success} />
            ) : (
              <Text
                className="text-lg font-bold"
                style={{ color: colors.success }}
              >
                Mark done
              </Text>
            )}
          </TouchableOpacity>
        )}
        <TouchableOpacity
          onPress={() => router.back()}
          className="flex-1 py-3 bg-blue-600 rounded-xl items-center"
        >
          <Text className="text-lg font-bold text-white">Close</Text>
        </TouchableOpacity>
      </View>

      <MarkOrderReadyDialog
        isOpen={showMarkReady}
        orderLabel={String(label)}
        platformLabel={order.delivery_platform}
        onConfirm={onMarkReadyConfirm}
        onCancel={() => setShowMarkReady(false)}
      />
    </View>
  );
};

export default OnlineOrderDetailsScreen;
