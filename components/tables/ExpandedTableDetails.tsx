import { useToast } from "@/contexts/ToastContext";
import { TableType } from "@/lib/types";
import { useFloorPlanStore } from "@/stores/useFloorPlanStore";
import { useMenuStore } from "@/stores/useMenuStore";
import { useOrderStore } from "@/stores/useOrderStore";
import { CheckCircle, Clock, Send } from "lucide-react-native";
import React, { useMemo, useState } from "react";
import { Text, TouchableOpacity, View } from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import ConfirmationModal from "../settings/reset-application/ConfirmationModal";
import { useRouter } from "expo-router";

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
        total:
          order?.items.reduce(
            (sum, item) => sum + item.price * item.quantity,
            0
          ) || 0,
        seatedTime: order?.opened_at ? new Date(order.opened_at) : null,
        server: order?.server_name || "N/A",
        orders: order ? [order] : [],
      };
    }

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

interface ExpandedTableDetailsProps {
  table: TableType;
  activeLayoutId: string | null;
}

const ExpandedTableDetails: React.FC<ExpandedTableDetailsProps> = ({
  table,
  activeLayoutId,
}) => {
  const router = useRouter();
  const tableData = useTableData(table, activeLayoutId);

  if (!tableData) {
    return null;
  }

  const { layouts, updateTableStatus } = useFloorPlanStore();
  const { voidOrder, archiveOrder, deleteOrder } = useOrderStore();
  const { menuItems } = useMenuStore();
  const { show } = useToast();
  const [isVoidConfirmOpen, setVoidConfirmOpen] = useState(false);

  const handleNavigate = () => {
    router.push(`/tables/${tableData.primaryTableId}`);
  };

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

  const handleCloseTable = () => {
    if (!tableData) return;

    // Get all tables belonging to this group
    const allTables = layouts.flatMap((l) => l.tables);
    const primaryTable = allTables.find(
      (t) => t.id === tableData.primaryTableId
    );
    const groupTableIds = primaryTable
      ? [primaryTable.id, ...(primaryTable.mergedWith || [])]
      : [tableData.primaryTableId];

    if (tableData.orders.length === 0) {
      groupTableIds.forEach((id) => updateTableStatus(id, "Available"));
      return; // No onToggleExpand here anymore
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
        groupTableIds.forEach((id) => updateTableStatus(id, "Needs Cleaning"));
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
        groupTableIds.forEach((id) => updateTableStatus(id, "Available"));
      }
    }
  };

  const onConfirmVoid = () => {
    if (!tableData) return;
    const allTables = layouts.flatMap((l) => l.tables);
    const primaryTable = allTables.find(
      (t) => t.id === tableData.primaryTableId
    );
    const groupTableIds = primaryTable
      ? [primaryTable.id, ...(primaryTable.mergedWith || [])]
      : [tableData.primaryTableId];

    tableData.orders.forEach((order) => voidOrder(order.id));
    groupTableIds.forEach((id) => updateTableStatus(id, "Available"));
    setVoidConfirmOpen(false);
    return; // No onToggleExpand here anymore
  };

  return (
    <Animated.View
      entering={FadeIn.duration(200)}
      exiting={FadeOut.duration(100)}
      className="mt-3 pl-6 py-2 bg-blue-900/20"
    >
      <Text className="text-xl font-bold text-white mb-2">
        {tableData.displayName}
      </Text>
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
          onPress={handleNavigate}
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

export default ExpandedTableDetails;
