import { colors } from "@/lib/theme";
import React, { useEffect, useMemo, useState } from "react";
import {
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useFloorPlanStore } from "@/stores/useFloorPlanStore";
import { useActiveOrder } from "@/stores/selectors/orderSelectors";
import { useOrderStore } from "@/stores/useOrderStore";
import { useCustomerSheetStore } from "@/stores/useCustomerSheetStore";
import { ChevronDown, Minus, Plus } from "lucide-react-native";
import ServerSelectSheet from "./ServerSelectSheet";

interface OrderInfoHeaderProps {
  duration?: string;
  tableId?: string;
}

const OrderInfoHeader: React.FC<OrderInfoHeaderProps> = ({ duration, tableId }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const activeOrderId = useOrderStore((s) => s.activeOrderId);
  const updateActiveOrderDetails = useOrderStore((s) => s.updateActiveOrderDetails);
  const tablesById = useFloorPlanStore((s) => s.tablesById);
  const activeOrder = useActiveOrder();
  const openCustomerSheet = useCustomerSheetStore((s) => s.openSheet);

  const [numberOfGuests, setNumberOfGuests] = useState(1);
  const [serverSheetOpen, setServerSheetOpen] = useState(false);

  const table = useMemo(() => {
    // Primary: use the tableId prop from route (always correct)
    if (tableId) {
      const t = tablesById[tableId];
      if (t) return t;
    }
    // Fallback: order's service_location_id
    if (!activeOrder?.service_location_id) return null;
    return tablesById[activeOrder.service_location_id] || null;
  }, [tablesById, tableId, activeOrder?.service_location_id]);

  const guestCount = activeOrder?.guest_count
    || table?.session?.party_size
    || 1;

  useEffect(() => {
    setNumberOfGuests(guestCount);
  }, [guestCount]);

  const handleServerSelect = (name: string) => {
    if (activeOrder) {
      updateActiveOrderDetails({ server_name: name });
    }
    setServerSheetOpen(false);
  };

  const handleGuestCountChange = (newCount: number) => {
    const count = Math.max(1, newCount);
    setNumberOfGuests(count);
    if (activeOrder) {
      updateActiveOrderDetails({ guest_count: count });
    }
  };

  const getTableDisplayName = () => {
    if (!table) return "N/A";
    const session = table.session;

    if (session?.merged_tables && session.merged_tables.length > 0) {
      const mergedNames = Object.values(tablesById)
        .filter((t) => session.merged_tables?.includes(t.id) && t.id !== table.id)
        .map((t) => t.name)
        .join(", ");

      return mergedNames ? `${table.name} (Merged with ${mergedNames})` : table.name;
    }

    return table.name;
  };

  if (!activeOrder) return null;

  if (!isExpanded) {
    return (
      <TouchableOpacity
        onPress={() => setIsExpanded(true)}
        activeOpacity={0.7}
        className="flex-row items-center px-3 py-2 border-b border-gray-700/50"
      >
        {/* Table name */}
        <Text className="text-gray-400 text-xs font-medium">
          {getTableDisplayName()}
        </Text>
        <Text className="text-gray-600 mx-2">·</Text>

        {/* Guest count */}
        <Text className="text-gray-400 text-xs">
          {guestCount} guest{guestCount !== 1 ? "s" : ""}
        </Text>
        <Text className="text-gray-600 mx-2">·</Text>

        {/* Customer — tappable to assign */}
        <TouchableOpacity onPress={openCustomerSheet}>
          <Text className="text-blue-400 text-xs font-medium">
            {activeOrder.customer_name || "Assign Customer"}
          </Text>
        </TouchableOpacity>

        {/* Duration (if present) */}
        {duration && (
          <>
            <Text className="text-gray-600 mx-2">·</Text>
            <Text className="text-gray-400 text-xs">{duration}</Text>
          </>
        )}

        {/* Expand chevron */}
        <View className="ml-auto p-1">
          <ChevronDown color={colors.muted} size={16} />
        </View>
      </TouchableOpacity>
    );
  }

  return (
    <>
      <View className="border-b border-gray-700/50">
        {/* Server */}
        <TouchableOpacity
          onPress={() => setServerSheetOpen(true)}
          className="flex-row items-center px-3 py-2.5 border-b border-gray-700/30"
        >
          <Text className="text-gray-500 text-xs w-20">Server</Text>
          <Text className={activeOrder.server_name ? "text-white text-sm" : "text-blue-400 text-sm"}>
            {activeOrder.server_name || "Assign Server"}
          </Text>
        </TouchableOpacity>

        {/* Customer */}
        <TouchableOpacity
          onPress={openCustomerSheet}
          className="flex-row items-center px-3 py-2.5 border-b border-gray-700/30"
        >
          <Text className="text-gray-500 text-xs w-20">Customer</Text>
          <Text className={activeOrder.customer_name ? "text-white text-sm" : "text-blue-400 text-sm"}>
            {activeOrder.customer_name || "Assign Customer"}
          </Text>
        </TouchableOpacity>

        {/* Guests */}
        <View className="flex-row items-center px-3 py-2 border-b border-gray-700/30">
          <Text className="text-gray-500 text-xs w-20">Guests</Text>
          <Text className="text-white text-sm flex-1">Number of people</Text>
          <View className="flex-row items-center gap-2 bg-surface p-1 rounded-full border border-gray-700">
            <TouchableOpacity
              onPress={() => handleGuestCountChange(numberOfGuests - 1)}
              className="p-1"
            >
              <Minus color={colors.label} size={12} />
            </TouchableOpacity>
            <Text className="text-sm font-bold text-white w-4 text-center">
              {numberOfGuests}
            </Text>
            <TouchableOpacity
              onPress={() => handleGuestCountChange(numberOfGuests + 1)}
              className="p-1 bg-blue-500 rounded-full"
            >
              <Plus color="#FFFFFF" size={12} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Table */}
        <View className="flex-row items-center px-3 py-2.5 border-b border-gray-700/30">
          <Text className="text-gray-500 text-xs w-20">Table</Text>
          <Text className="text-gray-300 text-sm">{getTableDisplayName()}</Text>
        </View>

        {/* Duration (only if present) */}
        {duration && (
          <View className="flex-row items-center px-3 py-2.5 border-b border-gray-700/30">
            <Text className="text-gray-500 text-xs w-20">Duration</Text>
            <Text className="text-white text-sm font-medium">{duration}</Text>
          </View>
        )}

        {/* Collapse */}
        <TouchableOpacity
          onPress={() => setIsExpanded(false)}
          className="items-center py-1.5"
        >
          <ChevronDown
            style={{ transform: [{ rotate: "180deg" }] }}
            color={colors.card}
            size={14}
          />
        </TouchableOpacity>
      </View>

      {/* Server selection sheet — outside layout View to avoid stealing space */}
      <ServerSelectSheet
        isOpen={serverSheetOpen}
        onClose={() => setServerSheetOpen(false)}
        onSelect={handleServerSelect}
        currentServer={activeOrder.server_name}
      />
    </>
  );
};

export default OrderInfoHeader;
