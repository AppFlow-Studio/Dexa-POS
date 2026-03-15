import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetScrollView,
} from "@gorhom/bottom-sheet";
import { bottomSheetTheme, colors, TABLE_STATUS_COLORS } from "@/lib/theme";
import { getEffectiveItemStatus } from "@/lib/kitchenStatusUtils";
import { useFloorPlanStore } from "@/stores/useFloorPlanStore";
import { useOrderStore } from "@/stores/useOrderStore";
import { useTableSessionStore } from "@/stores/useTableSessionStore";
import { useStoreSettingsStore } from "@/stores/useStoreSettingsStore";
import { useOrderTotals } from "@/stores/selectors/orderSelectors";
import { formatCurrency } from "@/utils/currency";
import { PrinterService } from "@/services/printing/PrinterService";
import { FloorPlanObject, TableStatus } from "@/types/db-floor-plan-types";
import {
  ChevronUp,
  DollarSign,
  LogOut,
  Printer,
  Trash2,
  Unlock,
  Users,
  UtensilsCrossed,
} from "lucide-react-native";
import { useSessionDuration } from "@/hooks/useSessionDuration";
import React, { useCallback, useEffect, useMemo, useRef } from "react";
import { Text, TouchableOpacity, View } from "react-native";

interface TableContextSheetProps {
  table: FloorPlanObject | null;
  onClose: () => void;
  onSeatGuests: (table: FloorPlanObject) => void;
  onNavigate: (tableId: string) => void;
}

type ActionItem = {
  label: string;
  icon: React.ReactNode;
  onPress: () => void;
  variant?: "primary" | "secondary" | "danger";
};

function getActionsForStatus(
  status: TableStatus | undefined,
  table: FloorPlanObject,
  onSeatGuests: (t: FloorPlanObject) => void,
  onNavigate: (id: string) => void,
  clearTableSession: (id: string) => void,
  finishCleaning: (id: string) => void,
  updateSessionStatus: (id: string, s: TableStatus) => void,
): ActionItem[] {
  const actions: ActionItem[] = [];

  const effectiveStatus = status || "available";

  switch (effectiveStatus) {
    case "available":
      actions.push({
        label: "Seat Guests",
        icon: <Users size={18} color={colors.info} />,
        onPress: () => onSeatGuests(table),
        variant: "primary",
      });
      break;

    case "reserved":
      actions.push({
        label: "Seat Reservation",
        icon: <Users size={18} color={colors.info} />,
        onPress: () => onSeatGuests(table),
        variant: "primary",
      });
      actions.push({
        label: "Seat Walk-In",
        icon: <Users size={18} color={colors.label} />,
        onPress: () => onSeatGuests(table),
      });
      break;

    case "seating":
    case "seated":
    case "ordering":
    case "ordered":
    case "served":
      actions.push({
        label: "View Order",
        icon: <DollarSign size={18} color={colors.info} />,
        onPress: () => onNavigate(table.id),
        variant: "primary",
      });
      if (effectiveStatus === "served" || effectiveStatus === "ordered") {
        actions.push({
          label: "Present Check",
          icon: <ChevronUp size={18} color={colors.label} />,
          onPress: () => updateSessionStatus(table.id, "check_presented"),
        });
      }
      break;

    case "check_presented":
      actions.push({
        label: "View Order",
        icon: <DollarSign size={18} color={colors.info} />,
        onPress: () => onNavigate(table.id),
        variant: "primary",
      });
      actions.push({
        label: "Take Payment",
        icon: <DollarSign size={18} color={colors.label} />,
        onPress: () => onNavigate(table.id),
      });
      break;

    case "paying":
      actions.push({
        label: "View Order",
        icon: <DollarSign size={18} color={colors.info} />,
        onPress: () => onNavigate(table.id),
      });
      break;

    case "paid":
      actions.push({
        label: "View Order",
        icon: <DollarSign size={18} color={colors.info} />,
        onPress: () => onNavigate(table.id),
      });
      actions.push({
        label: "Close Table",
        icon: <LogOut size={18} color={colors.label} />,
        onPress: () => clearTableSession(table.id),
        variant: "secondary",
      });
      break;

    case "cleaning":
      actions.push({
        label: "Mark Clean",
        icon: <Trash2 size={18} color={colors.label} />,
        onPress: () => finishCleaning(table.id),
        variant: "secondary",
      });
      break;

    case "blocked":
    case "not_in_service":
      actions.push({
        label: "Unblock Table",
        icon: <Unlock size={18} color={colors.label} />,
        onPress: () => updateSessionStatus(table.id, "available"),
        variant: "secondary",
      });
      break;

    default:
      break;
  }

  return actions;
}

const KITCHEN_STATUS_COLORS = {
  preparing: "#F59E0B", // amber
  ready: "#22C55E",     // green
  served: "#3B82F6",    // blue
} as const;

const PAID_STATUS_CONFIG = {
  Paid: { label: "Paid", color: "#22C55E", bg: "bg-green-900/30" },
  Partial: { label: "Partial", color: "#F59E0B", bg: "bg-amber-900/30" },
  Unpaid: { label: "Unpaid", color: "#EF4444", bg: "bg-red-900/30" },
} as const;

