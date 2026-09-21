import { useOrderStore } from "@/stores/useOrderStore";
import React, { useState } from "react";
import { BottomSheet, StickyActionBar } from "../../primitives";
import { NoteField } from "../NoteField";

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
      <NoteField value={notes} onChange={setNotes} placeholder="Allergies, timing, anything the kitchen should know" label="Order note" autoFocus />
    </BottomSheet>
  );
}
