import CancelOnlineOrderDialog, {
  type CancelReasonCode,
} from "@/components/online-orders/CancelOnlineOrderDialog";
import MarkOrderReadyDialog from "@/components/online-orders/MarkOrderReadyDialog";
import DeliveryPlatformBadge from "@/components/order/DeliveryPlatformBadge";
import { useOnlineOrderActions } from "@/hooks/orders/useOnlineOrderActions";
import { resolveOrderLabel } from "@/lib/onlineOrderLabel";
import { colors } from "@/lib/theme";
import { useUiScale } from "@/lib/uiScale";
import { useOrder } from "@/stores/selectors/orderSelectors";
import { useOrderStore } from "@/stores/useOrderStore";
import { Href, Link } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Text, TouchableOpacity, View } from "react-native";

export type OnlineColumnVariant = "new" | "kitchen" | "ready" | "done";

interface OnlineOrderCardProps {
  /** Store key OR db_order_id — resolved via useOrder/getOrder. */
  orderId: string;
  variant: OnlineColumnVariant;
  /** Suppress the detail-screen link (KDS has no header/back for that route). */
  hideDetailsLink?: boolean;
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
  hideDetailsLink = false,
}) => {
  const uiScale = useUiScale();
  const s = (n: number) => Math.round(n * uiScale);
  const order = useOrder(orderId);
  const {
    acceptOrder,
    declineOrder,
    cancelOrder,
    markReadyOrder,
    markDoneOrder,
  } = useOnlineOrderActions();
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
  const label = resolveOrderLabel(order);
  // When a platform short code (e.g. "C424D") is the primary label, keep the
  // Dexa number visible as a small secondary reference so staff can look it up.
  const dexaNumber = order.display_number || order.order_number || null;
  const dexaLabel = dexaNumber
    ? dexaNumber.startsWith("#")
      ? dexaNumber
      : `#${dexaNumber}`
    : null;
  const showDexaSecondary = !!dexaLabel && dexaLabel !== label;
  const total = order.total_amount ?? 0;
  const canCancel = variant !== "done"; // New + In Kitchen + Ready
  // Mark-ready only for delivery-platform (OrderOut) orders in the kitchen lane —
  // QR dine-in has no external platform to notify.
  const canMarkReady = variant === "kitchen" && !!order.delivery_platform;
  // Mark-done pushes a stuck "Ready" order to the Done lane when the kitchen
  // never bumped it off the KDS. Available for any online order in the ready lane.
  const canMarkDone = variant === "ready";

  const retryRow = retryable ? (
    <View
      style={{
        marginTop: Math.round(8 * uiScale),
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
      }}
    >
      <Text style={{ fontSize: s(12), color: colors.danger, flex: 1 }}>
        Server unreachable.
      </Text>
      <TouchableOpacity
        onPress={onRetry}
        style={{
          paddingHorizontal: Math.round(12 * uiScale),
          paddingVertical: Math.round(6 * uiScale),
          borderRadius: Math.round(8 * uiScale),
          backgroundColor: colors.info + "20",
          borderWidth: 1,
          borderColor: colors.info + "40",
        }}
      >
        <Text
          style={{ fontSize: s(12), fontWeight: "600", color: colors.info }}
        >
          Retry
        </Text>
      </TouchableOpacity>
    </View>
  ) : null;

  return (
    <View
      style={{
        backgroundColor: colors.card,
        padding: s(16),
        borderRadius: s(16),
        borderWidth: 1,
        borderColor: colors.border,
        width: "100%",
      }}
    >
      {/* Header */}
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <Text style={{ fontSize: s(14), color: colors.label }}>
          Items: {itemCount}
        </Text>
        <Text style={{ fontSize: s(14), color: colors.label }}>
          {formatTime(order.opened_at)}
        </Text>
      </View>

      {/* Body */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          marginVertical: s(12),
        }}
      >
        <View style={{ flex: 1 }}>
          <Text
            style={{
              fontSize: s(16),
              fontWeight: "700",
              color: colors.heading,
            }}
            numberOfLines={1}
            ellipsizeMode="middle"
          >
            {label}
          </Text>
          {showDexaSecondary ? (
            <Text
              style={{ fontSize: s(11), color: colors.muted }}
              numberOfLines={1}
            >
              {dexaLabel}
            </Text>
          ) : null}
          <Text
            style={{ fontSize: s(14), color: colors.label }}
            numberOfLines={1}
          >
            {order.customer_name || "Guest"}
          </Text>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              marginTop: s(4),
              gap: s(6),
            }}
          >
            <DeliveryPlatformBadge
              deliveryPlatform={order.delivery_platform}
              orderSource={order.order_source}
              size="sm"
            />
            <Text
              style={{ fontSize: s(12), color: colors.muted, flexShrink: 1 }}
              numberOfLines={1}
            >
              {sourceLabel(
                order.delivery_platform,
                order.order_type,
                order.service_location_name,
              )}
            </Text>
          </View>
        </View>
        <Text
          style={{ fontSize: s(24), fontWeight: "700", color: colors.heading }}
        >
          ${total.toFixed(2)}
        </Text>
      </View>

      {/* Item preview — first 3 + overflow */}
      {shownItems.length > 0 && (
        <View style={{ marginBottom: s(12) }}>
          {shownItems.map((it) => (
            <Text
              key={it.id}
              style={{ fontSize: s(14), color: colors.label }}
              numberOfLines={1}
            >
              {it.quantity}× {it.open_item_name || it.name}
            </Text>
          ))}
          {remainingItems > 0 && (
            <Text
              style={{ fontSize: s(12), color: colors.muted, marginTop: s(2) }}
            >
              +{remainingItems} more
            </Text>
          )}
        </View>
      )}

      {!hideDetailsLink && (
        <Link
          href={
            `/online-orders/${(order.db_order_id || order.id).replace("#", "")}` as Href
          }
          asChild
        >
          <TouchableOpacity>
            <Text
              style={{ fontWeight: "700", color: colors.teal, fontSize: s(14) }}
            >
              View Order Details
            </Text>
          </TouchableOpacity>
        </Link>
      )}

      {/* Footer */}
      {variant === "new" ? (
        <View style={{ marginTop: s(16) }}>
          <View style={{ flexDirection: "row", gap: s(8) }}>
            <TouchableOpacity
              onPress={onDecline}
              disabled={submitting !== null}
              style={{
                flex: 1,
                paddingVertical: s(10),
                borderWidth: 1,
                borderColor: colors.border,
                borderRadius: s(12),
                alignItems: "center",
              }}
            >
              {submitting === "decline" ? (
                <ActivityIndicator color={colors.label} />
              ) : (
                <Text style={{ fontWeight: "700", color: colors.label }}>
                  Decline
                </Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              onPress={onAccept}
              disabled={submitting !== null}
              style={{
                flex: 1,
                paddingVertical: s(10),
                borderRadius: s(12),
                alignItems: "center",
                backgroundColor: colors.teal,
              }}
            >
              {submitting === "accept" ? (
                <ActivityIndicator color={colors.onSolid} />
              ) : (
                <Text style={{ fontWeight: "700", color: colors.onSolid }}>
                  Accept
                </Text>
              )}
            </TouchableOpacity>
          </View>
          {retryRow}
          <TouchableOpacity
            onPress={() => setShowCancel(true)}
            disabled={submitting !== null}
            style={{ marginTop: s(8), alignSelf: "center" }}
          >
            {submitting === "cancel" ? (
              <ActivityIndicator size="small" color={colors.danger} />
            ) : (
              <Text
                style={{
                  fontSize: s(12),
                  fontWeight: "600",
                  color: colors.danger,
                }}
              >
                Cancel Order
              </Text>
            )}
          </TouchableOpacity>
        </View>
      ) : (
        <View style={{ marginTop: s(16) }}>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <View
              style={{ flexDirection: "row", alignItems: "center", gap: s(8) }}
            >
              {canMarkReady && (
                <TouchableOpacity
                  onPress={() => setShowMarkReady(true)}
                  disabled={submitting !== null}
                  style={{
                    paddingHorizontal: s(12),
                    paddingVertical: s(6),
                    borderRadius: s(8),
                    backgroundColor: colors.teal,
                    opacity: submitting && submitting !== "ready" ? 0.5 : 1,
                  }}
                >
                  {submitting === "ready" ? (
                    <ActivityIndicator size="small" color={colors.onSolid} />
                  ) : (
                    <Text
                      style={{
                        fontSize: s(12),
                        fontWeight: "700",
                        color: colors.onSolid,
                      }}
                    >
                      Mark Ready
                    </Text>
                  )}
                </TouchableOpacity>
              )}
              {canMarkDone && (
                <TouchableOpacity
                  onPress={onMarkDone}
                  disabled={submitting !== null}
                  style={{
                    paddingHorizontal: s(12),
                    paddingVertical: s(6),
                    borderRadius: s(8),
                    backgroundColor: colors.success,
                    opacity: submitting && submitting !== "done" ? 0.5 : 1,
                  }}
                >
                  {submitting === "done" ? (
                    <ActivityIndicator size="small" color={colors.onSolid} />
                  ) : (
                    <Text
                      style={{
                        fontSize: s(12),
                        fontWeight: "700",
                        color: colors.onSolid,
                      }}
                    >
                      Mark Done
                    </Text>
                  )}
                </TouchableOpacity>
              )}
              {canCancel && (
                <TouchableOpacity
                  onPress={() => setShowCancel(true)}
                  disabled={submitting !== null}
                  style={{
                    paddingHorizontal: s(12),
                    paddingVertical: s(6),
                    borderRadius: s(8),
                    backgroundColor: colors.danger,
                    opacity: submitting && submitting !== "cancel" ? 0.5 : 1,
                  }}
                >
                  {submitting === "cancel" ? (
                    <ActivityIndicator size="small" color={colors.onSolid} />
                  ) : (
                    <Text
                      style={{
                        fontSize: s(12),
                        fontWeight: "700",
                        color: colors.onSolid,
                      }}
                    >
                      Cancel Order
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
