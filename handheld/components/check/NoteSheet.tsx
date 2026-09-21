import { colors } from "@/lib/theme";
import { useOrderStore } from "@/stores/useOrderStore";
import React, { useState } from "react";
import { TextInput, View } from "react-native";
import { type } from "../../lib/type";
import { BottomSheet, StickyActionBar } from "../../primitives";

/** "Add a note": the order-level note the register keeps in `order.notes`. */
export function NoteSheet({ orderId, onSave, onClose }: { orderId: string; onSave: (notes: string) => void; onClose: () => void }) {
  const initial = useOrderStore((s) => s.ordersById[orderId]?.notes ?? "");
  const [notes, setNotes] = useState(initial);
  return (
    <BottomSheet
      visible
      onClose={onClose}
      title="Add a note"
      subtitle="Printed on the kitchen ticket"
      footer={<StickyActionBar actions={[{ label: "Save note", onPress: () => onSave(notes) }]} />}
    >
      <View className="mx-4 mb-2 px-5 py-3" style={{ borderRadius: 18, backgroundColor: colors.card }}>
        <TextInput
          value={notes}
          onChangeText={setNotes}
          placeholder="Allergies, timing, anything the kitchen should know"
          placeholderTextColor={colors.muted}
          multiline
          autoFocus
          textAlignVertical="top"
          style={[type.row, { fontWeight: "400", color: colors.heading, minHeight: 96 }]}
          accessibilityLabel="Order note"
        />
      </View>
    </BottomSheet>
  );
}
