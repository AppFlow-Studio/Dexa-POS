import ReceiptModal from "@/components/receipts/ReceiptModal";
import { useToast } from "@/contexts/ToastContext";
import { OrderProfile } from "@/lib/types";
import { useOrderTotals } from "@/stores/selectors/orderSelectors";
import { useCoursingStore } from "@/stores/useCoursingStore";
import { useFloorPlanStore } from "@/stores/useFloorPlanStore";
import { useOrderStore } from "@/stores/useOrderStore";
import { useSettingsStore } from "@/stores/useSettingsStore";
import { useStoreSettingsStore } from "@/stores/useStoreSettingsStore";
import { useTableSessionStore } from "@/stores/useTableSessionStore";
import { FloorPlanObject } from "@/types/db-floor-plan-types";
import { CheckCircle, Clock, Send } from "lucide-react-native";
import React, { useEffect, useMemo, useState } from "react";
import { Text, TouchableOpacity, View } from "react-native";
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  Layout,
} from "react-native-reanimated";
import ConfirmationModal from "../settings/reset-application/ConfirmationModal";
import { PaymentStatusBadge, type PaymentStatus } from "./PaymentStatusBadge";

// --- Helper Functions ---
const formatDuration = (milliseconds: number): string => {
  if (isNaN(milliseconds) || milliseconds < 0) return "0m";
  const totalMinutes = Math.floor(milliseconds / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
};

const StatusIndicator = ({
  status,
  isOvertime,
}: {
  status: string; // Simplified type as string since DB status is lowercase but UI might expect Mixed
  isOvertime: boolean;
}) => {
  const normalizedStatus = status?.toLowerCase() || "available";

  const color = isOvertime
    ? "bg-yellow-500"
    : normalizedStatus === "available"
      ? "bg-green-500"
      : normalizedStatus === "in use" ||
          normalizedStatus === "seated" ||
          normalizedStatus === "ordered" ||
          normalizedStatus === "served"
        ? "bg-blue-500"
        : "bg-red-500"; // needs cleaning / etc

  // Note: Previous logic mapped "In Use" to blue.
  // We should map DB usage statuses to blue properly.

  return <View className={`w-2 h-2 rounded-full ${color}`} />;
};

const QuickActionButton: React.FC<{
  onPress: () => void;
  label: string;
  variant?: "primary" | "secondary" | "destructive";
  disabled?: boolean;
}> = ({ onPress, label, variant = "secondary", disabled = false }) => {
  const baseStyle = "px-3 py-2 rounded-lg flex-row items-center gap-1";
  const variantStyle =
    variant === "primary"
      ? "bg-blue-600"
      : variant === "destructive"
        ? "bg-red-600"
        : "bg-gray-600";
  const disabledStyle = disabled ? "opacity-50" : "";
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      className={`${baseStyle} ${variantStyle} ${disabledStyle}`}
    >
      {label.startsWith("Send") && <Send size={14} color="white" />}
      <Text className="text-white font-semibold text-sm">{label}</Text>
    </TouchableOpacity>
  );
};

