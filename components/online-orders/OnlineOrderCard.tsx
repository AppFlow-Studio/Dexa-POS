import CancelOnlineOrderDialog, {
  type CancelReasonCode,
} from "@/components/online-orders/CancelOnlineOrderDialog";
import MarkOrderReadyDialog from "@/components/online-orders/MarkOrderReadyDialog";
import DeliveryPlatformBadge from "@/components/order/DeliveryPlatformBadge";
import { useOnlineOrderActions } from "@/hooks/orders/useOnlineOrderActions";
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

// Matches a UUID anywhere in the string — table labels sourced from bad
// upstream data can be a bare UUID or carry one embedded ("Table <uuid>").
const UUID_RE =
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

function sourceLabel(
  deliveryPlatform: string | null | undefined,
  orderType: string | null | undefined,
  tableLabel: string | null | undefined,
): string {
  // QR dine-in orders carry the table label (website sets table_number =
  // table_label → transformed to service_location_name). order_type can't tell
  // them apart — it collapses to 'takeout' — so key on the label's presence.
  // Guard against an unlabeled floor-plan table whose "name" is a raw UUID
  // (bad upstream data) — never surface that to staff.
  const cleanTableLabel =
    tableLabel && !UUID_RE.test(tableLabel.trim()) ? tableLabel : null;
  if (cleanTableLabel) return `Table ${cleanTableLabel} · QR`;
  if (tableLabel) return "Table · QR";
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
  // Delivery-platform orders show the marketplace's own order number — that's
  // what the driver/customer reference. Dexa numbers only for first-party
  // orders. Never surface a raw UUID — that's an internal key, not a
  // human-facing reference; if no real number exists yet, show nothing.
  const clean = (v?: string | null) =>
    v && !UUID_RE.test(v) ? v : null;
  const dexaNumber = clean(order.display_number) || clean(order.order_number);
  const platformNumber = clean(order.platform_order_number);
  const label = platformNumber
    ? platformNumber
    : dexaNumber
      ? dexaNumber.startsWith("#")
        ? dexaNumber
        : `#${dexaNumber}`
      : null;
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

  const variantAccent =
    variant === "kitchen"
      ? "#ef4444"
      : variant === "ready"
        ? colors.success
        : colors.teal;

  return (
    <View
      style={{
        backgroundColor: colors.card,
        padding: s(16),
        borderRadius: s(18),
        borderWidth: 1,
        borderColor: colors.border,
        borderLeftWidth: s(3),
        borderLeftColor: variantAccent,
        width: "100%",
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06,
        shadowRadius: 8,
        elevation: 2,
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
        <View
          style={{
            paddingHorizontal: s(8),
            paddingVertical: s(3),
            borderRadius: s(7),
            backgroundColor: colors.screen,
          }}
        >
          <Text
            style={{ fontSize: s(12), fontWeight: "600", color: colors.label }}
          >
            {itemCount} item{itemCount === 1 ? "" : "s"}
          </Text>
        </View>
        <Text style={{ fontSize: s(12), color: colors.muted }}>
          {formatTime(order.opened_at)}
        </Text>
      </View>

      {/* Body */}
      <View style={{ marginVertical: s(12) }}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "flex-start",
            justifyContent: "space-between",
          }}
        >
          <Text
            style={{
              fontSize: s(18),
              fontWeight: "700",
              color: colors.heading,
              flex: 1,
              marginRight: s(8),
            }}
            numberOfLines={1}
          >
            {order.customer_name || "Guest"}
          </Text>
          <Text
            style={{ fontSize: s(20), fontWeight: "700", color: colors.heading }}
          >
            ${total.toFixed(2)}
          </Text>
        </View>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            marginTop: s(6),
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
          {label ? (
            <>
              <Text style={{ fontSize: s(12), color: colors.muted }}>·</Text>
              <Text
                style={{
                  fontSize: s(12),
                  color: colors.muted,
                  fontWeight: "600",
                }}
                numberOfLines={1}
                ellipsizeMode="middle"
              >
                {label}
              </Text>
            </>
          ) : null}
        </View>
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
              activeOpacity={0.7}
              style={{
                flex: 1,
                paddingVertical: s(12),
                borderWidth: 1,
                borderColor: colors.border,
                borderRadius: s(14),
                alignItems: "center",
                backgroundColor: colors.screen,
              }}
            >
              {submitting === "decline" ? (
                <ActivityIndicator color={colors.label} />
              ) : (
                <Text
                  style={{
                    fontWeight: "700",
                    color: colors.label,
                    fontSize: s(14),
                  }}
                >
                  Decline
                </Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              onPress={onAccept}
              disabled={submitting !== null}
              activeOpacity={0.85}
              style={{
                flex: 1.4,
                paddingVertical: s(12),
                borderRadius: s(14),
                alignItems: "center",
                backgroundColor: colors.teal,
                shadowColor: colors.teal,
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.3,
                shadowRadius: 6,
                elevation: 3,
              }}
            >
              {submitting === "accept" ? (
                <ActivityIndicator color={colors.onSolid} />
              ) : (
                <Text
                  style={{
                    fontWeight: "700",
                    color: colors.onSolid,
                    fontSize: s(14),
                  }}
                >
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
                Cancel order
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
                    borderWidth: 1,
                    backgroundColor: colors.teal + "14",
                    borderColor: colors.teal + "40",
                  }}
                >
                  {submitting === "ready" ? (
                    <ActivityIndicator size="small" color={colors.teal} />
                  ) : (
                    <Text
                      style={{
                        fontSize: s(12),
                        fontWeight: "600",
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
                  disabled={submitting !== null}
                  style={{
                    paddingHorizontal: s(12),
                    paddingVertical: s(6),
                    borderRadius: s(8),
                    borderWidth: 1,
                    backgroundColor: colors.success + "14",
                    borderColor: colors.success + "40",
                  }}
                >
                  {submitting === "done" ? (
                    <ActivityIndicator size="small" color={colors.success} />
                  ) : (
                    <Text
                      style={{
                        fontSize: s(12),
                        fontWeight: "600",
                        color: colors.success,
                      }}
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
                  style={{
                    paddingHorizontal: s(12),
                    paddingVertical: s(6),
                    borderRadius: s(8),
                    borderWidth: 1,
                    backgroundColor: colors.danger + "14",
                    borderColor: colors.danger + "40",
                  }}
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
        orderLabel={label ?? (order.customer_name || "Guest")}
        platformLabel={order.delivery_platform}
        onConfirm={onCancelConfirm}
        onCancel={() => setShowCancel(false)}
      />

      <MarkOrderReadyDialog
        isOpen={showMarkReady}
        orderLabel={label ?? (order.customer_name || "Guest")}
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
