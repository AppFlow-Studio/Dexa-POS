import { useToast } from "@/contexts/ToastContext";
import { useFloorPlanStore } from "@/stores/useFloorPlanStore";
import { useMenuStore } from "@/stores/useMenuStore";
import { useOrderStore } from "@/stores/useOrderStore";
import { useSettingsStore } from "@/stores/useSettingsStore";
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

// --- Helper Functions ---
const formatDuration = (milliseconds: number): string => {
  if (isNaN(milliseconds) || milliseconds < 0) return "0m";
  const totalSeconds = Math.floor(milliseconds / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = String(Math.floor((totalSeconds % 3600) / 60)).padStart(
    2,
    "0"
  );
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
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

  return <View className={`w-3 h-3 rounded-full ${color}`} />;
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
  const { orders } = useOrderStore();
  const { tables } = useFloorPlanStore();

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
        total: 0,
        seatedTime: null,
        server: "N/A",
        orders: [],
      };
    }

    // Check for merged tables
    const mergedIds = table.session?.merged_tables || [];
    const isMerged = mergedIds.length > 0;

    // Determine if this is the "Primary" (first one in merged list, or just self)
    // Legacy code had explicit 'isPrimary'.
    // Here we can treat the table passed in as the primary focus if we are rendering it.
    // But if we want to show the GROUP details, we aggregate.

    const groupIds = [table.id, ...mergedIds];
    // Filter out duplicates if table.id is in mergedIds (it shouldn't be, usually)
    const uniqueGroupIds = Array.from(new Set(groupIds));

    const groupTables = tables.filter((t) => uniqueGroupIds.includes(t.id));

    // Find orders for ANY table in the group
    const groupOrders = orders.filter(
      (o) =>
        o.service_location_id &&
        uniqueGroupIds.includes(o.service_location_id) &&
        o.order_status !== "void"
    );

    if (groupOrders.length === 0 && !isMerged) {
      // Fallback if status says In Use but no order found (maybe just seated?)
      return {
        isMerged: false,
        primaryTableId: table.id,
        displayName: table.name,
        status: status,
        guestCount: table.session?.party_size || 0,
        total: 0,
        seatedTime: table.session?.seated_at
          ? new Date(table.session.seated_at)
          : null,
        server: "N/A", // Could fetch employee using session.server_staff_id if available
        orders: [],
      };
    }

    const earliestSeated = groupOrders.reduce((earliest, o) => {
      if (!o.opened_at) return earliest;
      const seated = new Date(o.opened_at).getTime();
      return seated < earliest ? seated : earliest;
    }, Infinity);

    const servers = [
      ...new Set(groupOrders.map((o) => o.server_name).filter(Boolean)),
    ];
    // Simple server display logic
    let serverDisplay = servers[0] || "N/A";
    if (servers.length > 1) {
      serverDisplay = `${servers[0]} + ${servers.length - 1} others`;
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
      guestCount:
        groupOrders.reduce((sum, o) => sum + (o.guest_count || 0), 0) ||
        table.session?.party_size ||
        0,
      total: groupOrders.reduce(
        (sum, o) =>
          sum +
          o.items.reduce((itemSum, i) => itemSum + i.price * i.quantity, 0),
        0
      ),
      seatedTime:
        earliestSeated === Infinity
          ? table.session?.seated_at
            ? new Date(table.session.seated_at)
            : null
          : new Date(earliestSeated),
      server: serverDisplay,
      orders: groupOrders,
    };
  }, [table, orders, tables]);
};