const useTableData = (table: FloorPlanObject) => {
  // console.log(`[TableListItem] useTableData ${table.name}`, table)
  const ordersById = useOrderStore((s) => s.ordersById);
  const tables = useFloorPlanStore((s) => s.tables);

  // Get session order ID for payment calculations
  const sessionOrderId = table.session?.order_id || null;
  const orderIdForPayments = useMemo(() => {
    if (!sessionOrderId) return null;
    // Try direct lookup first
    if (ordersById[sessionOrderId]) return sessionOrderId;
    // Fallback: search by db_order_id
    const order = Object.values(ordersById).find(
      (o) => o.db_order_id === sessionOrderId,
    );
    return order?.id || null;
  }, [sessionOrderId, ordersById]);

  // Get payment-aware totals for this order
  const orderTotals = useOrderTotals(orderIdForPayments);

  // table.session?.merged_tables -> array of strings (IDs)

  return useMemo(() => {
    const status = table.session?.status || "available";
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
    const mergedIds = table.session?.merged_tables || [];
    const isMerged = mergedIds.length > 0;

    // For merged tables, they all share the same session_id and order_id
    // So we just need to check the current table's session
    const sessionOrderId = table.session?.order_id;

    // If no session or no order_id, return empty orders (seated but not ordered yet)
    if (!table.session || !sessionOrderId) {
      return {
        isMerged: false,
        primaryTableId: table.id,
        displayName: table.name,
        status: status,
        guestCount: table.session?.party_size || 0,
        subtotal: 0,
        tax: 0,
        total: 0,
        amountDue: 0,
        amountPaid: 0,
        paidStatus: "Unpaid" as PaymentStatus,
        seatedTime: table.session?.seated_at
          ? new Date(table.session.seated_at)
          : null,
        server: "N/A",
        orders: [],
      };
    }

    // O(1) lookup using ordersById - try by id first, then by db_order_id
    let order: OrderProfile | undefined = ordersById[sessionOrderId];
    if (!order) {
      // Fallback: search by db_order_id if session.order_id is the backend UUID
      order = Object.values(ordersById).find(
        (o) => o.db_order_id === sessionOrderId,
      );
    }

    // Get merged table names for display
    const groupIds = [table.id, ...mergedIds];
    const uniqueGroupIds = Array.from(new Set(groupIds));
    const groupTables = tables.filter((t) => uniqueGroupIds.includes(t.id));

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
        seatedTime: table.session?.seated_at
          ? new Date(table.session.seated_at)
          : null,
        server: "N/A",
        orders: [],
      };
    }

    // Found order - merged tables share the same order, so return single order in array
    const groupOrders = [order];

    // console.log(`[TableListItem] groupOrders ${table.name}`, groupOrders.length);

    // Calculate display values from the single order
    const seatedTime = order.opened_at ? new Date(order.opened_at) : null;
    const serverDisplay = order.server_name || "N/A";

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
      guestCount: order.guest_count || table.session?.party_size || 0,
      subtotal,
      tax,
      total,
      amountDue,
      amountPaid,
      paidStatus,
      seatedTime:
        seatedTime ||
        (table.session?.seated_at ? new Date(table.session.seated_at) : null),
      server: serverDisplay,
      orders: groupOrders,
    };
  }, [table, ordersById, tables, orderTotals]);
};

