// File: /components/tables/TableListItem.tsx
import { TableType } from "@/lib/types";
import { useFloorPlanStore } from "@/stores/useFloorPlanStore";
import { useMenuStore } from "@/stores/useMenuStore";
import { useOrderStore } from "@/stores/useOrderStore";
import { useSettingsStore } from "@/stores/useSettingsStore";
import { toast, ToastPosition } from "@backpackapp-io/react-native-toast";
import { router } from "expo-router";
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

// --- Helper Functions and Sub-Components remain unchanged ---
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
  status: TableType["status"];
  isOvertime: boolean;
}) => {
  const color = isOvertime
    ? "bg-yellow-500"
    : status === "Available"
    ? "bg-green-500"
    : status === "In Use"
    ? "bg-blue-500"
    : "bg-red-500";
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

// Custom hook with corrected logic for non-"In Use" tables
const useTableData = (table: TableType, activeLayoutId: string | null) => {
  const { orders } = useOrderStore();
  const { layouts } = useFloorPlanStore();
  const allTables = useMemo(() => layouts.flatMap((l) => l.tables), [layouts]);

  return useMemo(() => {
    // If table is not in use, don't fetch order data.
    if (table.status !== "In Use") {
      return {
        isMerged: false,
        primaryTableId: table.id,
        displayName: table.name,
        status: table.status,
        guestCount: 0,
        total: 0,
        seatedTime: null,
        server: "N/A",
        orders: [],
      };
    }

    const isMergedPrimary =
      table.isPrimary && (table.mergedWith?.length ?? 0) > 0;

    if (!isMergedPrimary && !table.mergedWith?.length) {
      const order = orders.find(
        (o) => o.service_location_id === table.id && o.order_status !== "Voided"
      );
      return {
        isMerged: false,
        primaryTableId: table.id,
        displayName: table.name,
        status: table.status,
        guestCount: order?.guest_count || 0,
        total: order?.items.reduce(
          (sum, item) => sum + item.price * item.quantity,
          0
        ),
        seatedTime: order?.opened_at ? new Date(order.opened_at) : null,
        server: order?.server_name || "N/A",
        orders: order ? [order] : [],
      };
    }

    // Merged table logic (only runs if status is "In Use")
    const primary = table.isPrimary
      ? table
      : allTables.find((t) => t.isPrimary && t.mergedWith?.includes(table.id));
    if (!primary) return null;
    const groupIds = [primary.id, ...(primary.mergedWith || [])];
    const groupTables = allTables.filter((t) => groupIds.includes(t.id));
    const groupOrders = orders.filter(
      (o) => o.service_location_id && groupIds.includes(o.service_location_id)
    );
    const earliestSeated = groupOrders.reduce((earliest, o) => {
      if (!o.opened_at) return earliest;
      const seated = new Date(o.opened_at).getTime();
      return seated < earliest ? seated : earliest;
    }, Infinity);

    const servers = [
      ...new Set(groupOrders.map((o) => o.server_name).filter(Boolean)),
    ];
    const hostServer =
      orders.find((o) => o.service_location_id === primary.id)?.server_name ||
      servers[0];
    const assistServers = servers.filter((s) => s !== hostServer);
    let serverDisplay = hostServer || "N/A";
    if (assistServers.length > 0) {
      serverDisplay = `Host: ${hostServer} / Assist: ${assistServers.join(
        ", "
      )}`;
    }

    return {
      isMerged: true,
      primaryTableId: primary.id,
      displayName: `${groupTables.map((t) => t.name).join(" + ")}`,
      status: "In Use" as const,
      guestCount: groupOrders.reduce((sum, o) => sum + (o.guest_count || 0), 0),
      total: groupOrders.reduce(
        (sum, o) =>
          sum +
          o.items.reduce((itemSum, i) => itemSum + i.price * i.quantity, 0),
        0
      ),
      seatedTime: earliestSeated === Infinity ? null : new Date(earliestSeated),
      server: serverDisplay,
      orders: groupOrders,
    };
  }, [table, orders, allTables]);
};

// ... ExpandedView component remains the same as previous correct version ...
const ExpandedView: React.FC<{
  tableData: NonNullable<ReturnType<typeof useTableData>>;
  onNavigateToOrder: () => void;
  onToggleExpand: () => void;
}> = ({ tableData, onNavigateToOrder, onToggleExpand }) => {
  const { unmergeTables, updateTableStatus } = useFloorPlanStore();
  const {
    sendNewItemsToKitchenForOrder,
    voidOrder,
    archiveOrder,
    deleteOrder,
  } = useOrderStore();
  const { menuItems } = useMenuStore();
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

  const newItemsCount = tableData.orders
    .flatMap((o) => o.items)
    .filter(
      (item) => !item.kitchen_status || item.kitchen_status === "new"
    ).length;

  const handleSend = () => {
    if (newItemsCount === 0) return;
    tableData.orders.forEach((order) => {
      if (
        order.items.some(
          (item) => !item.kitchen_status || item.kitchen_status === "new"
        )
      ) {
        sendNewItemsToKitchenForOrder(order.id);
      }
    });
  };

  const handleCloseTable = () => {
    const primaryOrder = tableData.orders[0];
    if (!primaryOrder) {
      router.push(`/tables/clean-table/${tableData.primaryTableId}`);
      return;
    }

    const isPaid = primaryOrder.paid_status === "Paid";
    const hasItems = primaryOrder.items.length > 0;

    if (isPaid) {
      const allItemsReady = primaryOrder.items.every(
        (item) => item.item_status === "Ready" || item.item_status === "Served"
      );
      if (allItemsReady) {
        archiveOrder(primaryOrder.id);
        updateTableStatus(tableData.primaryTableId, "Needs Cleaning");
        toast.success(`Table ${tableData.displayName} marked for cleaning.`, {
          position: ToastPosition.BOTTOM,
        });
      } else {
        toast.error("Cannot clear table: Not all items are ready.", {
          position: ToastPosition.BOTTOM,
        });
      }
    } else {
      if (hasItems) {
        setVoidConfirmOpen(true);
      } else {
        deleteOrder(primaryOrder.id);
        updateTableStatus(tableData.primaryTableId, "Available");
      }
    }
    onToggleExpand();
  };

  const onConfirmVoid = () => {
    tableData.orders.forEach((order) => voidOrder(order.id));
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
        {tableData.isMerged
          ? tableData.orders.map((order) => (
              <View key={order.id} className="mb-2">
                <Text className="text-base font-semibold text-blue-400 mb-1">
                  Table{" "}
                  {
                    useFloorPlanStore
                      .getState()
                      .layouts.flatMap((l) => l.tables)
                      .find((t) => t.id === order.service_location_id)?.name
                  }
                </Text>
                {order.items.map((item) => (
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
            ))
          : Object.entries(groupedItems).map(([category, { items }]) => (
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
        <QuickActionButton label="Add Item" onPress={onNavigateToOrder} />
        <QuickActionButton
          label={`Send (${newItemsCount})`}
          onPress={handleSend}
          disabled={newItemsCount === 0}
          variant="primary"
        />
        <QuickActionButton label="Print Bill" onPress={() => {}} />
        {tableData.isMerged && (
          <QuickActionButton
            label="Split Merge"
            onPress={() => unmergeTables(tableData.primaryTableId)}
            variant="destructive"
          />
        )}
        <QuickActionButton
          label={tableData.isMerged ? "Close All" : "Close Table"}
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
  table: TableType;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onNavigateToOrder: () => void;
  activeLayoutId: string | null;
  handleTablePress: (table: TableType) => void; // Restoring this prop
}> = ({
  table,
  isExpanded,
  onToggleExpand,
  onNavigateToOrder,
  activeLayoutId,
  handleTablePress, // Consuming the prop
}) => {
  const tableData = useTableData(table, activeLayoutId);
  const [isOvertime, setIsOvertime] = useState(false);
  const [duration, setDuration] = useState("");
  const { defaultSittingTimeMinutes } = useSettingsStore();

  useEffect(() => {
    if (tableData?.status !== "In Use" || !tableData.seatedTime) {
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
    if (table.status === "In Use") {
      onToggleExpand();
    } else {
      handleTablePress(table);
    }
  };

  if (!tableData) return null;

  return (
    <Animated.View
      layout={Layout.easing(Easing.inOut(Easing.ease)).duration(250)}
      className="border-b border-gray-700 overflow-hidden"
    >
      <TouchableOpacity
        onPress={handlePress} // Use the new conditional handler
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
          {tableData.status === "In Use" && (
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
        {isExpanded && tableData.status === "In Use" && (
          <ExpandedView
            tableData={tableData}
            onToggleExpand={onToggleExpand}
            onNavigateToOrder={onNavigateToOrder}
          />
        )}
      </TouchableOpacity>
    </Animated.View>
  );
};

export default TableListItem;
