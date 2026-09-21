import { colors } from "@/lib/theme";
import React, { useState } from "react";
import { TextInput, View } from "react-native";
import { type } from "../../lib/type";
import { BottomSheet, ListRow, StickyActionBar } from "../../primitives";

/** VoidItemDialog's PREDEFINED_REASONS, in its order. */
const REASONS = ["Customer changed mind", "Out of stock", "Wrong item ordered", "Quality issue"] as const;

/**
 * The register's void dialog as a sheet: one of its reasons, or a typed one.
 * The reason goes on the line (`void_reason`) and the kitchen is told.
 */
export function VoidReasonSheet({ itemName, onPick, onClose }: { itemName: string; onPick: (reason: string) => void; onClose: () => void }) {
  const [other, setOther] = useState("");
  const typed = other.trim();
  return (
    <BottomSheet
      visible
      onClose={onClose}
      title="Void item"
      subtitle={`${itemName} · a manager approves next`}
      footer={<StickyActionBar actions={[{ label: "Continue", disabled: !typed, onPress: () => onPick(typed) }]} />}
    >
      <View className="pb-2">
        {REASONS.map((reason, i) => (
          <ListRow key={reason} title={reason} divider={i > 0} onPress={() => onPick(reason)} />
        ))}
      </View>
      <View className="mx-4 mb-2 px-5 py-3" style={{ borderRadius: 18, backgroundColor: colors.card }}>
        <TextInput
          value={other}
          onChangeText={setOther}
          placeholder="Another reason"
          placeholderTextColor={colors.muted}
          style={[type.row, { fontWeight: "400", color: colors.heading }]}
          accessibilityLabel="Other void reason"
        />
      </View>
    </BottomSheet>
  );
}
