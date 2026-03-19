import { colors } from "@/lib/theme";
import { useActiveOrder } from "@/stores/selectors/orderSelectors";
import { useCustomerSheetStore } from "@/stores/useCustomerSheetStore";
import { useFloorPlanStore } from "@/stores/useFloorPlanStore";
import { useOrderStore } from "@/stores/useOrderStore";
import { ChevronDown, Minus, Plus } from "lucide-react-native";
import React, { useEffect, useMemo, useState } from "react";
import { Text, TouchableOpacity, View } from "react-native";
import ServerSelectSheet from "./ServerSelectSheet";

interface OrderInfoHeaderProps {
  duration?: string;
  tableId?: string;
}

const OrderInfoHeader: React.FC<OrderInfoHeaderProps> = ({ duration, tableId }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const updateActiveOrderDetails = useOrderStore((s) => s.updateActiveOrderDetails);
  const tablesById = useFloorPlanStore((s) => s.tablesById);
  const activeOrder = useActiveOrder();
  const openCustomerSheet = useCustomerSheetStore((s) => s.openSheet);

  const [numberOfGuests, setNumberOfGuests] = useState(1);
  const [serverSheetOpen, setServerSheetOpen] = useState(false);

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

  const handleServerSelect = (name: string) => {
    if (activeOrder) updateActiveOrderDetails({ server_name: name });
    setServerSheetOpen(false);
  };

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

  // --- Collapsed breadcrumb ---
  if (!isExpanded) {
    return (
      <TouchableOpacity
        onPress={() => setIsExpanded(true)}
        activeOpacity={0.7}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: 12,
          paddingVertical: 8,
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
          gap: 0,
        }}
      >
        <Text style={{ fontSize: 12, color: colors.label, fontWeight: '500' }}>
          {getTableDisplayName()}
        </Text>
        <Text style={{ color: colors.border, marginHorizontal: 8 }}>·</Text>
        <Text style={{ fontSize: 12, color: colors.label }}>
          {guestCount} guest{guestCount !== 1 ? "s" : ""}
        </Text>
        {duration && (
          <>
            <Text style={{ color: colors.border, marginHorizontal: 8 }}>·</Text>
            <Text style={{ fontSize: 12, color: colors.label }}>{duration}</Text>
          </>
        )}
        <TouchableOpacity onPress={openCustomerSheet} style={{ marginLeft: 8 }}>
          <Text style={{ fontSize: 12, color: colors.teal, fontWeight: '500' }}>
            {activeOrder.customer_name || "Assign Customer"}
          </Text>
        </TouchableOpacity>
        <View style={{ marginLeft: 'auto' }}>
          <ChevronDown color={colors.muted} size={14} />
        </View>
      </TouchableOpacity>
    );
  }

  // --- Expanded detail panel ---
  const ROW_STYLE = {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border + '60',
  };
  const LABEL_STYLE = { fontSize: 11, color: colors.muted, width: 72, textTransform: 'uppercase' as const, letterSpacing: 0.4 };

  return (
    <>
      <View style={{ borderBottomWidth: 1, borderBottomColor: colors.border }}>
        {/* Server */}
        <TouchableOpacity onPress={() => setServerSheetOpen(true)} style={ROW_STYLE}>
          <Text style={LABEL_STYLE}>Server</Text>
          <Text style={{ fontSize: 13, color: activeOrder.server_name ? colors.heading : colors.teal }}>
            {activeOrder.server_name || "Assign Server"}
          </Text>
        </TouchableOpacity>

        {/* Customer */}
        <TouchableOpacity onPress={openCustomerSheet} style={ROW_STYLE}>
          <Text style={LABEL_STYLE}>Customer</Text>
          <Text style={{ fontSize: 13, color: activeOrder.customer_name ? colors.heading : colors.teal }}>
            {activeOrder.customer_name || "Assign Customer"}
          </Text>
        </TouchableOpacity>

        {/* Guests */}
        <View style={ROW_STYLE}>
          <Text style={LABEL_STYLE}>Guests</Text>
          <Text style={{ fontSize: 13, color: colors.label, flex: 1 }}>Party size</Text>
          <View style={{
            flexDirection: 'row', alignItems: 'center', gap: 8,
            backgroundColor: colors.screen, paddingHorizontal: 6, paddingVertical: 4,
            borderRadius: 20, borderWidth: 1, borderColor: colors.border
          }}>
            <TouchableOpacity onPress={() => handleGuestCountChange(numberOfGuests - 1)} style={{ padding: 2 }}>
              <Minus color={colors.label} size={12} />
            </TouchableOpacity>
            <Text style={{ fontSize: 13, fontWeight: '700', color: colors.heading, minWidth: 18, textAlign: 'center' }}>
              {numberOfGuests}
            </Text>
            <TouchableOpacity
              onPress={() => handleGuestCountChange(numberOfGuests + 1)}
              style={{ padding: 2, backgroundColor: colors.teal, borderRadius: 10 }}
            >
              <Plus color={colors.onSolid} size={12} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Table */}
        <View style={ROW_STYLE}>
          <Text style={LABEL_STYLE}>Table</Text>
          <Text style={{ fontSize: 13, color: colors.heading }}>{getTableDisplayName()}</Text>
        </View>

        {/* Duration */}
        {duration && (
          <View style={ROW_STYLE}>
            <Text style={LABEL_STYLE}>Duration</Text>
            <Text style={{ fontSize: 13, color: colors.heading, fontWeight: '600' }}>{duration}</Text>
          </View>
        )}

        {/* Collapse */}
        <TouchableOpacity
          onPress={() => setIsExpanded(false)}
          style={{ alignItems: 'center', paddingVertical: 6 }}
        >
          <ChevronDown
            style={{ transform: [{ rotate: "180deg" }] }}
            color={colors.border}
            size={14}
          />
        </TouchableOpacity>
      </View>

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
