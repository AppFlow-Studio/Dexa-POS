import { colors } from "@/lib/theme";
import { useActiveOrder } from "@/stores/selectors/orderSelectors";
import { useCustomerSheetStore } from "@/stores/useCustomerSheetStore";
import { useFloorPlanStore } from "@/stores/useFloorPlanStore";
import { useOrderStore } from "@/stores/useOrderStore";
import { Minus, Plus } from "lucide-react-native";
import React, { useEffect, useMemo, useState } from "react";
import { Text, TouchableOpacity, View } from "react-native";

interface OrderInfoHeaderProps {
  duration?: string;
  tableId?: string;
  onOpenServerSheet?: () => void;
}

const OrderInfoHeader: React.FC<OrderInfoHeaderProps> = ({ duration, tableId, onOpenServerSheet }) => {
  const updateActiveOrderDetails = useOrderStore((s) => s.updateActiveOrderDetails);
  const tablesById = useFloorPlanStore((s) => s.tablesById);
  const activeOrder = useActiveOrder();
  const openCustomerSheet = useCustomerSheetStore((s) => s.openSheet);

  const [numberOfGuests, setNumberOfGuests] = useState(1);

  const table = useMemo(() => {
    if (tableId) {
      const t = tablesById[tableId];
      if (t) return t;
    }
    if (!activeOrder?.service_location_id) return null;
    return tablesById[activeOrder.service_location_id] || null;
  }, [tablesById, tableId, activeOrder?.service_location_id]);

  const guestCount = activeOrder?.guest_count || table?.session?.party_size || 1;

  useEffect(() => {
    setNumberOfGuests(guestCount);
  }, [guestCount]);

  const handleGuestCountChange = (newCount: number) => {
    const count = Math.max(1, newCount);
    setNumberOfGuests(count);
    if (activeOrder) updateActiveOrderDetails({ guest_count: count });
  };

  const getTableDisplayName = () => {
    if (!table) return "N/A";
    const session = table.session;
    if (session?.merged_tables && session.merged_tables.length > 0) {
      const mergedNames = Object.values(tablesById)
        .filter((t) => session.merged_tables?.includes(t.id) && t.id !== table.id)
        .map((t) => t.name)
        .join(", ");
      return mergedNames ? `${table.name} (+ ${mergedNames})` : table.name;
    }
    return table.name;
  };

  if (!activeOrder) return null;

  return (
    <View style={{ borderBottomWidth: 1, borderBottomColor: colors.border, paddingHorizontal: 12, paddingVertical: 6, flexDirection: 'row', alignItems: 'center', gap: 6 }}>

      {/* Table */}
      <View style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }}>
        <Text style={{ fontSize: 9, color: colors.muted, letterSpacing: 0.5, marginBottom: 1 }}>TABLE</Text>
        <Text style={{ fontSize: 12, fontWeight: '700', color: colors.heading }}>{getTableDisplayName()}</Text>
      </View>

      {/* Guests */}
      <View style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }}>
        <Text style={{ fontSize: 9, color: colors.muted, letterSpacing: 0.5, marginBottom: 1 }}>GUESTS</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <TouchableOpacity onPress={() => handleGuestCountChange(numberOfGuests - 1)} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
            <Minus color={colors.label} size={11} />
          </TouchableOpacity>
          <Text style={{ fontSize: 12, fontWeight: '700', color: colors.heading, minWidth: 16, textAlign: 'center' }}>{numberOfGuests}</Text>
          <TouchableOpacity onPress={() => handleGuestCountChange(numberOfGuests + 1)} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
            <Plus color={colors.label} size={11} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Server */}
      <TouchableOpacity
        onPress={onOpenServerSheet}
        style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, backgroundColor: activeOrder.server_name ? colors.card : colors.teal + '10', borderWidth: 1, borderColor: activeOrder.server_name ? colors.border : colors.teal + '40' }}
      >
        <Text style={{ fontSize: 9, color: activeOrder.server_name ? colors.muted : colors.teal, letterSpacing: 0.5, marginBottom: 1 }}>SERVER</Text>
        <Text style={{ fontSize: 12, fontWeight: '600', color: activeOrder.server_name ? colors.label : colors.teal }}>
          {activeOrder.server_name || '— Assign'}
        </Text>
      </TouchableOpacity>

      {/* Customer */}
      <TouchableOpacity
        onPress={openCustomerSheet}
        style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, backgroundColor: activeOrder.customer_name ? colors.card : colors.teal + '10', borderWidth: 1, borderColor: activeOrder.customer_name ? colors.border : colors.teal + '40' }}
      >
        <Text style={{ fontSize: 9, color: activeOrder.customer_name ? colors.muted : colors.teal, letterSpacing: 0.5, marginBottom: 1 }}>CUSTOMER</Text>
        <Text style={{ fontSize: 12, fontWeight: '600', color: activeOrder.customer_name ? colors.label : colors.teal }}>
          {activeOrder.customer_name || '— Assign'}
        </Text>
      </TouchableOpacity>

      {/* Duration */}
      {duration && (
        <View style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }}>
          <Text style={{ fontSize: 9, color: colors.muted, letterSpacing: 0.5, marginBottom: 1 }}>TIME</Text>
          <Text style={{ fontSize: 12, fontWeight: '600', color: colors.label }}>{duration}</Text>
        </View>
      )}

    </View>
  );
};

export default OrderInfoHeader;
