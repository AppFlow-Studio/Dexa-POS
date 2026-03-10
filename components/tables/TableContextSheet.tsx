import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetView,
} from "@gorhom/bottom-sheet";
import { bottomSheetTheme, colors, TABLE_STATUS_COLORS } from "@/lib/theme";
import { useFloorPlanStore } from "@/stores/useFloorPlanStore";
import { useTableSessionStore } from "@/stores/useTableSessionStore";
import { FloorPlanObject, TableStatus } from "@/types/db-floor-plan-types";
import {
  ChevronUp,
  DollarSign,
  LogOut,
  Trash2,
  Unlock,
  Users,
} from "lucide-react-native";
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
        onPress: () => updateSessionStatus(table.id, "available"),
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

const TableContextSheet: React.FC<TableContextSheetProps> = ({
  table,
  onClose,
  onSeatGuests,
  onNavigate,
}) => {
  const sheetRef = useRef<BottomSheet>(null);
  const snapPoints = useMemo(() => ["45%"], []);

  const clearTableSession = useFloorPlanStore((s) => s.clearTableSession);
  const updateSessionStatus = useFloorPlanStore((s) => s.updateSessionStatus);

  // Sync sheet open/close with table selection
  useEffect(() => {
    if (table) {
      sheetRef.current?.expand();
    } else {
      sheetRef.current?.close();
    }
  }, [table]);

  const handleClose = useCallback(() => {
    sheetRef.current?.close();
    // Defer onClose to allow sheet animation to complete
    setTimeout(() => onClose(), 300);
  }, [onClose]);

  const liveSession = useTableSessionStore((s) => table ? s.sessions[table.id] : undefined);
  const status = (liveSession?.status ?? table?.session?.status) || "available";
  const tableColor = TABLE_STATUS_COLORS[status] || colors.info;

  const actions = useMemo(
    () =>
      table
        ? getActionsForStatus(
            status as TableStatus,
            table,
            onSeatGuests,
            onNavigate,
            (id) => clearTableSession(id),
            (id, s) => updateSessionStatus(id, s),
          )
        : [],
    [table, status, onSeatGuests, onNavigate, clearTableSession, updateSessionStatus],
  );

  if (!table) return null;

  return (
    <BottomSheet
      ref={sheetRef}
      snapPoints={snapPoints}
      onClose={handleClose}
      backdropComponent={BottomSheetBackdrop}
      backgroundStyle={bottomSheetTheme.backgroundStyle}
      handleIndicatorStyle={bottomSheetTheme.handleIndicatorStyle}
      enablePanDownToClose
    >
      <BottomSheetView style={{ paddingBottom: 20 }}>
        {/* Header */}
        <View className="px-5 py-3 border-b border-border">
          <View className="flex-row items-center gap-3 mb-2">
            <View
              style={{
                width: 12,
                height: 12,
                borderRadius: 6,
                backgroundColor: tableColor,
              }}
            />
            <Text className="text-white font-bold text-lg flex-1">
              {table.name}
            </Text>
            <Text className="text-muted text-sm">{status}</Text>
          </View>
          {table.session?.party_size ? (
            <Text className="text-label text-sm">
              {table.session.party_size} guests
              {table.session.guest_name && ` • ${table.session.guest_name}`}
            </Text>
          ) : null}
        </View>

        {/* Actions */}
        <View className="px-5 py-4 gap-3">
          {actions.length > 0 ? (
            actions.map((action, idx) => (
              <TouchableOpacity
                key={idx}
                onPress={async () => {
                  action.onPress();
                  handleClose();
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
      </BottomSheetView>
    </BottomSheet>
  );
};

export default TableContextSheet;