const ExpandedView: React.FC<{
  tableData: NonNullable<ReturnType<typeof useTableData>>;
  onNavigateToOrder: () => void;
  onToggleExpand: () => void;
  table: FloorPlanObject; // Need table obj to get IDs
}> = ({ tableData, onNavigateToOrder, onToggleExpand, table }) => {
  const { updateSessionStatus } = useFloorPlanStore(); // Use updateSessionStatus instead of updateTableStatus
  const { voidOrder, archiveOrder, deleteOrder } = useOrderStore();
  const { menuItems } = useMenuStore();
  const { show } = useToast();
  const [isVoidConfirmOpen, setVoidConfirmOpen] = useState(false);

  const getCategoryForItem = (itemId: string) => {
    const menuItem = menuItems.find((mi) => mi.id === itemId);
    return menuItem?.category?.[0] || "Miscellaneous";
  };

  const groupedItems = useMemo(() => {
    const groups: Record<
      string,
      { orderId: string; items: (typeof tableData.orders)[0]["items"] }
    > = {};
    tableData.orders.forEach((order) => {
      order.items.forEach((item) => {
        const category = getCategoryForItem(item.menuItemId);
        if (!groups[category])
          groups[category] = { orderId: order.id, items: [] };
        groups[category].items.push(item);
      });
    });
    return groups;
  }, [tableData.orders, menuItems]);

  const handleCloseTable = async () => {
    if (!tableData) return;

    // We update session status. Assuming we have session ID.
    // tableData doesn't have session ID explicitly returned in my hook above?
    // table object has it.

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
      // Just seated or empty. Free up.
      await updateSessionStatus(sessionId, "available"); // or 'cleaning'?
      // Actually DB might require 'available' to clear session?
      // updateSessionStatus usually updates status field.
      // If we want to CLEAR session (remove it), we might need `closeSession`.
      // But let's assume 'available' or 'cleaning' is fine.
      onToggleExpand();
      return;
    }

    const allOrdersArePaid = tableData.orders.every(
      (o) => o.paid_status === "Paid"
    );

    if (allOrdersArePaid) {
      const allItemsInGroupAreReady = tableData.orders.every((order) =>
        order.items.every(
          (item) =>
            item.item_status === "Ready" || item.item_status === "Served"
        )
      );

      if (allItemsInGroupAreReady) {
        tableData.orders.forEach((order) => archiveOrder(order.id));
        await updateSessionStatus(sessionId, "cleaning"); // Mark cleaning
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

    tableData.orders.forEach((order) => voidOrder(order.id));
    await updateSessionStatus(table.session.id, "available");
    setVoidConfirmOpen(false);
    onToggleExpand();
  };

  return (
    <Animated.View
      entering={FadeIn.duration(200)}
      exiting={FadeOut.duration(100)}
      className="mt-3 pl-6"
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
        {Object.entries(groupedItems).map(([category, { items }]) => (
          <View key={category} className="mb-2">
            <Text className="text-base font-semibold text-blue-400 mb-1">
              {category}
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
        <View className="border-t border-gray-700 mt-2 pt-2 pr-2 flex-row justify-between">
          <Text className="text-base font-bold text-white">Total</Text>
          <Text className="text-base font-bold text-white">
            ${tableData.total?.toFixed(2)}
          </Text>
        </View>
      </View>

      <View className="flex-row items-center gap-2">
        <QuickActionButton
          label="Open Table"
          onPress={onNavigateToOrder}
          variant="primary"
        />
        <QuickActionButton label="Print Bill" onPress={() => {}} />
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
      setIsOvertime(Math.floor(diffMs / 60000) > defaultSittingTimeMinutes);
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
      className="border-b border-gray-700 overflow-hidden "
    >
      <TouchableOpacity
        onPress={handlePress}
        className={`p-3 ${isExpanded ? "bg-blue-900/20" : "bg-transparent"}`}
      >
        <View className="flex-row items-center justify-between">
          <View className="flex-row items-center gap-3 flex-1">
            <StatusIndicator
              status={tableData.status}
              isOvertime={isOvertime}
            />
            <Text
              className="text-lg font-semibold text-white"
              numberOfLines={1}
            >
              {tableData.displayName}
            </Text>
          </View>
          {showActiveDetails && (
            <>
              <Text className="text-base text-gray-300 w-20 text-center">
                {duration}
              </Text>
              <Text className="text-base text-gray-300 w-24 text-center">
                {tableData.guestCount} Guests
              </Text>
              <Text className="text-base font-bold text-white w-24 text-right">
                ${tableData.total?.toFixed(2) || "0.00"}
              </Text>
            </>
          )}
        </View>
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

export default TableListItem;
