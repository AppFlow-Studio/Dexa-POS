import { useCoursingStore } from "@/stores/useCoursingStore";
import { useOrderStore } from "@/stores/useOrderStore";
import React from "react";
import { View } from "react-native";
import { useShallow } from "zustand/react/shallow";
import { BottomSheet, ListRow } from "../../primitives";

interface CourseRow {
  number: number;
  fired: boolean;
  items: number;
}

/**
 * Every course the check has (from its items and the coursing store), plus
 * one empty course after the last so a new one can be started, the way the
 * register's course tabs offer "+ course".
 */
function useCourseRows(orderId: string, current: number): CourseRow[] {
  const items = useOrderStore(
    useShallow((s) => {
      const counts: Record<number, number> = {};
      for (const item of s.ordersById[orderId]?.items ?? []) {
        if (item.is_voided || item.isDraft) continue;
        const n = item.courseNumber ?? 1;
        counts[n] = (counts[n] ?? 0) + item.quantity;
      }
      return counts;
    }),
  );
  const fired = useCoursingStore(
    useShallow((s) => {
      const out: Record<number, boolean> = {};
      for (const [n, info] of Object.entries(s.byOrderId[orderId]?.courses ?? {})) out[Number(n)] = info.status !== "open";
      return out;
    }),
  );
  const last = Math.max(1, current, ...Object.keys(items).map(Number), ...Object.keys(fired).map(Number));
  return Array.from({ length: last + 1 }, (_, i) => i + 1).map((number) => ({
    number,
    fired: !!fired[number],
    items: items[number] ?? 0,
  }));
}

/**
 * The course new items land on. Fired courses stay listed but cannot be
 * chosen (the kitchen already has them); the row after the last course is
 * the "next course". `title` doubles for "Move to course" on a line.
 */
export function CoursePickerSheet({
  orderId,
  value,
  title = "Course",
  onPick,
  onClose,
}: {
  orderId: string;
  value: number;
  title?: string;
  onPick: (course: number) => void;
  onClose: () => void;
}) {
  const rows = useCourseRows(orderId, value);
  const detail = (row: CourseRow) =>
    row.fired ? "Sent" : row.items === 1 ? "1 item" : row.items ? `${row.items} items` : "Empty";
  return (
    <BottomSheet visible onClose={onClose} title={title} subtitle="Items go on this course until you change it">
      <View className="pb-2">
        {rows.map((row, i) => (
          <ListRow
            key={row.number}
            title={`Course ${row.number}`}
            detail={detail(row)}
            selected={value === row.number}
            divider={i > 0}
            onPress={row.fired ? undefined : () => onPick(row.number)}
          />
        ))}
      </View>
    </BottomSheet>
  );
}
