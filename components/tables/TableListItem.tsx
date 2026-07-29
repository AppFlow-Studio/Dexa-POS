import ReceiptModal from "@/components/receipts/ReceiptModal";
import { useToast } from "@/contexts/ToastContext";
import { useTableDuration } from "@/hooks/useTableDuration";
import {
    getReadOnlyTableAccess,
    isOrderReadOnly,
} from "@/lib/orderAccessControl";
import { iosOnly } from "@/lib/safeAnimations";
import { colors } from "@/lib/theme";
import { OrderProfile } from "@/lib/types";
import { useUiScale } from "@/lib/uiScale";
import {
    useOrderByAnyId,
    useOrderTotals,
} from "@/stores/selectors/orderSelectors";
import { useCoursingStore } from "@/stores/useCoursingStore";
import { useEmployeeStore } from "@/stores/useEmployeeStore";
import { useFloorPlanStore } from "@/stores/useFloorPlanStore";
import { useOrderStore } from "@/stores/useOrderStore";
import { useReservationStore } from "@/stores/useReservationStore";
import { useStoreSettingsStore } from "@/stores/useStoreSettingsStore";
import { useTableSessionStore } from "@/stores/useTableSessionStore";
import { FloorPlanObject } from "@/types/db-floor-plan-types";
import {
    BrushCleaning,
    CheckCircle,
    ChevronDown,
    ChevronUp,
    Clock,
    Pencil,
    Send,
} from "lucide-react-native";
import React, { useMemo, useState } from "react";
import { Text, TouchableOpacity, View } from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import { useShallow } from "zustand/react/shallow";
import ConfirmationModal from "../settings/reset-application/ConfirmationModal";
import { type PaymentStatus } from "./PaymentStatusBadge";

// Stable empty-map sentinel so the coursing selector below returns shallow-equal
// references across renders when an order has no coursing data. Using a fresh
// `{}` literal in the selector defeats `useShallow` and causes an infinite
// getSnapshot loop on the Tables panel.
const EMPTY_ITEM_COURSE_MAP: Readonly<Record<string, number>> = Object.freeze(
  {},
);

// --- Helper Functions ---
const formatDuration = (milliseconds: number): string => {
  if (isNaN(milliseconds) || milliseconds < 0) return "0m";
  const totalMinutes = Math.floor(milliseconds / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours > 0) {
    return `${hours}hr ${minutes}m`;
  }
  return `${minutes}m`;
};

const getStatusAccentColor = (status: string, isOvertime: boolean): string => {
  if (isOvertime) return colors.tableOvertime;
  switch (status.toLowerCase()) {
    case "available":
      return colors.tableAvailable;
    case "seated":
      return colors.tableSeated;
    case "ordered":
      return colors.tableOrdered;
    case "served":
      return colors.tableServed;
    case "check_presented":
      return colors.tableCheckPresented;
    case "paid":
      return colors.tablePaid;
    case "cleaning":
      return colors.tableCleaning;
    case "blocked":
    case "not_in_service":
      return colors.tableNotInService;
    default:
      return colors.tableInUse;
  }
};

const useScale = () => {
  const uiScale = useUiScale();
  const s = (n: number) => Math.round(n * uiScale);
  return { uiScale, s };
};

const QuickActionButton: React.FC<{
  onPress: () => void;
  label: string;
  variant?: "primary" | "secondary" | "destructive";
  disabled?: boolean;
}> = ({ onPress, label, variant = "secondary", disabled = false }) => {
  const { s } = useScale();
  const bg =
    variant === "primary"
      ? colors.teal + "20"
      : variant === "destructive"
        ? colors.danger + "15"
        : colors.card;
  const border =
    variant === "primary"
      ? colors.teal + "50"
      : variant === "destructive"
        ? colors.danger + "30"
        : colors.border;
  const textColor =
    variant === "primary"
      ? colors.teal
      : variant === "destructive"
        ? colors.danger
        : colors.label;

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      style={{
        paddingHorizontal: s(8),
        paddingVertical: s(5),
        borderRadius: s(7),
        flexDirection: "row",
        alignItems: "center",
        gap: s(4),
        backgroundColor: bg,
        borderWidth: 1,
        borderColor: border,
        opacity: disabled ? 0.5 : 1,
      }}
    >
      {label.startsWith("Send") && <Send size={s(11)} color={textColor} />}
      {label === "Open Order" && <Pencil size={s(11)} color={textColor} />}
      <Text style={{ fontSize: s(11), fontWeight: "600", color: textColor }}>
        {label}
      </Text>
    </TouchableOpacity>
  );
};

