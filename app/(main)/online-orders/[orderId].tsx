import MarkOrderReadyDialog from "@/components/online-orders/MarkOrderReadyDialog";
import DeliveryPlatformBadge from "@/components/order/DeliveryPlatformBadge";
import { useOnlineOrderActions } from "@/hooks/orders/useOnlineOrderActions";
import { colors } from "@/lib/theme";
import type { CartItem } from "@/lib/types";
import { useUiScale } from "@/lib/uiScale";
import { registerVisibleOrderDetail } from "@/stores/orderDetailStaleness";
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
  <View style={{ flexDirection: "row", gap: 24 }}>{children}</View>
);

const DetailItem = ({
  label,
  value,
  isTag = false,
  s,
  children,
}: {
  label: string;
  value?: string;
  isTag?: boolean;
  s: (n: number) => number;
  children?: React.ReactNode;
}) => (
  <View style={{ flex: 1 }}>
    <Text style={{ fontSize: s(16), color: colors.muted, marginBottom: s(4) }}>
      {label}
    </Text>
    {children ? (
      children
    ) : isTag ? (
      <View
        style={{
          paddingHorizontal: s(10),
          paddingVertical: s(4),
          alignSelf: "flex-start",
          borderRadius: s(6),
          backgroundColor: colors.teal + "20",
        }}
      >
        <Text
          style={{
            fontSize: s(16),
            fontWeight: "600",
            textTransform: "capitalize",
            color: colors.teal,
          }}
        >
          {value}
        </Text>
      </View>
    ) : (
      <Text
        style={{ fontSize: s(18), fontWeight: "600", color: colors.heading }}
      >
        {value}
      </Text>
    )}
  </View>
);

const ItemRow = ({ item, s }: { item: CartItem; s: (n: number) => number }) => {
  const mods = (item.customizations?.addOns ?? [])
    .map((a) => a?.name)
    .filter(Boolean)
    .join(", ");
  const lineTotal = (item.price ?? 0) * (item.quantity ?? 1);
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        padding: s(16),
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: s(12),
        backgroundColor: colors.panel,
      }}
    >
      <View style={{ flex: 1, paddingRight: s(12) }}>
        <Text
          style={{ fontSize: s(18), fontWeight: "bold", color: colors.heading }}
        >
          {item.quantity}× {item.name}
        </Text>
        {mods ? (
          <Text
            style={{ fontSize: s(14), color: colors.label, marginTop: s(2) }}
          >
            {mods}
          </Text>
        ) : null}
        {item.customizations?.notes ? (
          <Text
            style={{ fontSize: s(14), color: colors.muted, marginTop: s(2) }}
          >
            {item.customizations.notes}
          </Text>
        ) : null}
      </View>
      <Text
        style={{ fontSize: s(18), fontWeight: "bold", color: colors.heading }}
      >
        ${lineTotal.toFixed(2)}
      </Text>
    </View>
  );
};

