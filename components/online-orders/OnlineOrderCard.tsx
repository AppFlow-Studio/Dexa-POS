import { useOnlineOrderActions } from "@/hooks/orders/useOnlineOrderActions";
import { useOrder } from "@/stores/selectors/orderSelectors";
import { Href, Link } from "expo-router";
import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

export type OnlineColumnVariant = "new" | "kitchen" | "ready" | "done";

interface OnlineOrderCardProps {
  /** Store key OR db_order_id — resolved via useOrder/getOrder. */
  orderId: string;
  variant: OnlineColumnVariant;
}

function formatTime(iso: string | null): string {
  if (!iso) return "";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "";
  const d = new Date(t);
  let h = d.getHours();
  const m = d.getMinutes();
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return `${h}:${m.toString().padStart(2, "0")} ${ampm}`;
}

function sourceLabel(
  deliveryPlatform: string | null | undefined,
  orderType: string | null | undefined,
  tableLabel: string | null | undefined,
): string {
  // QR dine-in orders carry the table label (website sets table_number =
  // table_label → transformed to service_location_name). order_type can't tell
  // them apart — it collapses to 'takeout' — so key on the label's presence.
  if (tableLabel) return `${tableLabel} · QR`;
  if (deliveryPlatform) return deliveryPlatform;
  // Website storefront orders have no delivery platform.
  return orderType === "delivery" ? "Online · Delivery" : "Online";
}

/**
 * A single online-order card.
 *
 * Wave 2.7 perf: takes only a stable `orderId` string + `variant`, then
 * subscribes to its own order via `useOrder(orderId)`. Combined with the
 * `React.memo` boundary below, one card's optimistic flip (or a sibling's)
 * never re-renders the others — only the card whose order actually changed
 * re-renders. Submit/error are LOCAL state, so they stay off the order object.
 */
const OnlineOrderCardImpl: React.FC<OnlineOrderCardProps> = ({
  orderId,
  variant,
}) => {
  const order = useOrder(orderId);
  const { acceptOrder, declineOrder } = useOnlineOrderActions();
  const [submitting, setSubmitting] = useState<null | "accept" | "decline">(
    null,
  );
  const [retryable, setRetryable] = useState(false);

  const onAccept = useCallback(async () => {
    setSubmitting("accept");
    setRetryable(false);
    const res = await acceptOrder(orderId);
    setSubmitting(null);
    // Only offer Retry for transient failures (offline / network). Terminal
    // outcomes (already declined/cancelled) reconcile the card away instead.
    setRetryable(!res.ok && (res.reason === "offline" || res.reason === "network"));
  }, [acceptOrder, orderId]);

  const onDecline = useCallback(async () => {
    setSubmitting("decline");
    setRetryable(false);
    const res = await declineOrder(orderId);
    setSubmitting(null);
    setRetryable(!res.ok && (res.reason === "offline" || res.reason === "network"));
  }, [declineOrder, orderId]);

  if (!order) return null;

  const itemCount = order.items?.reduce((n, i) => n + (i.quantity || 0), 0) ?? 0;
  const label = order.display_number || order.order_number || order.id;
  const total = order.total_amount ?? 0;

  return (
    <View className="bg-surface p-4 rounded-2xl border border-gray-600 w-full">
      {/* Header */}
      <View className="flex-row justify-between items-center">
        <Text className="text-sm text-gray-300">Items: {itemCount}</Text>
        <Text className="text-sm text-gray-300">
          {formatTime(order.opened_at)}
        </Text>
      </View>

      {/* Body */}
      <View className="flex-row items-center my-3">
        <View className="flex-1">
          <Text className="text-base font-bold text-white">#{label}</Text>
          <Text className="text-sm text-gray-300" numberOfLines={1}>
            {order.customer_name || "Guest"}
          </Text>
          <Text className="text-xs text-gray-400 mt-0.5" numberOfLines={1}>
            {sourceLabel(
              order.delivery_platform,
              order.order_type,
              order.service_location_name,
            )}
          </Text>
        </View>
        <Text className="text-2xl font-bold text-white">
          ${total.toFixed(2)}
        </Text>
      </View>

      <Link
        href={`/online-orders/${(order.db_order_id || order.id).replace("#", "")}` as Href}
        asChild
      >
        <TouchableOpacity>
          <Text className="font-bold text-blue-400">View Order Details</Text>
        </TouchableOpacity>
      </Link>

      {/* Footer */}
      {variant === "new" ? (
        <View className="mt-4">
          <View className="flex-row gap-2">
            <TouchableOpacity
              onPress={onDecline}
              disabled={submitting !== null}
              className="flex-1 py-2.5 border border-gray-500 rounded-xl items-center"
            >
              {submitting === "decline" ? (
                <ActivityIndicator color="#d1d5db" />
              ) : (
                <Text className="font-bold text-gray-300">Decline</Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              onPress={onAccept}
              disabled={submitting !== null}
              className="flex-1 py-2.5 bg-blue-500 rounded-xl items-center"
            >
              {submitting === "accept" ? (
                <ActivityIndicator color="white" />
              ) : (
                <Text className="font-bold text-white">Accept</Text>
              )}
            </TouchableOpacity>
          </View>
          {retryable && (
            <View className="mt-2 flex-row items-center justify-between">
              <Text className="text-xs text-red-400 flex-1">
                Server unreachable.
              </Text>
              <TouchableOpacity
                onPress={onAccept}
                className="px-3 py-1.5 rounded-lg bg-blue-600/20 border border-blue-500/40"
              >
                <Text className="text-blue-300 text-xs font-semibold">
                  Retry
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      ) : (
        <View className="mt-4">
          <View className="self-start px-3 py-1.5 rounded-lg bg-blue-900/30 border border-blue-500/30">
            <Text className="text-blue-300 text-xs font-semibold capitalize">
              {variant === "kitchen"
                ? "In kitchen"
                : variant === "ready"
                  ? "Ready"
                  : "Done"}
            </Text>
          </View>
        </View>
      )}
    </View>
  );
};

/**
 * Explicit memo boundary (mirrors KDSTicketCard). Props are primitive
 * (orderId + variant), so the default shallow compare is exactly the bail
 * condition we want: the card re-renders only when its own order changes
 * (via the internal useOrder subscription) or its column variant changes —
 * never because a sibling card or the parent list re-rendered.
 */
const OnlineOrderCard = React.memo(OnlineOrderCardImpl);
OnlineOrderCard.displayName = "OnlineOrderCard";

export default OnlineOrderCard;