const useTableData = (table: FloorPlanObject) => {
  const tablesById = useFloorPlanStore((s) => s.tablesById);
  const liveSession = useTableSessionStore((s) => s.sessions[table.id]);
  const getEmployeeByStaffId = useEmployeeStore((s) => s.getEmployeeByStaffId);
  const session = liveSession ?? table.session;

  // Get session order ID for payment calculations — reactive via useOrderByAnyId
  const sessionOrderId = session?.order_id || null;
  const resolvedOrder = useOrderByAnyId(sessionOrderId);
  const orderIdForPayments = resolvedOrder?.id || null;

  // Get payment-aware totals for this order
  const orderTotals = useOrderTotals(orderIdForPayments);

  // table.session?.merged_tables -> array of strings (IDs)

  return useMemo(() => {
    const status = session?.status || "available";
    const normalizedStatus = status.toLowerCase();

    // If table is not in use (conceptually), don't fetch order data.
    // 'available', 'reserved', 'blocked', 'not_in_service' -> not active order
    if (
      normalizedStatus === "available" ||
      normalizedStatus === "reserved" ||
      normalizedStatus === "blocked" ||
      normalizedStatus === "not_in_service"
    ) {
      return {
        isMerged: false,
        primaryTableId: table.id,
        displayName: table.name,
        status: status,
        guestCount: 0,
        subtotal: 0,
        tax: 0,
        total: 0,
        amountDue: 0,
        amountPaid: 0,
        paidStatus: "Unpaid" as PaymentStatus,
        seatedTime: null,
        server: "N/A",
        orders: [],
      };
    }

    // Check for merged tables
    const mergedIds = (session?.merged_tables || []).filter(
      (id) => id && id !== table.id && !!tablesById[id],
    );
    const isMerged = mergedIds.length > 0;

    // For merged tables, they all share the same session_id and order_id
    // So we just need to check the current table's session
    const sessionOrderId = session?.order_id;

    // If no session or no order_id, return empty orders (seated but not ordered yet)
    if (!session || !sessionOrderId) {
      return {
        isMerged: false,
        primaryTableId: table.id,
        displayName: table.name,
        status: status,
        guestCount: session?.party_size || 0,
        subtotal: 0,
        tax: 0,
        total: 0,
        amountDue: 0,
        amountPaid: 0,
        paidStatus: "Unpaid" as PaymentStatus,
        seatedTime: session?.seated_at ? new Date(session.seated_at) : null,
        server: "N/A",
        orders: [],
      };
    }

    // Reactive lookup via useOrderByAnyId (checks ordersById + dbOrderIdIndex)
    let order: OrderProfile | undefined = resolvedOrder ?? undefined;

    // Get merged table names for display — O(1) per lookup via tablesById
    const uniqueGroupIds = Array.from(new Set([table.id, ...mergedIds]));
    const groupTables = uniqueGroupIds
      .map((id) => tablesById[id])
      .filter(Boolean);

    // If order not found in store or is voided, return empty (might need backend fetch)
    if (!order || order.order_status === "void") {
      return {
        isMerged: isMerged,
        primaryTableId: table.id,
        displayName: isMerged
          ? `${table.name} + ${groupTables
              .filter((t) => t.id !== table.id)
              .map((t) => t.name)
              .join(", ")}`
          : table.name,
        status: status,
        guestCount: table.session?.party_size || 0,
        subtotal: 0,
        tax: 0,
        total: 0,
        amountDue: 0,
        amountPaid: 0,
        paidStatus: "Unpaid" as PaymentStatus,
        seatedTime: session?.seated_at ? new Date(session.seated_at) : null,
        server: "N/A",
        orders: [],
      };
    }

    // Found order - merged tables share the same order, so return single order in array
    const groupOrders = [order];

    // console.log(`[TableListItem] groupOrders ${table.name}`, groupOrders.length);

    // Calculate display values from the single order
    const seatedTime = order.opened_at ? new Date(order.opened_at) : null;
    const serverFromSession = session?.server_staff_id
      ? getEmployeeByStaffId(session.server_staff_id)?.fullName
      : null;
    const serverDisplay = serverFromSession || order.server_name || "N/A";

    // Use payment-aware totals from orderTotals selector
    // Falls back to simple calculation if selector not available
    const subtotal =
      orderTotals?.subtotal ??
      order.items.reduce((sum, item) => sum + item.price * item.quantity, 0);
    const tax =
      orderTotals?.tax ??
      order.items.reduce((sum, item) => sum + (item.taxAmount || 0), 0);
    const total = orderTotals?.total ?? order.total_amount ?? subtotal + tax;

    // Payment information (Phase 3: Fine Dining Table Management)
    const amountDue = orderTotals?.amountDue ?? total;
    const amountPaid = order.amount_paid ?? 0;

    // Determine payment status
    let paidStatus: PaymentStatus = "Unpaid";
    if (amountPaid >= total && total > 0) {
      paidStatus = "Paid";
    } else if (amountPaid > 0) {
      paidStatus = "Partial";
    } else if (order.payments?.some((p) => p.sync_status === "pending")) {
      paidStatus = "Pending";
    }

    return {
      isMerged: isMerged,
      primaryTableId: table.id,
      displayName: isMerged
        ? `${table.name} + ${groupTables
            .filter((t) => t.id !== table.id)
            .map((t) => t.name)
            .join(", ")}`
        : table.name,
      status: status,
      guestCount: order.guest_count || session?.party_size || 0,
      subtotal,
      tax,
      total,
      amountDue,
      amountPaid,
      paidStatus,
      seatedTime:
        seatedTime || (session?.seated_at ? new Date(session.seated_at) : null),
      server: serverDisplay,
      orders: groupOrders,
    };
  }, [
    table,
    session,
    resolvedOrder,
    tablesById,
    orderTotals,
    getEmployeeByStaffId,
  ]);
};

