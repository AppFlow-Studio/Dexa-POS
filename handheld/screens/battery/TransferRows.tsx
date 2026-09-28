import { colors } from "@/lib/theme";
import { ChevronRight } from "lucide-react-native";
import React from "react";
import { Pressable, Text, View } from "react-native";
import { Avatar } from "../../components/Avatar";
import { Checkbox } from "../../components/Checkbox";
import { useOrderByDbId } from "../../hooks/useOrderByDbId";
import { formatCurrency } from "../../lib/format";
import { tint } from "../../lib/tokens";
import { type } from "../../lib/type";
import type { MyOpenTable } from "./useMyOpenTables";

/** The artifact's `.bs-row`: 58dp, checkbox, table, live check total. */
export function TransferTableRow({
  table,
  checked,
  divider,
  onToggle,
}: {
  table: MyOpenTable;
  checked: boolean;
  divider: boolean;
  onToggle: (tableId: string) => void;
}) {
  const total = useOrderByDbId(table.orderDbId)?.total_amount;
  return (
    <Pressable
      onPress={() => onToggle(table.tableId)}
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      className="flex-row items-center"
      style={{ minHeight: 58, paddingHorizontal: 18, gap: 14 }}
    >
      {divider ? (
        <View pointerEvents="none" style={{ position: "absolute", top: 0, left: 54, right: 18, height: 1, backgroundColor: tint.divider }} />
      ) : null}
      <Checkbox checked={checked} />
      <Text className="flex-1" style={[type.line, { color: colors.heading }]} numberOfLines={1}>
        {table.title}
      </Text>
      {total !== undefined ? <Text style={[type.sum, { color: colors.label }]}>{formatCurrency(total)}</Text> : null}
    </Pressable>
  );
}

/** The artifact's `.bs-to`: "Transfer to", then who, then a chevron to change it. */
export function TransferToRow({ name, onPress }: { name: string | null; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={name ? `Transfer to ${name}. Change` : "Choose who to transfer to"}
      className="mx-4 flex-row items-center"
      style={{ minHeight: 58, marginTop: 10, borderRadius: 22, paddingLeft: 18, paddingRight: 14, gap: 12, backgroundColor: colors.card }}
    >
      <Text className="flex-1" style={[type.line, { fontWeight: "400", color: colors.label }]}>
        Transfer to
      </Text>
      {name ? (
        <View className="flex-row items-center" style={{ gap: 8 }}>
          <Avatar name={name} small />
          <Text style={[type.line, { color: colors.heading }]} numberOfLines={1}>
            {name}
          </Text>
        </View>
      ) : (
        <Text style={[type.line, { color: colors.teal }]}>Choose</Text>
      )}
      <ChevronRight size={20} color={colors.muted} />
    </Pressable>
  );
}