const ExpandedView: React.FC<{
  tableData: NonNullable<ReturnType<typeof useTableData>>;
  onNavigateToOrder: () => void;
  onToggleExpand: () => void;
  table: FloorPlanObject; // Need table obj to get IDs
}> = ({ tableData, onNavigateToOrder, onToggleExpand, table }) => {
  const updateSessionStatus = useTableSessionStore((s) => s.updateSessionStatus);
  const dispatchAction = useTableSessionStore((s) => s.dispatchAction);
  const archiveOrder = useOrderStore((s) => s.archiveOrder);
  const deleteOrder = useOrderStore((s) => s.deleteOrder);
  const coursingByOrderId = useCoursingStore((s) => s.byOrderId);
  const { show } = useToast();
  const [isVoidConfirmOpen, setVoidConfirmOpen] = useState(false);
  const [isReceiptOpen, setReceiptOpen] = useState(false);
  const selectedStore = useStoreSettingsStore((s) => s.selectedStore);

  const groupedItems = useMemo(() => {
    const groups: Record<
      number,
      { orderId: string; items: (typeof tableData.orders)[0]["items"] }
    > = {};
    tableData.orders.forEach((order) => {
      const itemCourseMap = coursingByOrderId[order.id]?.itemCourseMap || {};

      order.items.forEach((item) => {
        const courseNumber = itemCourseMap[item.id] ?? item.courseNumber ?? 1;
        if (!groups[courseNumber])
          groups[courseNumber] = { orderId: order.id, items: [] };
        groups[courseNumber].items.push(item);
      });
    });
    return groups;
  }, [tableData.orders, coursingByOrderId]);

  const handleCloseTable = async () => {
    if (!tableData) return;

    if (!table.session?.id) {
      show({
        title: "Error",
        message: "No active session found.",
        type: "error",
      });
      return;
    }
    const sessionId = table.session.id;

    if (tableData.orders.length === 0) {
      await updateSessionStatus(sessionId, "available");
      onToggleExpand();
      return;
    }

    const allOrdersArePaid = tableData.orders.every(
      (o) => o.paid_status === "Paid",
    );

    if (allOrdersArePaid) {
      const allItemsInGroupAreReady = tableData.orders.every((order) =>
        order.items.every(
          (item) =>
            item.item_status === "Ready" || item.item_status === "Served",
        ),
      );

      if (allItemsInGroupAreReady) {
        // Use dispatch for CLEAR_TABLE — handles archive + cleaning transition
        for (const order of tableData.orders) {
          await dispatchAction({
            type: "CLEAR_TABLE",
            tableId: table.id,
            orderId: order.id,
          });
        }
        show({
          title: "Tables Cleared",
          message: `Tables ${tableData.displayName} are now marked for cleaning.`,
          type: "success",
        });
      } else {
        show({
          title: "Action Restricted",
          message:
            "Cannot clear tables until all items are marked as 'Ready' or 'Served'.",
          type: "error",
        });
      }
    } else {
      const groupHasAnyItems = tableData.orders.some((o) => o.items.length > 0);
      if (groupHasAnyItems) {
        setVoidConfirmOpen(true);
      } else {
        tableData.orders.forEach((order) => deleteOrder(order.id));
        await updateSessionStatus(sessionId, "available");
      }
    }
  };

  const onConfirmVoid = async () => {
    if (!tableData || !table.session?.id) return;

    // Use dispatch for VOID_ORDER — includes inventory deduction (fixes bug)
    for (const order of tableData.orders) {
      await dispatchAction({
        type: "VOID_ORDER",
        tableId: table.id,
        orderId: order.id,
        dbOrderId: order.db_order_id,
      });
    }
    setVoidConfirmOpen(false);
    onToggleExpand();
  };

  return (
    <Animated.View
      entering={FadeIn.duration(200)}
      exiting={FadeOut.duration(100)}
      className="mt-3"
    >
      <View className="flex-row items-center gap-4 mb-3">
        <Text className="text-sm text-gray-300">
          Server: {tableData.server}
        </Text>
        <Text className="text-sm text-gray-300">
          Seated:{" "}
          {tableData.seatedTime?.toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </Text>
      </View>

      <View className="mb-4 pr-2">
        {Object.entries(groupedItems)
          .sort(([a], [b]) => Number(a) - Number(b))
          .map(([courseNumber, { items }]) => (
            <View key={courseNumber} className="mb-2">
              <Text className="text-base font-semibold text-blue-400 mb-1">
                Course {courseNumber}
              </Text>
              {items.map((item) => (
                <View key={item.id} className="flex-row items-center ml-2">
                  <Text className="text-base text-gray-300">
                    {item.quantity}x {item.name}
                  </Text>
                  <View className="ml-2">
                    {(item.item_status === "Ready" ||
                      item.item_status === "Served") && (
                      <CheckCircle size={14} color="#22C55E" />
                    )}
                    {(item.kitchen_status === "sent" ||
                      item.item_status === "Preparing") && (
                      <Clock size={14} color="#F59E0B" />
                    )}
                  </View>
                </View>
              ))}
            </View>
          ))}
        <View className="border-t border-gray-700 mt-2 pt-2 pr-2">
          <View className="flex-row justify-between">
            <Text className="text-sm text-gray-400">Subtotal</Text>
            <Text className="text-sm text-gray-400">
              ${tableData.subtotal?.toFixed(2)}
            </Text>
          </View>
          <View className="flex-row justify-between">
            <Text className="text-sm text-gray-400">Tax</Text>
            <Text className="text-sm text-gray-400">
              ${tableData.tax?.toFixed(2)}
            </Text>
          </View>
          <View className="flex-row justify-between mt-1">
            <Text className="text-base font-semibold text-white">Total</Text>
            <Text className="text-base font-semibold text-white">
              ${tableData.total?.toFixed(2)}
            </Text>
          </View>

          {/* Payment Information */}
          {tableData.amountPaid > 0 && (
            <>
              <View className="border-t border-gray-600 mt-2 pt-2" />
              <View className="flex-row justify-between">
                <Text className="text-sm text-blue-400">Amount Paid</Text>
                <Text className="text-sm text-blue-400">
                  -${tableData.amountPaid.toFixed(2)}
                </Text>
              </View>
            </>
          )}

          <View className="flex-row justify-between mt-2 items-center">
            <View className="flex-row items-center gap-2">
              <Text className="text-lg font-bold text-white">Amount Due</Text>
              <PaymentStatusBadge status={tableData.paidStatus} size="md" />
            </View>
            <Text className="text-lg font-bold text-white">
              ${tableData.amountDue.toFixed(2)}
            </Text>
          </View>
        </View>
      </View>

      <View className="flex-row items-center gap-2">
        <QuickActionButton
          label="Table"
          onPress={onNavigateToOrder}
          variant="primary"
        />
        <QuickActionButton
          label="Print Bill"
          onPress={() => setReceiptOpen(true)}
        />
        <QuickActionButton
          label="Close Table"
          onPress={handleCloseTable}
          variant="destructive"
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
  onToggleExpand?: () => void; // Make optional
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
  const tableData = useTableData(table);
  const [isOvertime, setIsOvertime] = useState(false);
  const [duration, setDuration] = useState("");
  const { defaultSittingTimeMinutes } = useSettingsStore();

  useEffect(() => {
    // Check various active statuses
    const status = tableData?.status?.toLowerCase();
    const isActive =
      status === "seated" ||
      status === "ordered" ||
      status === "served" ||
      status === "in use";

    if (!isActive || !tableData.seatedTime) {
      setIsOvertime(false);
      setDuration("");
      return;
    }
    const update = () => {
      const diffMs = new Date().getTime() - tableData.seatedTime!.getTime();
      setDuration(formatDuration(diffMs));
      setIsOvertime(
        defaultSittingTimeMinutes > 0 &&
          Math.floor(diffMs / 60000) > defaultSittingTimeMinutes,
      );
    };
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [tableData, defaultSittingTimeMinutes]);

  const handlePress = () => {
    const status = tableData?.status?.toLowerCase();
    // If seated/active -> toggle expand
    if (
      status === "seated" ||
      status === "ordered" ||
      status === "served" ||
      status === "in use" ||
      status === "check_presented"
    ) {
      onToggleExpand();
    } else {
      handleTablePress(table);
    }
  };

  if (!tableData) return null;

  const showActiveDetails =
    tableData.status.toLowerCase() !== "available" &&
    tableData.status.toLowerCase() !== "reserved" &&
    tableData.status.toLowerCase() !== "cleaning";

  return (
    <Animated.View
      layout={Layout.easing(Easing.inOut(Easing.ease)).duration(250)}
      className="border-b border-gray-700 overflow-hidden"
    >
      <TouchableOpacity
        onPress={handlePress}
        className={`p-3 ${isExpanded ? "bg-blue-900/20" : "bg-transparent"}`}
      >
        {/* Main Layout Container */}
        <View className="flex-col w-full">
          {/* Row 1: Status & Name (Always visible full width) */}
          <View className="flex-row items-center gap-3 w-full">
            <StatusIndicator
              status={tableData.status}
              isOvertime={isOvertime}
            />
            <Text
              className="text-white font-semibold text-base flex-1"
              numberOfLines={1}
            >
              {tableData.displayName}
            </Text>
          </View>

          {/* Row 2: Stats (Only when active) */}
          {showActiveDetails && (
            <View className="flex-row items-center justify-between pl-5 mt-1.5">
              {/* Duration */}
              <Text className="text-xs font-medium text-blue-300 w-16">
                {duration}
              </Text>

              {/* Guests */}
              <Text className="text-xs text-gray-400">
                {tableData.guestCount} Guests
              </Text>

              {/* Amount */}
              <View className="items-end min-w-[80px]">
                <Text className="text-sm font-bold text-white">
                  ${tableData.amountDue?.toFixed(2) || "0.00"}
                </Text>
                {tableData.amountPaid > 0 && (
                  <Text className="text-[10px] text-gray-500">
                    Paid: ${tableData.amountPaid.toFixed(2)}
                  </Text>
                )}
              </View>
            </View>
          )}
        </View>

        {/* Expanded Detail View */}
        {isExpanded && showActiveDetails && (
          <ExpandedView
            tableData={tableData}
            table={table}
            onToggleExpand={onToggleExpand}
            onNavigateToOrder={onNavigateToOrder}
          />
        )}
      </TouchableOpacity>
    </Animated.View>
  );
};

export default React.memo(TableListItem);