const ExpandedView: React.FC<{
  tableData: NonNullable<ReturnType<typeof useTableData>>;
  onNavigateToOrder: () => void;
  onToggleExpand: () => void;
  table: FloorPlanObject;
}> = ({ tableData, onNavigateToOrder, onToggleExpand, table }) => {
  const { s } = useScale();
  const updateSessionStatus = useTableSessionStore(
    (s) => s.updateSessionStatus,
  );
  const dispatchAction = useTableSessionStore((s) => s.dispatchAction);
  const deleteOrder = useOrderStore((s) => s.deleteOrder);
  const currentStationId = useOrderStore((s) => s.currentStationId);
  const getOrder = useOrderStore((s) => s.getOrder);
  const getOrderByDbId = useOrderStore((s) => s.getOrderByDbId);
  const orderIds = tableData.orders.map((o) => o.id);
  const itemCourseMapByOrderId = useCoursingStore(
    useShallow((s) => {
      const out: Record<string, Record<string, number>> = {};
      for (const id of orderIds) {
        out[id] = s.byOrderId[id]?.itemCourseMap ?? EMPTY_ITEM_COURSE_MAP;
      }
      return out;
    }),
  );
  const { show } = useToast();
  const [isVoidConfirmOpen, setVoidConfirmOpen] = useState(false);
  const [isReceiptOpen, setReceiptOpen] = useState(false);
  const selectedStore = useStoreSettingsStore((s) => s.selectedStore);
  const foreignOwnedOrder = useMemo(() => {
    const directMatch =
      tableData.orders.find((order) =>
        isOrderReadOnly(order, currentStationId),
      ) ?? null;
    if (directMatch) return directMatch;

    const liveSessions = useTableSessionStore.getState().sessions;
    const tablesById = useFloorPlanStore.getState().tablesById;
    const readOnlyAccess = getReadOnlyTableAccess({
      tableId: tableData.primaryTableId,
      currentStationId,
      getSession: (id) => liveSessions[id] ?? tablesById[id]?.session,
      getOrder: (orderId) =>
        getOrder(orderId) ?? getOrderByDbId(orderId) ?? null,
    });

    if (!readOnlyAccess) return null;

    return (
      getOrder(readOnlyAccess.orderId) ??
      getOrderByDbId(readOnlyAccess.orderId) ?? {
        station_name: readOnlyAccess.ownerStationName,
      }
    );
  }, [
    currentStationId,
    getOrder,
    getOrderByDbId,
    tableData.orders,
    tableData.primaryTableId,
  ]);
  const isForeignStationSession = !!foreignOwnedOrder;
  const foreignStationLabel =
    foreignOwnedOrder?.station_name?.trim() || "another station";

  const groupedItems = useMemo(() => {
    const groups: Record<
      number,
      { orderId: string; items: (typeof tableData.orders)[0]["items"] }
    > = {};
    tableData.orders.forEach((order) => {
      const itemCourseMap = itemCourseMapByOrderId[order.id] || {};

      order.items.forEach((item) => {
        const courseNumber = itemCourseMap[item.id] ?? item.courseNumber ?? 1;
        if (!groups[courseNumber])
          groups[courseNumber] = { orderId: order.id, items: [] };
        groups[courseNumber].items.push(item);
      });
    });
    return groups;
  }, [tableData.orders, itemCourseMapByOrderId]);

  const handleCloseTable = async () => {
    if (!tableData) return;

    if (isForeignStationSession) {
      show({
        title: "Action Restricted",
        message: `This table session is owned by ${foreignStationLabel}. Switch to that station to close it.`,
        type: "error",
      });
      return;
    }

    if (!table.session?.id) {
      show({
        title: "Error",
        message: "No active session found.",
        type: "error",
      });
      return;
    }
    const sessionId = table.session.id;

    // Resolve the session's actual underlying order. `tableData.orders` is the
    // RESOLVED-order view and can be empty even when the session references a
    // real order that just wasn't resolved this moment, so fall back to the
    // session's order_id.
    const liveOrderId =
      useTableSessionStore.getState().getSession(table.id)?.order_id ??
      table.session?.order_id ??
      null;
    const underlyingOrder = liveOrderId
      ? (getOrder(liveOrderId) ?? getOrderByDbId(liveOrderId) ?? null)
      : null;

    // No real order on the table → nothing to void; just free the table.
    const hasAnyOrder =
      tableData.orders.length > 0 ||
      !!underlyingOrder?.items.length ||
      (underlyingOrder?._broadcastItemCount ?? 0) > 0;

    if (!hasAnyOrder) {
      if (underlyingOrder) deleteOrder(underlyingOrder.id);
      await updateSessionStatus(sessionId, "available");
      onToggleExpand();
      return;
    }

    // There is an order → confirm, then VOID it through the backend. This is the
    // single behaviour now: "Void" always voids (restores inventory, marks the
    // order voided so it can't reappear), regardless of paid/unpaid.
    setVoidConfirmOpen(true);
  };

  const onConfirmVoid = async () => {
    if (!tableData || !table.session?.id) return;

    // Prefer the resolved order group; fall back to the session's underlying
    // order when the resolved view is empty (lookup-timing gap) so Void still
    // acts on the real order.
    let ordersToVoid = tableData.orders;
    if (ordersToVoid.length === 0) {
      const liveOrderId =
        useTableSessionStore.getState().getSession(table.id)?.order_id ??
        table.session?.order_id ??
        null;
      const underlyingOrder = liveOrderId
        ? (getOrder(liveOrderId) ?? getOrderByDbId(liveOrderId) ?? null)
        : null;
      if (underlyingOrder) ordersToVoid = [underlyingOrder];
    }

    // Use dispatch for VOID_ORDER — includes inventory deduction (fixes bug)
    for (const order of ordersToVoid) {
      await dispatchAction({
        type: "VOID_ORDER",
        tableId: table.id,
        orderId: order.id,
        dbOrderId: order.db_order_id,
      });
    }
    if (table.session?.id) {
      await useReservationStore
        .getState()
        .completeReservationForSession(table.session.id);
    }
    setVoidConfirmOpen(false);
    onToggleExpand();
  };

  const hasItems = Object.keys(groupedItems).length > 0;

  return (
    <Animated.View
      entering={iosOnly(FadeIn.duration(200))}
      exiting={iosOnly(FadeOut.duration(100))}
      style={{
        marginTop: s(6),
        borderTopWidth: 1,
        borderTopColor: colors.border + "30",
        paddingTop: s(10),
        paddingHorizontal: s(2),
        paddingBottom: s(4),
        overflow: "visible",
      }}
    >
      {/* Seated time */}
      {tableData.seatedTime && (
        <Text
          style={{
            fontSize: s(10),
            color: colors.muted,
            marginBottom: s(8),
            letterSpacing: 0.4,
          }}
        >
          SEATED AT{" "}
          {tableData.seatedTime.toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </Text>
      )}

      {/* Items by course */}
      {hasItems && (
        <View style={{ marginBottom: s(10) }}>
          {Object.entries(groupedItems)
            .sort(([a], [b]) => Number(a) - Number(b))
            .map(([courseNumber, { items }]) => (
              <View key={courseNumber} style={{ marginBottom: s(8) }}>
                <Text
                  style={{
                    fontSize: s(10),
                    fontWeight: "600",
                    color: colors.muted,
                    textTransform: "uppercase",
                    letterSpacing: 0.8,
                    marginBottom: s(5),
                  }}
                >
                  Course {courseNumber}
                </Text>
                {items.map((item) => (
                  <View
                    key={item.id}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "space-between",
                      paddingVertical: s(3),
                      paddingHorizontal: s(8),
                      borderRadius: s(5),
                      backgroundColor: colors.card,
                      marginBottom: s(2),
                    }}
                  >
                    <Text
                      style={{ fontSize: s(12), color: colors.label, flex: 1 }}
                    >
                      <Text
                        style={{ fontWeight: "600", color: colors.heading }}
                      >
                        {item.quantity}x
                      </Text>{" "}
                      {item.name}
                    </Text>
                    <View style={{ marginLeft: s(8) }}>
                      {(item.item_status === "Ready" ||
                        item.item_status === "Served") && (
                        <CheckCircle size={s(13)} color={colors.success} />
                      )}
                      {(item.kitchen_status === "sent" ||
                        item.item_status === "Preparing") && (
                        <Clock size={s(13)} color={colors.warning} />
                      )}
                    </View>
                  </View>
                ))}
              </View>
            ))}
        </View>
      )}

      {/* Totals */}
      <View
        style={{
          borderTopWidth: 1,
          borderTopColor: colors.border,
          paddingTop: s(8),
          marginBottom: s(10),
          gap: s(4),
        }}
      >
        <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
          <Text style={{ fontSize: s(11), color: colors.muted }}>Subtotal</Text>
          <Text style={{ fontSize: s(11), color: colors.label }}>
            ${tableData.subtotal?.toFixed(2)}
          </Text>
        </View>

        {tableData.amountPaid > 0 && (
          <View
            style={{ flexDirection: "row", justifyContent: "space-between" }}
          >
            <Text style={{ fontSize: s(11), color: colors.teal }}>Paid</Text>
            <Text style={{ fontSize: s(11), color: colors.teal }}>
              ${tableData.amountPaid.toFixed(2)}
              {(() => {
                const payments = tableData.orders[0]?.payments;
                if (!payments || payments.length === 0) return "";
                if (payments.length === 1)
                  return ` · ${payments[0].method.toLowerCase()}`;
                return ` · ${payments.length} payments`;
              })()}
            </Text>
          </View>
        )}

        <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
          <Text style={{ fontSize: s(11), color: colors.muted }}>
            Remaining
          </Text>
          <Text
            style={{
              fontSize: s(11),
              fontWeight: "600",
              color: tableData.amountDue <= 0 ? colors.success : colors.label,
            }}
          >
            ${tableData.amountDue.toFixed(2)}
          </Text>
        </View>

        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            marginTop: s(2),
            paddingTop: s(6),
            borderTopWidth: 1,
            borderTopColor: colors.border,
          }}
        >
          <Text
            style={{
              fontSize: s(13),
              fontWeight: "700",
              color: colors.heading,
            }}
          >
            Total
          </Text>
          <Text
            style={{
              fontSize: s(13),
              fontWeight: "700",
              color: colors.heading,
            }}
          >
            ${tableData.total?.toFixed(2)}
          </Text>
        </View>
      </View>

      {/* Action buttons */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: s(6),
          flexWrap: "wrap",
        }}
      >
        <QuickActionButton
          label="Open Order"
          onPress={onNavigateToOrder}
          variant="primary"
        />
        <QuickActionButton
          label="Print Bill"
          onPress={() => setReceiptOpen(true)}
        />
        <QuickActionButton
          label="Void"
          onPress={handleCloseTable}
          variant="destructive"
          disabled={isForeignStationSession}
        />
      </View>

      <ConfirmationModal
        isOpen={isVoidConfirmOpen}
        onClose={() => setVoidConfirmOpen(false)}
        onConfirm={onConfirmVoid}
        title="Void This Order?"
        description={`No payment has been made. Do you want to void the order for ${tableData.displayName}? This cannot be undone.`}
        confirmText="Yes, Void Order"
        variant="destructive"
      />
      {tableData.orders[0] && (
        <ReceiptModal
          isOpen={isReceiptOpen}
          onClose={() => setReceiptOpen(false)}
          order={tableData.orders[0]}
          location={selectedStore}
          onPrint={() => {
            // TODO: Integrate with thermal printer
            console.log("Print receipt for order:", tableData.orders[0]?.id);
            setReceiptOpen(false);
          }}
        />
      )}
    </Animated.View>
  );
};

