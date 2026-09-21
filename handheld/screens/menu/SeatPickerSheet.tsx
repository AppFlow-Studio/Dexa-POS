import { useOrderStore } from "@/stores/useOrderStore";
import React from "react";
import { View } from "react-native";
import { useShallow } from "zustand/react/shallow";
import { BottomSheet, ListRow } from "../../primitives";

/** Item count per seat, index 0 = shared; 0 where the seat is empty. */
function useSeatCounts(orderId: string, count: number): number[] {
  return useOrderStore(
    useShallow((s) => {
      const counts = new Array<number>(count + 1).fill(0);
      for (const item of s.ordersById[orderId]?.items ?? []) {
        if (item.is_voided || item.isDraft) continue;
        const seat = item.seatNumber ?? 0;
        if (seat <= count) counts[seat] += item.quantity;
      }
      return counts;
    }),
  );
}

/**
 * The seat new items go to: "Shared" or one of the party's seats. The
 * register's seat accordion, as a list. `title` doubles for "Move to seat"
 * on an existing line.
 */
export function SeatPickerSheet({
  orderId,
  count,
  value,
  title = "Seat",
  onPick,
  onClose,
}: {
  orderId: string;
  count: number;
  value: number | null;
  title?: string;
  onPick: (seat: number | null) => void;
  onClose: () => void;
}) {
  const counts = useSeatCounts(orderId, count);
  const label = (seat: number | null) => {
    const n = counts[seat ?? 0];
    return n === 1 ? "1 item" : n ? `${n} items` : undefined;
  };
  return (
    <BottomSheet visible onClose={onClose} title={title} subtitle="Items go to this seat until you change it">
      <View className="pb-2">
        <ListRow title="Shared" detail={label(null)} selected={value === null} onPress={() => onPick(null)} />
        {Array.from({ length: count }, (_, i) => i + 1).map((seat) => (
          <ListRow
            key={seat}
            title={`Seat ${seat}`}
            detail={label(seat)}
            selected={value === seat}
            divider
            onPress={() => onPick(seat)}
          />
        ))}
      </View>
    </BottomSheet>
  );
}