const TableContextSheet: React.FC<TableContextSheetProps> = ({
  table,
  onClose,
  onSeatGuests,
  onNavigate,
}) => {
  const sheetRef = useRef<BottomSheetModal>(null);
  const snapPoints = useMemo(() => ["55%"], []);

  const clearTableSession = useFloorPlanStore((s) => s.clearTableSession);
  const finishCleaning = useFloorPlanStore((s) => s.finishCleaning);
  const updateSessionStatus = useFloorPlanStore((s) => s.updateSessionStatus);

  // Sync sheet open/close with table selection
  useEffect(() => {
    if (table) {
      sheetRef.current?.present();
    } else {
      sheetRef.current?.dismiss();
    }
  }, [table]);

  const handleDismiss = useCallback(() => {
    onClose();
  }, [onClose]);

  const liveSession = useTableSessionStore((s) => table ? s.sessions[table.id] : undefined);
  const status = (liveSession?.status ?? table?.session?.status) || "available";
  const tableColor = TABLE_STATUS_COLORS[status] || colors.info;

  // Resolve order ID from session (handles both local ID and db_order_id)
  const resolvedOrderId = useOrderStore((s) => {
    const oid = liveSession?.order_id;
    if (!oid) return null;
    return s.dbOrderIdIndex[oid] ?? (s.ordersById[oid] ? oid : null);
  });
  const order = useOrderStore((s) => resolvedOrderId ? s.ordersById[resolvedOrderId] : null);
  const totals = useOrderTotals(resolvedOrderId);
  const selectedStore = useStoreSettingsStore((s) => s.selectedStore);

  const isOccupied = !!order;

  // Seated duration (auto-updates every 60s via useSessionDuration)
  const { minutes: minutesSeated } = useSessionDuration(table?.id ?? "");

  // Kitchen status summary
  const kitchenSummary = useMemo(() => {
    if (!order?.items?.length) return null;
    const counts = { preparing: 0, ready: 0, served: 0 };
    for (const item of order.items) {
      if (item.is_voided) continue;
      const s = getEffectiveItemStatus(item);
      if (s === "preparing") counts.preparing++;
      else if (s === "ready") counts.ready++;
      else if (s === "served") counts.served++;
    }
    return (counts.preparing || counts.ready || counts.served) ? counts : null;
  }, [order?.items]);

  // Items preview (first 5 non-voided)
  const itemsPreview = useMemo(() => {
    if (!order?.items?.length) return null;
    const nonVoided = order.items.filter((i) => !i.is_voided);
    if (nonVoided.length === 0) return null;
    const shown = nonVoided.slice(0, 5);
    const remaining = nonVoided.length - shown.length;
    return { items: shown, remaining };
  }, [order?.items]);

  // Paid status
  const paidStatus = order?.paid_status ?? "Unpaid";
  const paidConfig = PAID_STATUS_CONFIG[paidStatus as keyof typeof PAID_STATUS_CONFIG] ?? PAID_STATUS_CONFIG.Unpaid;

  // Base actions from status
  const actions = useMemo(() => {
    if (!table) return [];

    const baseActions = getActionsForStatus(
      status as TableStatus,
      table,
      onSeatGuests,
      onNavigate,
      (id) => clearTableSession(id),
      (id) => finishCleaning(id),
      (id, s) => updateSessionStatus(id, s),
    );

    // Add print actions for occupied tables
    if (order && selectedStore) {
      const occupiedStatuses = new Set([
        "ordered", "served", "check_presented", "paid",
      ]);
      if (occupiedStatuses.has(status)) {
        baseActions.push({
          label: "Print Receipt",
          icon: <Printer size={18} color={colors.label} />,
          onPress: () => {
            PrinterService.printReceipt(order, selectedStore);
          },
        });
      }

      const kitchenPrintStatuses = new Set(["seated", "ordering", "ordered"]);
      if (kitchenPrintStatuses.has(status)) {
        baseActions.push({
          label: "Print Kitchen Ticket",
          icon: <UtensilsCrossed size={18} color={colors.label} />,
          onPress: () => {
            const nonVoidedItems = order.items.filter((i) => !i.is_voided);
            PrinterService.printKitchenTickets(order, nonVoidedItems, selectedStore);
          },
        });
      }
    }

    return baseActions;
  }, [table, status, onSeatGuests, onNavigate, clearTableSession, finishCleaning, updateSessionStatus, order, selectedStore]);

  return (
    <BottomSheetModal
      ref={sheetRef}
      snapPoints={snapPoints}
      enableDynamicSizing={false}
      onDismiss={handleDismiss}
      backdropComponent={(props) => (
        <BottomSheetBackdrop
          {...props}
          appearsOnIndex={0}
          disappearsOnIndex={-1}
          pressBehavior="close"
        />
      )}
      backgroundStyle={bottomSheetTheme.backgroundStyle}
      handleIndicatorStyle={bottomSheetTheme.handleIndicatorStyle}
      enablePanDownToClose
    >
      <BottomSheetScrollView style={{ paddingBottom: 20 }}>
        {/* Header */}
        <View className="px-5 py-3 border-b border-border">
          <View className="flex-row items-center gap-3 mb-1">
            <View
              style={{
                width: 12,
                height: 12,
                borderRadius: 6,
                backgroundColor: tableColor,
              }}
            />
            <Text className="text-white font-bold text-lg flex-1">
              {table?.name}
            </Text>
            <Text className="text-muted text-sm">{status}</Text>
          </View>
          <View className="flex-row items-center flex-wrap">
            {table?.session?.party_size ? (
              <Text className="text-label text-sm">
                {table.session.party_size} guests
              </Text>
            ) : null}
            {order?.server_name ? (
              <Text className="text-label text-sm">
                {table?.session?.party_size ? " \u2022 " : ""}Server: {order.server_name}
              </Text>
            ) : null}
            {minutesSeated > 0 ? (
              <Text className="text-label text-sm">
                {(table?.session?.party_size || order?.server_name) ? " \u2022 " : ""}{minutesSeated} min
              </Text>
            ) : null}
          </View>
        </View>

        {/* Financial Summary — occupied tables only */}
        {isOccupied && totals ? (
          <View className="px-5 py-3 border-b border-border flex-row items-center justify-between">
            <Text className="text-white font-bold text-base">
              {formatCurrency(totals.total)}
            </Text>
            <Text className="text-label text-sm">
              {totals.itemCount} {totals.itemCount === 1 ? "item" : "items"}
            </Text>
            <View className={`px-2 py-0.5 rounded ${paidConfig.bg}`}>
              <Text style={{ color: paidConfig.color }} className="text-xs font-semibold">
                {paidConfig.label}
              </Text>
            </View>
          </View>
        ) : null}

        {/* Kitchen Status — occupied tables only */}
        {isOccupied && kitchenSummary ? (
          <View className="px-5 py-2 border-b border-border flex-row items-center gap-4">
            {kitchenSummary.preparing > 0 && (
              <View className="flex-row items-center gap-1.5">
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: KITCHEN_STATUS_COLORS.preparing }} />
                <Text className="text-label text-sm">{kitchenSummary.preparing} preparing</Text>
              </View>
            )}
            {kitchenSummary.ready > 0 && (
              <View className="flex-row items-center gap-1.5">
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: KITCHEN_STATUS_COLORS.ready }} />
                <Text className="text-label text-sm">{kitchenSummary.ready} ready</Text>
              </View>
            )}
            {kitchenSummary.served > 0 && (
              <View className="flex-row items-center gap-1.5">
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: KITCHEN_STATUS_COLORS.served }} />
                <Text className="text-label text-sm">{kitchenSummary.served} served</Text>
              </View>
            )}
          </View>
        ) : null}

        {/* Items Preview — occupied tables only */}
        {isOccupied && itemsPreview ? (
          <View className="px-5 py-2 border-b border-border gap-1">
            {itemsPreview.items.map((item, idx) => {
              const itemStatus = getEffectiveItemStatus(item);
              const statusColor = KITCHEN_STATUS_COLORS[itemStatus as keyof typeof KITCHEN_STATUS_COLORS];
              return (
                <View key={idx} className="flex-row items-center justify-between py-0.5">
                  <Text className="text-label text-sm flex-1" numberOfLines={1}>
                    {item.quantity}x {item.name}
                  </Text>
                  {statusColor ? (
                    <Text style={{ color: statusColor }} className="text-xs ml-2">
                      {itemStatus}
                    </Text>
                  ) : null}
                </View>
              );
            })}
            {itemsPreview.remaining > 0 && (
              <Text className="text-muted text-xs mt-0.5">
                +{itemsPreview.remaining} more {itemsPreview.remaining === 1 ? "item" : "items"}
              </Text>
            )}
          </View>
        ) : null}

        {/* Actions */}
        <View className="px-5 py-4 gap-3">
          {actions.length > 0 ? (
            actions.map((action, idx) => (
              <TouchableOpacity
                key={idx}
                onPress={() => {
                  action.onPress();
                  sheetRef.current?.dismiss();
                }}
                activeOpacity={0.7}
                className={`flex-row items-center px-4 py-3 rounded-lg border border-border ${
                  action.variant === "primary"
                    ? "bg-teal/20"
                    : action.variant === "danger"
                      ? "bg-red-900/20"
                      : "bg-surface"
                }`}
              >
                <View className="mr-3">{action.icon}</View>
                <Text
                  className={`font-semibold text-base ${
                    action.variant === "primary"
                      ? "text-teal"
                      : action.variant === "danger"
                        ? "text-red-400"
                        : "text-label"
                  }`}
                >
                  {action.label}
                </Text>
              </TouchableOpacity>
            ))
          ) : (
            <Text className="text-muted text-center py-4">No actions available</Text>
          )}
        </View>
      </BottomSheetScrollView>
    </BottomSheetModal>
  );
};

export default TableContextSheet;
