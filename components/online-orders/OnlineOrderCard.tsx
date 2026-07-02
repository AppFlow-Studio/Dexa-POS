import CancelOnlineOrderDialog, {
  type CancelReasonCode,
} from "@/components/online-orders/CancelOnlineOrderDialog";
import MarkOrderReadyDialog from "@/components/online-orders/MarkOrderReadyDialog";
import DeliveryPlatformBadge from "@/components/order/DeliveryPlatformBadge";
import { useOnlineOrderActions } from "@/hooks/orders/useOnlineOrderActions";
import { colors } from "@/lib/theme";
import { useOrder } from "@/stores/selectors/orderSelectors";
import { useOrderStore } from "@/stores/useOrderStore";
import { Href, Link } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
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
  const { acceptOrder, declineOrder, cancelOrder, markReadyOrder, markDoneOrder } =
    useOnlineOrderActions();
  const [submitting, setSubmitting] = useState<
    null | "accept" | "decline" | "cancel" | "ready" | "done"
  >(null);
  const [retryable, setRetryable] = useState(false);
  const [showCancel, setShowCancel] = useState(false);
  const [showMarkReady, setShowMarkReady] = useState(false);

  // Realtime-only cards arrive header-only (items: []) until a get_order_details
  // fetch. Lazy-load once so the preview populates; the store's cooldown /
  // in-flight guard dedupes fetches across the whole column.
  const dbOrderId = order?.db_order_id;
  const itemsLoaded = (order?.items?.length ?? 0) > 0;
  useEffect(() => {
    if (dbOrderId && !itemsLoaded) {
      useOrderStore.getState().syncOrderFromBackendComplete(orderId);
    }
  }, [orderId, dbOrderId, itemsLoaded]);

  // Remembers the last attempt so the Retry chip repeats the right action.
  const lastAttempt = useRef<
    | null
    | { kind: "accept" | "decline" | "ready" | "done" }
    | { kind: "cancel"; reason: CancelReasonCode; details?: string }
  >(null);

  const isTransient = (reason?: string) =>
    reason === "offline" || reason === "network";

  const onAccept = useCallback(async () => {
    lastAttempt.current = { kind: "accept" };
    setSubmitting("accept");
    setRetryable(false);
    const res = await acceptOrder(orderId);
    setSubmitting(null);
    // Only offer Retry for transient failures (offline / network). Terminal
    // outcomes (already declined/cancelled) reconcile the card away instead.
    setRetryable(!res.ok && isTransient(res.reason));
  }, [acceptOrder, orderId]);

  const onDecline = useCallback(async () => {
    lastAttempt.current = { kind: "decline" };
    setSubmitting("decline");
    setRetryable(false);
    const res = await declineOrder(orderId);
    setSubmitting(null);
    setRetryable(!res.ok && isTransient(res.reason));
  }, [declineOrder, orderId]);

  const onCancelConfirm = useCallback(
    async (reason: CancelReasonCode, details?: string) => {
      lastAttempt.current = { kind: "cancel", reason, details };
      setShowCancel(false);
      setSubmitting("cancel");
      setRetryable(false);
      const res = await cancelOrder(orderId, reason, details);
      setSubmitting(null);
      setRetryable(!res.ok && isTransient(res.reason));
    },
    [cancelOrder, orderId],
  );

  const onMarkReadyConfirm = useCallback(async () => {
    lastAttempt.current = { kind: "ready" };
    setShowMarkReady(false);
    setSubmitting("ready");
    setRetryable(false);
    const res = await markReadyOrder(orderId);
    setSubmitting(null);
    setRetryable(!res.ok && isTransient(res.reason));
  }, [markReadyOrder, orderId]);

  const onMarkDone = useCallback(async () => {
    lastAttempt.current = { kind: "done" };
    setSubmitting("done");
    setRetryable(false);
    const res = await markDoneOrder(orderId);
    setSubmitting(null);
    setRetryable(!res.ok && isTransient(res.reason));
  }, [markDoneOrder, orderId]);

  const onRetry = useCallback(() => {
    const a = lastAttempt.current;
    if (!a) return;
    if (a.kind === "cancel") onCancelConfirm(a.reason, a.details);
    else if (a.kind === "accept") onAccept();
    else if (a.kind === "ready") onMarkReadyConfirm();
    else if (a.kind === "done") onMarkDone();
    else onDecline();
  }, [onAccept, onDecline, onCancelConfirm, onMarkReadyConfirm, onMarkDone]);

  if (!order) return null;

  const previewItems = (order.items ?? []).filter((i) => !i.is_voided);
  const shownItems = previewItems.slice(0, 3);
  const remainingItems = previewItems.length - shownItems.length;
  const itemCount = itemsLoaded
    ? order.items!.reduce((n, i) => n + (i.quantity || 0), 0)
    : (order._broadcastItemCount ?? 0);
  const label = order.display_number || order.order_number || order.id;
  const total = order.total_amount ?? 0;
  const canCancel = variant !== "done"; // New + In Kitchen + Ready
  // Mark-ready only for delivery-platform (OrderOut) orders in the kitchen lane —
  // QR dine-in has no external platform to notify.
  const canMarkReady = variant === "kitchen" && !!order.delivery_platform;
  // Mark-done pushes a stuck "Ready" order to the Done lane when the kitchen
  // never bumped it off the KDS. Available for any online order in the ready lane.
  const canMarkDone = variant === "ready";

  const retryRow = retryable ? (
    <View className="mt-2 flex-row items-center justify-between">
      <Text className="text-xs text-red-400 flex-1">Server unreachable.</Text>
      <TouchableOpacity
        onPress={onRetry}
        className="px-3 py-1.5 rounded-lg bg-blue-600/20 border border-blue-500/40"
      >
        <Text className="text-blue-300 text-xs font-semibold">Retry</Text>
      </TouchableOpacity>
    </View>
  ) : null;

  return (
    <View className="bg-surface p-4 rounded-2xl border border-border w-full">
      {/* Header */}
      <View className="flex-row justify-between items-center">
        <Text className="text-sm text-label">Items: {itemCount}</Text>
        <Text className="text-sm text-label">
          {formatTime(order.opened_at)}
        </Text>
      </View>

      {/* Body */}
      <View className="flex-row items-center my-3">
        <View className="flex-1">
          <Text className="text-base font-bold text-heading">#{label}</Text>
          <Text className="text-sm text-label" numberOfLines={1}>
            {order.customer_name || "Guest"}
          </Text>
          <View className="flex-row items-center mt-1 gap-1.5">
            <DeliveryPlatformBadge
              deliveryPlatform={order.delivery_platform}
              orderSource={order.order_source}
              size="sm"
            />
            <Text className="text-xs text-hint flex-shrink" numberOfLines={1}>
              {sourceLabel(
                order.delivery_platform,
                order.order_type,
                order.service_location_name,
              )}
            </Text>
          </View>
        </View>
        <Text className="text-2xl font-bold text-heading">
          ${total.toFixed(2)}
        </Text>
      </View>

      {/* Item preview — first 3 + overflow */}
      {shownItems.length > 0 && (
        <View className="mb-3">
          {shownItems.map((it) => (
            <Text
              key={it.id}
              className="text-sm text-label"
              numberOfLines={1}
            >
              {it.quantity}× {it.open_item_name || it.name}
            </Text>
          ))}
          {remainingItems > 0 && (
            <Text className="text-xs text-hint mt-0.5">
              +{remainingItems} more
            </Text>
          )}
        </View>
      )}

      <Link
        href={`/online-orders/${(order.db_order_id || order.id).replace("#", "")}` as Href}
        asChild
      >
        <TouchableOpacity>
          <Text className="font-bold text-teal">View Order Details</Text>
        </TouchableOpacity>
      </Link>

      {/* Footer */}
      {variant === "new" ? (
        <View className="mt-4">
          <View className="flex-row gap-2">
            <TouchableOpacity
              onPress={onDecline}
              disabled={submitting !== null}
              className="flex-1 py-2.5 border border-border rounded-xl items-center"
            >
              {submitting === "decline" ? (
                <ActivityIndicator color={colors.label} />
              ) : (
                <Text className="font-bold text-label">Decline</Text>
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
          {retryRow}
          <TouchableOpacity
            onPress={() => setShowCancel(true)}
            disabled={submitting !== null}
            className="mt-2 self-center"
          >
            {submitting === "cancel" ? (
              <ActivityIndicator size="small" color={colors.danger} />
            ) : (
              <Text
                className="text-xs font-semibold"
                style={{ color: colors.danger }}
              >
                Cancel order
              </Text>
            )}
          </TouchableOpacity>
        </View>
      ) : (
        <View className="mt-4">
          <View className="flex-row items-center justify-between">
            
            <View className="flex-row items-center gap-2">
              {canMarkReady && (
                <TouchableOpacity
                  onPress={() => setShowMarkReady(true)}
                  disabled={submitting !== null}
                  className="px-3 py-1.5 rounded-lg border"
                  style={{
                    backgroundColor: colors.teal + "14",
                    borderColor: colors.teal + "40",
                  }}
                >
                  {submitting === "ready" ? (
                    <ActivityIndicator size="small" color={colors.teal} />
                  ) : (
                    <Text
                      className="text-xs font-semibold"
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
                  disabled={submitting !== null}
                  className="px-3 py-1.5 rounded-lg border"
                  style={{
                    backgroundColor: colors.success + "14",
                    borderColor: colors.success + "40",
                  }}
                >
                  {submitting === "done" ? (
                    <ActivityIndicator size="small" color={colors.success} />
                  ) : (
                    <Text
                      className="text-xs font-semibold"
                      style={{ color: colors.success }}
                    >
                      Mark done
                    </Text>
                  )}
                </TouchableOpacity>
              )}
              {canCancel && (
                <TouchableOpacity
                  onPress={() => setShowCancel(true)}
                  disabled={submitting !== null}
                  className="px-3 py-1.5 rounded-lg border"
                  style={{
                    backgroundColor: colors.danger + "14",
                    borderColor: colors.danger + "40",
                  }}
                >
                  {submitting === "cancel" ? (
                    <ActivityIndicator size="small" color={colors.danger} />
                  ) : (
                    <Text
                      className="text-xs font-semibold"
                      style={{ color: colors.danger }}
                    >
                      Cancel order
                    </Text>
                  )}
                </TouchableOpacity>
              )}
            </View>
          </View>
          {retryRow}
        </View>
      )}

      <CancelOnlineOrderDialog
        isOpen={showCancel}
        orderLabel={String(label)}
        platformLabel={order.delivery_platform}
        onConfirm={onCancelConfirm}
        onCancel={() => setShowCancel(false)}
      />

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
