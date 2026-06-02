import { useToast } from "@/contexts/ToastContext";
import {
  getReadOnlyTableAccess,
  isOrderReadOnly,
} from "@/lib/orderAccessControl";
import { iosOnly } from "@/lib/safeAnimations";
import { colors } from "@/lib/theme";
import { useFloorPlanStore } from "@/stores/useFloorPlanStore";
import { useMenuStore } from "@/stores/useMenuStore";
import { useOrderStore } from "@/stores/useOrderStore";
import { useReservationStore } from "@/stores/useReservationStore";
import { useTableSessionStore } from "@/stores/useTableSessionStore";
import { FloorPlanObject as TableType } from "@/types/db-floor-plan-types";
import { useRouter } from "expo-router";
import { CheckCircle, Clock } from "lucide-react-native";
import React, { useMemo, useState } from "react";
import { Text, TouchableOpacity, View } from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import { useShallow } from "zustand/react/shallow";
import ConfirmationModal from "../settings/reset-application/ConfirmationModal";

// --- Helper Functions and Sub-Components ---
const formatDuration = (milliseconds: number): string => {
  if (isNaN(milliseconds) || milliseconds < 0) return "0m";
  const totalSeconds = Math.floor(milliseconds / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = String(Math.floor((totalSeconds % 3600) / 60)).padStart(
    2,
    "0",
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
      <Text className="text-white font-semibold text-sm">{label}</Text>
    </TouchableOpacity>
  );
};

const useTableData = (table: TableType) => {
  const getOrder = useOrderStore((s) => s.getOrder);
  const session = table.session;
  const mergedTableIds = session?.merged_tables || [];

  // Subscribe only to the specific merged table names needed, not entire tablesById
  const mergedTableNames = useFloorPlanStore(
    useShallow((s) =>
      mergedTableIds.map((tId) => s.tablesById[tId]?.name ?? null),
    ),
  );

  // Subscribe only to the sessions for the merged table IDs, not entire sessions map
  const mergedSessions = useTableSessionStore(
    useShallow((s) => mergedTableIds.map((tId) => s.sessions[tId] ?? null)),
  );

  // Subscribe only to the orders this table actually uses
  const relevantOrderIds = useMemo(() => {
    if (!mergedTableIds.length)
      return session?.order_id ? [session.order_id] : [];
    return mergedSessions
      .map((s) => s?.order_id ?? null)
      .filter(Boolean) as string[];
  }, [session?.order_id, mergedSessions, mergedTableIds.length]);

  const relevantOrders = useOrderStore(
    useShallow((s) =>
      relevantOrderIds.map((id) => {
        const localKey = s.dbOrderIdIndex[id] ?? id;
        return s.ordersById[localKey] ?? null;
      }),
    ),
  );

  return useMemo(() => {
    const session = table.session;
    const sessionStatus = session?.status || "available";
    const isInUse =
      sessionStatus !== "available" && sessionStatus !== "cleaning";

    if (!isInUse) {
      return {
        isMerged: false,
        primaryTableId: table.id,
        displayName: table.name,
        status: sessionStatus,
        guestCount: 0,
        subtotal: 0,
        tax: 0,
        total: 0,
        seatedTime: null,
        server: "N/A",
        orders: [],
      };
    }

    const mergedTableIds = session?.merged_tables || [];
    const isMerged = mergedTableIds.length > 0;

    if (!isMerged) {
      // O(1) lookup via session order_id instead of scanning all orders
      const order = session?.order_id ? getOrder(session.order_id) : undefined;
      const validOrder =
        order &&
        order.order_status !== "void" &&
        order.order_status !== "completed"
          ? order
          : undefined;
      return {
        isMerged: false,
        primaryTableId: table.id,
        displayName: table.name,
        status: sessionStatus,
        guestCount: validOrder?.guest_count || 0,
        total:
          validOrder?.items.reduce(
            (sum, item) => sum + item.price * item.quantity,
            0,
          ) || 0,
        seatedTime: validOrder?.opened_at
          ? new Date(validOrder.opened_at)
          : null,
        server: validOrder?.server_name || "N/A",
        orders: validOrder ? [validOrder] : [],
      };
    }

    // Merged tables: use pre-fetched granular arrays (no full-map subscriptions)
    const groupTableNames: string[] = [];
    const groupOrders: ReturnType<typeof getOrder>[] = [];
    for (let i = 0; i < mergedTableIds.length; i++) {
      const name = mergedTableNames[i];
      if (name) groupTableNames.push(name);
      const sess = mergedSessions[i];
      if (sess?.order_id) {
        const o = getOrder(sess.order_id);
        if (o && o.order_status !== "void" && o.order_status !== "completed") {
          groupOrders.push(o);
        }
      }
    }

    const earliestSeated = groupOrders.reduce((earliest, o) => {
      if (!o?.opened_at) return earliest;
      const seated = new Date(o.opened_at).getTime();
      return seated < earliest ? seated : earliest;
    }, Infinity);

    const servers = [
      ...new Set(groupOrders.map((o) => o?.server_name).filter(Boolean)),
    ];
    const serverDisplay = servers.length > 0 ? servers.join(", ") : "N/A";

    return {
      isMerged: true,
      primaryTableId: table.id,
      displayName: groupTableNames.sort().join(" + "),
      status: sessionStatus,
      guestCount: groupOrders.reduce(
        (sum, o) => sum + (o?.guest_count || 0),
        0,
      ),
      total: groupOrders.reduce(
        (sum, o) =>
          sum +
          (o?.items.reduce((itemSum, i) => itemSum + i.price * i.quantity, 0) ||
            0),
        0,
      ),
      seatedTime: earliestSeated === Infinity ? null : new Date(earliestSeated),
      server: serverDisplay,
      orders: groupOrders.filter((o): o is NonNullable<typeof o> => !!o),
    };
  }, [table, relevantOrders, mergedTableNames, mergedSessions]);
};

interface ExpandedTableDetailsProps {
  table: TableType;
}

const ExpandedTableDetails: React.FC<ExpandedTableDetailsProps> = ({
  table,
}) => {
  const router = useRouter();
  const tableData = useTableData(table);

  if (!tableData) {
    return null;
  }

  const updateSessionStatus = useTableSessionStore(
    (s) => s.updateSessionStatus,
  );
  const dispatchAction = useTableSessionStore((s) => s.dispatchAction);
  const deleteOrder = useOrderStore((s) => s.deleteOrder);
  const currentStationId = useOrderStore((s) => s.currentStationId);
  const getOrder = useOrderStore((s) => s.getOrder);
  const getOrderByDbId = useOrderStore((s) => s.getOrderByDbId);
  const menuItemsById = useMenuStore((s) => s.menuItemsById);
  const { show } = useToast();
  const [isCloseConfirmOpen, setCloseConfirmOpen] = useState(false);
  const [isVoidConfirmOpen, setVoidConfirmOpen] = useState(false);

  const groupedItems = useMemo(() => {
    const groups: Record<
      string,
      { orderId: string; items: (typeof tableData.orders)[0]["items"] }
    > = {};
    tableData.orders.forEach((order) => {
      order.items.forEach((item) => {
        const category =
          menuItemsById[item.menuItemId]?.category?.[0] || "Miscellaneous";
        if (!groups[category])
          groups[category] = { orderId: order.id, items: [] };
        groups[category].items.push(item);
      });
    });
    return groups;
  }, [tableData.orders, menuItemsById]);

  const allOrdersArePaid = useMemo(
    () => tableData.orders.every((order) => order.paid_status === "Paid"),
    [tableData.orders],
  );
  const groupHasAnyItems = useMemo(
    () => tableData.orders.some((order) => order.items.length > 0),
    [tableData.orders],
  );
  const foreignOwnedOrder = useMemo(() => {
    const directMatch =
      tableData.orders.find((order) => isOrderReadOnly(order, currentStationId)) ??
      null;
    if (directMatch) return directMatch;

    const liveSessions = useTableSessionStore.getState().sessions;
    const tablesById = useFloorPlanStore.getState().tablesById;
    const readOnlyAccess = getReadOnlyTableAccess({
      tableId: tableData.primaryTableId,
      currentStationId,
      getSession: (id) => liveSessions[id] ?? tablesById[id]?.session,
      getOrder: (orderId) => getOrder(orderId) ?? getOrderByDbId(orderId) ?? null,
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
    foreignOwnedOrder?.station_name?.trim() || "Another Station";

  const handleNavigate = () => {
    router.push(`/tables/${tableData.primaryTableId}`);
  };

  const closeConfirmCopy = useMemo(() => {
    if (tableData.orders.length === 0) {
      return {
        title: "Close Table?",
        description: `This will end the current session for ${tableData.displayName} and mark the table available again.`,
        confirmText: "Yes, Close Table",
      };
    }

    if (allOrdersArePaid) {
      return {
        title: "Clear Paid Table?",
        description: `This will clear ${tableData.displayName}, archive the paid order, and move the table to cleaning.`,
        confirmText: "Yes, Clear Table",
      };
    }

    return {
      title: "Close Empty Order?",
      description: `This will remove the open order for ${tableData.displayName} and mark the table available again.`,
      confirmText: "Yes, Close Table",
    };
  }, [allOrdersArePaid, tableData.displayName, tableData.orders.length]);

  const handleCloseTablePress = () => {
    if (isForeignStationSession) {
      show({
        title: "Action Restricted",
        message: `This table session is owned by ${foreignStationLabel}. Switch to that station to close it.`,
        type: "error",
      });
      return;
    }

    if (!allOrdersArePaid && groupHasAnyItems) {
      setVoidConfirmOpen(true);
      return;
    }

    setCloseConfirmOpen(true);
  };

  const handleCloseTable = async () => {
    if (!tableData || !table.session?.id) return;

    if (tableData.orders.length === 0) {
      await updateSessionStatus(table.session.id, "available");
      setCloseConfirmOpen(false);
      return;
    }
    if (allOrdersArePaid) {
      const allItemsInGroupAreReady = tableData.orders.every((order) =>
        order.items.every(
          (item) =>
            item.item_status === "Ready" || item.item_status === "Served",
        ),
      );

      if (allItemsInGroupAreReady) {
        // Use dispatch for CLEAR_TABLE — handles archive + cleaning transition
        const [firstOrder, ...remainingOrders] = tableData.orders;
        for (const order of remainingOrders) {
          useOrderStore.getState().archiveOrder(order.id);
        }
        if (firstOrder) {
          await dispatchAction({
            type: "CLEAR_TABLE",
            tableId: table.id,
            orderId: firstOrder.id,
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
      if (groupHasAnyItems) {
        setVoidConfirmOpen(true);
      } else {
        tableData.orders.forEach((order) => deleteOrder(order.id));
        await updateSessionStatus(table.session.id, "available");
      }
    }

    setCloseConfirmOpen(false);
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
    if (table.session?.id) {
      await useReservationStore
        .getState()
        .completeReservationForSession(table.session.id);
    }
    setVoidConfirmOpen(false);
  };

  return (
    <Animated.View
      entering={iosOnly(FadeIn.duration(200))}
      exiting={iosOnly(FadeOut.duration(100))}
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
                    <CheckCircle size={14} color={colors.success} />
                  )}
                  {(item.kitchen_status === "sent" ||
                    item.item_status === "Preparing") && (
                    <Clock size={14} color={colors.warning} />
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
          onPress={handleCloseTablePress}
          variant="destructive"
          disabled={isForeignStationSession}
        />
      </View>
      <ConfirmationModal
        isOpen={isCloseConfirmOpen}
        onClose={() => setCloseConfirmOpen(false)}
        onConfirm={handleCloseTable}
        title={closeConfirmCopy.title}
        description={closeConfirmCopy.description}
        confirmText={closeConfirmCopy.confirmText}
        variant="destructive"
      />
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