const TableListItem: React.FC<{
  table: FloorPlanObject;
  isExpanded: boolean;
  onToggleExpand?: () => void;
  onNavigateToOrder: () => void;
  // activeLayoutId removed/unused in new logic
  handleTablePress: (table: FloorPlanObject) => void;
}> = ({
  table,
  isExpanded,
  onToggleExpand = () => {},
  onNavigateToOrder,
  handleTablePress,
}) => {
  const { s } = useScale();
  const tableData = useTableData(table);

  const isActiveStatus = useMemo(() => {
    const status = tableData?.status?.toLowerCase();
    return (
      status === "seated" ||
      status === "ordered" ||
      status === "served" ||
      status === "check_presented" ||
      status === "paying" ||
      status === "paid" ||
      status === "in use"
    );
  }, [tableData?.status]);

  const { duration: rawDuration, isOvertime } = useTableDuration(
    tableData?.seatedTime?.toISOString() ?? null,
    isActiveStatus && !!tableData?.seatedTime,
  );

  const duration = useMemo(() => {
    if (!isActiveStatus || !tableData?.seatedTime) return "";
    const diffMs = Date.now() - tableData.seatedTime.getTime();
    return formatDuration(diffMs);
  }, [isActiveStatus, tableData?.seatedTime, rawDuration]);

  const handlePress = () => {
    const status = tableData?.status?.toLowerCase();
    // If seated/active -> toggle expand
    if (
      status === "seated" ||
      status === "ordered" ||
      status === "served" ||
      status === "in use" ||
      status === "check_presented" ||
      status === "paying" ||
      status === "paid"
    ) {
      onToggleExpand();
      handleTablePress(table);
    } else {
      handleTablePress(table);
    }
  };

  if (!tableData) return null;

  const normalizedStatus = tableData.status.toLowerCase();
  const showActiveDetails =
    normalizedStatus !== "available" &&
    normalizedStatus !== "reserved" &&
    normalizedStatus !== "cleaning" &&
    normalizedStatus !== "closing";

  const ChevronIcon = isExpanded ? ChevronUp : ChevronDown;
  const accentColor = getStatusAccentColor(tableData.status, isOvertime);

  const metaParts: string[] = [];
  if (showActiveDetails && tableData.server && tableData.server !== "N/A") {
    metaParts.push(tableData.server);
  }
  if (showActiveDetails && tableData.guestCount > 0) {
    metaParts.push(
      `${tableData.guestCount} guest${tableData.guestCount !== 1 ? "s" : ""}`,
    );
  }
  const metaLine = metaParts.join("  ·  ");

  return (
    <Animated.View
      style={{
        overflow: isExpanded ? "visible" : "hidden",
      }}
    >
      <TouchableOpacity
        onPress={handlePress}
        activeOpacity={0.7}
        style={{
          backgroundColor: isExpanded ? colors.teal + "08" : "transparent",
          borderLeftWidth: s(3),
          borderLeftColor: accentColor,
          overflow: "hidden",
        }}
      >
        {/* Collapsed row — flat iOS-style with thin divider */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            paddingVertical: s(8),
            paddingLeft: s(10),
            paddingRight: s(12),
            gap: s(8),
            borderBottomWidth: isExpanded ? 0 : 1,
            borderBottomColor: colors.border + "30",
          }}
        >
          {/* Status left accent bar is on the row itself — no dot */}

          {/* Name + meta */}
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text
              style={{
                fontSize: s(12),
                fontWeight: "700",
                color: colors.heading,
              }}
              numberOfLines={1}
            >
              {tableData.displayName}
            </Text>
            {metaLine ? (
              <Text
                style={{
                  fontSize: s(10),
                  color: colors.muted,
                  marginTop: s(1),
                }}
                numberOfLines={1}
              >
                {metaLine}
              </Text>
            ) : null}
          </View>

          {/* Right side */}
          <View
            style={{ flexDirection: "row", alignItems: "center", gap: s(6) }}
          >
            {/* Available label */}
            {normalizedStatus === "available" && (
              <Text
                style={{
                  fontSize: s(10),
                  color: colors.success,
                  fontWeight: "600",
                }}
              >
                Available
              </Text>
            )}

            {/* Cleaning label */}
            {(normalizedStatus === "cleaning" ||
              normalizedStatus === "closing") && (
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: s(3),
                }}
              >
                <BrushCleaning size={s(11)} color={colors.muted} />
                <Text style={{ fontSize: s(10), color: colors.muted }}>
                  Cleaning
                </Text>
              </View>
            )}

            {/* Total + duration stack */}
            {showActiveDetails && (
              <View
                style={{
                  alignItems: "center",
                  justifyContent: "center",
                  minWidth: s(48),
                  gap: s(2),
                }}
              >
                {tableData.total > 0 && (
                  <Text
                    style={{
                      fontSize: s(10),
                      fontWeight: "700",
                      color: colors.heading,
                      textAlign: "center",
                    }}
                  >
                    ${tableData.total.toFixed(2)}
                  </Text>
                )}

                {duration ? (
                  <View
                    style={{
                      paddingHorizontal: s(5),
                      paddingVertical: s(2),
                      borderRadius: s(3),
                      backgroundColor: isOvertime
                        ? colors.warning + "18"
                        : colors.teal + "12",
                    }}
                  >
                    <Text
                      style={{
                        fontSize: s(9),
                        fontWeight: "700",
                        color: isOvertime ? colors.warning : colors.teal,
                        textAlign: "center",
                        fontVariant: ["tabular-nums"],
                      }}
                    >
                      {duration}
                    </Text>
                  </View>
                ) : null}
              </View>
            )}

            {/* Chevron */}
            {showActiveDetails && (
              <ChevronIcon size={s(12)} color={colors.muted} />
            )}
          </View>
        </View>
      </TouchableOpacity>

      {isExpanded && showActiveDetails && (
        <View style={{ paddingHorizontal: s(14), paddingBottom: s(14) }}>
          <ExpandedView
            tableData={tableData}
            table={table}
            onToggleExpand={onToggleExpand}
            onNavigateToOrder={onNavigateToOrder}
          />
        </View>
      )}
    </Animated.View>
  );
};

export default React.memo(TableListItem);
