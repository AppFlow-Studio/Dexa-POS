import type { CartItem } from "@/lib/types";
import { Armchair, Layers, SlidersHorizontal, StickyNote, Trash2 } from "lucide-react-native";
import React from "react";
import { View } from "react-native";
import { formatCurrency } from "../../lib/format";
import { BottomSheet } from "../../primitives";
import { QuantityRow } from "../../screens/menu/Stepper";
import { ActionRow } from "./ActionRow";

/** "2 × $29.00 · Seat 2 · Course 1" under the item name. */
function itemSubtitle(item: CartItem, seats: boolean, courses: boolean): string {
  const parts = [`${item.quantity} × ${formatCurrency(item.price)}`];
  if (seats) parts.push(item.seatNumber ? `Seat ${item.seatNumber}` : "Shared");
  if (courses) parts.push(`Course ${item.courseNumber ?? 1}`);
  return parts.join(" · ");
}

/**
 * One line's sheet, two modes. Unsent: quantity, options, note, seat,
 * course, remove. Sent: note, seat, and void behind the Manager pill (the
 * kitchen already has it, so no quantity / options / course). The register
 * opens a sent line view-only; the note stays editable here because a
 * server on the floor hears about the allergy after the send.
 * `seats` / `courses` follow the check, as on the menu page.
 */
export function ItemSheet({
  item,
  sent,
  seats,
  courses,
  onQuantity,
  onOptions,
  onNote,
  onSeat,
  onCourse,
  onRemove,
  onVoid,
  onClose,
}: {
  item: CartItem;
  sent: boolean;
  seats: boolean;
  courses: boolean;
  onQuantity: (n: number) => void;
  onOptions: () => void;
  onNote: () => void;
  onSeat: () => void;
  onCourse: () => void;
  onRemove: () => void;
  onVoid: () => void;
  onClose: () => void;
}) {
  const seat = item.seatNumber ? `Seat ${item.seatNumber}` : "Shared";
  const noteLabel = item.customizations.notes ? "Edit note" : "Add a note";
  return (
    <BottomSheet visible onClose={onClose} title={item.name} subtitle={itemSubtitle(item, seats, courses)}>
      <View className="pb-6 pt-1">
        {sent ? (
          <>
            <ActionRow icon={StickyNote} label={noteLabel} divider={false} onPress={onNote} />
            {seats ? <ActionRow icon={Armchair} label="Move to seat" value={seat} divider onPress={onSeat} /> : null}
            <ActionRow icon={Trash2} label="Void item" gated danger divider onPress={onVoid} />
          </>
        ) : (
          <>
            <QuantityRow value={item.quantity} onChange={onQuantity} />
            <View style={{ height: 8 }} />
            {item.is_open_item ? null : <ActionRow icon={SlidersHorizontal} label="Edit options" divider onPress={onOptions} />}
            <ActionRow icon={StickyNote} label={noteLabel} divider onPress={onNote} />
            {seats ? <ActionRow icon={Armchair} label="Seat" value={seat} divider onPress={onSeat} /> : null}
            {courses ? <ActionRow icon={Layers} label="Course" value={`Course ${item.courseNumber ?? 1}`} divider onPress={onCourse} /> : null}
            <ActionRow icon={Trash2} label="Remove" danger divider onPress={onRemove} />
          </>
        )}
      </View>
    </BottomSheet>
  );
}
