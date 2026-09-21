import type { CartItem } from "@/lib/types";
import React, { useState } from "react";
import { BottomSheet, StickyActionBar } from "../../primitives";
import { NoteField } from "../NoteField";

/** A line's note: ModifierScreen's "special instructions", kept in `customizations.notes`. */
export function ItemNoteSheet({ item, onSave, onClose }: { item: CartItem; onSave: (notes: string) => void; onClose: () => void }) {
  const [notes, setNotes] = useState(item.customizations.notes ?? "");
  return (
    <BottomSheet
      visible
      onClose={onClose}
      title={item.name}
      subtitle="Printed with the item on the kitchen ticket"
      footer={<StickyActionBar actions={[{ label: "Save note", onPress: () => onSave(notes.trim()) }]} />}
    >
      <NoteField value={notes} onChange={setNotes} placeholder="No onions, sauce on the side, allergy" label="Item note" autoFocus />
    </BottomSheet>
  );
}