const OnlineOrderDetailsScreen = () => {
  const router = useRouter();
  const { orderId } = useLocalSearchParams<{ orderId: string }>();
  const uiScale = useUiScale();
  const s = (n: number) => Math.round(n * uiScale);
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

  // W1-3: this screen shows full item detail without setActiveOrder, so it
  // registers as a visible-detail consumer — broadcasts for this order keep
  // eager-refreshing (instead of being marked detailStale) while it's open.
  const visibleDbOrderId = order?.db_order_id ?? orderId;
  React.useEffect(() => {
    if (!visibleDbOrderId) return;
    return registerVisibleOrderDetail(visibleDbOrderId);
  }, [visibleDbOrderId]);

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
        <Text style={{ fontSize: s(20), color: colors.danger }}>
          Order not found!
        </Text>
        <TouchableOpacity
          onPress={() => router.back()}
          style={{
            marginTop: s(16),
            paddingHorizontal: s(16),
            paddingVertical: s(8),
            backgroundColor: colors.teal,
            borderRadius: s(8),
          }}
        >
          <Text style={{ color: colors.onSolid, fontSize: s(18) }}>
            Go Back
          </Text>
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
      <ScrollView
        contentContainerStyle={{ padding: s(24), paddingBottom: s(120) }}
      >
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: s(24),
          }}
        >
          <View
            style={{ flexDirection: "row", alignItems: "center", gap: s(12) }}
          >
            <Text
              style={{
                fontSize: s(30),
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

        <View style={{ gap: s(16) }}>
          {/* Customer */}
          <View
            style={{
              backgroundColor: colors.panel,
              padding: s(16),
              borderRadius: s(12),
              borderWidth: 1,
              borderColor: colors.border,
            }}
          >
            <Text
              style={{
                fontSize: s(20),
                fontWeight: "bold",
                color: colors.heading,
                marginBottom: s(12),
              }}
            >
              Customer
            </Text>
            <View style={{ gap: s(16) }}>
              <DetailRow>
                <DetailItem
                  s={s}
                  label="Customer Name"
                  value={order.customer_name || "Guest"}
                />
                <DetailItem s={s} label="Source">
                  {order.delivery_platform && !order.service_location_name ? (
                    <View style={{ alignSelf: "flex-start", marginTop: s(2) }}>
                      <DeliveryPlatformBadge
                        deliveryPlatform={order.delivery_platform}
                        orderSource={order.order_source}
                        size="kds"
                      />
                    </View>
                  ) : (
                    <Text
                      style={{
                        fontSize: s(18),
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
              padding: s(16),
              borderRadius: s(12),
              borderWidth: 1,
              borderColor: colors.border,
            }}
          >
            <Text
              style={{
                fontSize: s(20),
                fontWeight: "bold",
                color: colors.heading,
                marginBottom: s(12),
              }}
            >
              Order Info
            </Text>
            <View style={{ gap: s(16) }}>
              <DetailRow>
                <DetailItem
                  s={s}
                  label="Status"
                  value={order.order_status}
                  isTag
                />
                <DetailItem
                  s={s}
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
              padding: s(16),
              borderRadius: s(12),
              borderWidth: 1,
              borderColor: colors.border,
            }}
          >
            <Text
              style={{
                fontSize: s(20),
                fontWeight: "bold",
                color: colors.heading,
                marginBottom: s(12),
              }}
            >
              Items ({items.reduce((n, i) => n + (i.quantity || 0), 0)})
            </Text>
            <View style={{ gap: s(8) }}>
              {items.map((item) => (
                <ItemRow key={item.id} item={item} s={s} />
              ))}
              {items.length === 0 ? (
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: s(8),
                    paddingVertical: s(8),
                  }}
                >
                  {fetchingItems ? (
                    <>
                      <ActivityIndicator size="small" color={colors.muted} />
                      <Text style={{ fontSize: s(15), color: colors.muted }}>
                        Loading items…
                      </Text>
                    </>
                  ) : (
                    <Text style={{ fontSize: s(15), color: colors.muted }}>
                      No items on this order.
                    </Text>
                  )}
                </View>
              ) : null}
            </View>
          </View>
        </View>
      </ScrollView>

      <View
        style={{
          padding: s(16),
          backgroundColor: colors.panel,
          borderTopWidth: 1,
          borderColor: colors.border,
          flexDirection: "row",
          gap: s(12),
        }}
      >
        {canMarkReady && (
          <TouchableOpacity
            onPress={() => setShowMarkReady(true)}
            disabled={markingReady}
            style={{
              flex: 1,
              paddingVertical: s(12),
              borderRadius: s(12),
              alignItems: "center",
              justifyContent: "center",
              borderWidth: 1,
              backgroundColor: colors.teal + "20",
              borderColor: colors.teal + "40",
            }}
          >
            {markingReady ? (
              <ActivityIndicator color={colors.teal} />
            ) : (
              <Text
                style={{
                  fontSize: s(18),
                  fontWeight: "bold",
                  color: colors.teal,
                }}
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
            style={{
              flex: 1,
              paddingVertical: s(12),
              borderRadius: s(12),
              alignItems: "center",
              justifyContent: "center",
              borderWidth: 1,
              backgroundColor: colors.success + "20",
              borderColor: colors.success + "40",
            }}
          >
            {markingDone ? (
              <ActivityIndicator color={colors.success} />
            ) : (
              <Text
                style={{
                  fontSize: s(18),
                  fontWeight: "bold",
                  color: colors.success,
                }}
              >
                Mark done
              </Text>
            )}
          </TouchableOpacity>
        )}
        <TouchableOpacity
          onPress={() => router.back()}
          style={{
            flex: 1,
            paddingVertical: s(12),
            borderRadius: s(12),
            alignItems: "center",
            backgroundColor: colors.teal,
          }}
        >
          <Text
            style={{
              fontSize: s(18),
              fontWeight: "bold",
              color: colors.onSolid,
            }}
          >
            Close
          </Text>
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
