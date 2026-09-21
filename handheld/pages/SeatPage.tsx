import { colors } from "@/lib/theme";
import { useEmployeeStore } from "@/stores/useEmployeeStore";
import { useFloorPlanStore } from "@/stores/useFloorPlanStore";
import { useTableAnywhere } from "../hooks/useFloors";
import { StickyNote } from "lucide-react-native";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import { ScrollView, Text, TextInput, View } from "react-native";
import { tableTitle } from "../lib/tableName";
import { type } from "../lib/type";
import { PageHeader, StickyActionBar } from "../primitives";
import { GuestCountGrid } from "../screens/seat/GuestCountGrid";
import { useSeatTable } from "../screens/seat/useSeatTable";

/** Screen 2: guest count and nothing else, then straight to the check. Route: /handheld/seat/[tableId]. */
export default function SeatPage({ tableId }: { tableId: string }) {
  const router = useRouter();
  const { table } = useTableAnywhere(tableId);
  const planName = useFloorPlanStore(
    (s) => s.floorPlans.find((p) => p.id === table?.floor_plan_id)?.name ?? "",
  );
  const me = useEmployeeStore((s) => s.loggedInEmployee?.displayName ?? null);
  const { seat, busy } = useSeatTable(tableId);
  const [guests, setGuests] = useState(() => Math.min(table?.capacity ?? 2, 8) || 2);
  const [note, setNote] = useState("");

  const name = table ? tableTitle(table.name, []) : "Table";
  const lower = name.charAt(0).toLowerCase() + name.slice(1);
  const seatLabel = guests === 1 ? "Seat 1 guest" : `Seat ${guests} guests`;

  const submit = () => {
    if (seat(guests, note)) router.replace({ pathname: "/handheld/table/[id]", params: { id: tableId } });
  };

  return (
    <View className="flex-1" style={{ backgroundColor: colors.screen }}>
      <PageHeader
        title={`Seat ${lower}`}
        subtitle={[planName, table?.capacity ? `seats ${table.capacity}` : ""].filter(Boolean).join(" · ") || undefined}
        onBack={() => router.back()}
      />
      <ScrollView className="flex-1" keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 16 }}>
        <View className="items-center pb-8" style={{ paddingTop: 40 }}>
          <Text style={{ fontSize: 88, fontWeight: "700", lineHeight: 92, letterSpacing: -3.5, color: colors.heading, fontVariant: ["tabular-nums"] }}>
            {guests}
          </Text>
          <Text className="mt-2" style={[type.value, { fontWeight: "400", color: colors.label }]}>
            {guests === 1 ? "guest" : "guests"}
          </Text>
        </View>
        <GuestCountGrid value={guests} onChange={setGuests} />
        <View className="mx-4 flex-row items-center gap-3 rounded-full px-5" style={{ marginTop: 14, minHeight: 56, backgroundColor: colors.panel }}>
          <StickyNote size={20} color={colors.muted} />
          <TextInput
            value={note}
            onChangeText={setNote}
            placeholder="Add a note"
            placeholderTextColor={colors.muted}
            className="flex-1 py-0"
            style={[type.value, { fontWeight: "400", color: colors.heading }]}
            accessibilityLabel="Seating note"
          />
        </View>
      </ScrollView>
      <StickyActionBar
        column
        actions={[{ label: seatLabel, onPress: submit, disabled: busy || !table }]}
        hint={me ? `You'll be the server for ${lower}` : undefined}
      />
    </View>
  );
}
