import { colors } from "@/lib/theme";
import type { CartItem, OrderProfile } from "@/lib/types";
import { useOrderStore } from "@/stores/useOrderStore";
import { Plus } from "lucide-react-native";
import React from "react";
import { Pressable, Text, View } from "react-native";
import { orderKind } from "../../lib/checks";
import { formatClock, formatCurrency } from "../../lib/format";
import { tint } from "../../lib/tokens";
import { type } from "../../lib/type";
import { Card, CardHeader, SentDisc, WarnChip } from "./Card";
import { LineItem } from "./LineItem";
import { Totals } from "./Totals";

interface Course {
  number: number;
  items: CartItem[];
  sent: boolean;
  /** Sent from this device but still in the outbox: the kitchen has not seen it. */
  queued: boolean;
  total: number;
}

/** Live items grouped by course; a course is "sent" once every item left. */
function courses(order: OrderProfile): Course[] {
  const byNumber = new Map<number, CartItem[]>();
  for (const item of order.items) {
    if (item.is_voided || item.isDraft) continue;
    const n = item.courseNumber ?? 1;
    const list = byNumber.get(n) ?? [];
    list.push(item);
    byNumber.set(n, list);
  }
  return [...byNumber.entries()]
    .sort(([a], [b]) => a - b)
    .map(([number, items]) => {
      const sent = items.every((i) => i.kitchen_status && i.kitchen_status !== "new");
      return {
        number,
        items,
        sent,
        queued: sent && items.some((i) => i.sync_status === "pending" || i.sync_status === "syncing"),
        total: items.reduce((sum, i) => sum + i.price * i.quantity, 0),
      };
    });
}

function countLabel(items: CartItem[]): string {
  const n = items.reduce((sum, i) => sum + i.quantity, 0);
  return n === 1 ? "1 item" : `${n} items`;
}

/** The artifact's `.addr`: the "Add items" row at the foot of the open course. */
function AddItemsRow({ onPress, divider = true }: { onPress: () => void; divider?: boolean }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" className="flex-row items-center gap-3 px-4" style={{ minHeight: 56 }}>
      {divider ? (
        <View pointerEvents="none" style={{ position: "absolute", top: 0, left: 16, right: 16, height: 1, backgroundColor: tint.divider }} />
      ) : null}
      <Plus size={22} color={colors.teal} />
      <Text style={[type.value, { color: colors.teal }]}>Add items</Text>
    </Pressable>
  );
}

/**
 * Screen 5 / S3 body: course cards then the totals. The artifact folds sent
 * courses to one line; on a page whose whole point is seeing the check, the
 * items stay listed under the "Sent" header instead. `onAddItems` puts the
 * "Add items" row on the open course (or its own card when all are sent);
 * `onPressItem` makes every line tappable.
 */
export function CheckBody({
  orderId,
  onAddItems,
  onPressItem,
}: {
  orderId: string;
  onAddItems?: () => void;
  /** Opens the item sheet for a line; absent on a read-only check. */
  onPressItem?: (item: CartItem) => void;
}) {
  const order = useOrderStore((s) => s.ordersById[orderId]);
  if (!order) return null;
  const list = courses(order);
  const dineIn = orderKind(order) === "dine_in";
  const singleCourse = list.length <= 1;
  const sentAt = formatClock(order.sent_to_kitchen_at);
  const sentLabel = sentAt ? `Sent ${sentAt}` : "Sent";
  const open = list.find((c) => !c.sent);

  return (
    <>
      {list.map((course) => {
        const title = dineIn && !singleCourse ? `Course ${course.number}` : "Items";
        return (
          <Card key={course.number}>
            {course.queued ? (
              <CardHeader title={title} detail="Kitchen hasn't received it yet" trailing={<WarnChip label="Queued" />} />
            ) : course.sent ? (
              <CardHeader
                leading={<SentDisc />}
                title={title}
                detail={`${sentLabel} · ${countLabel(course.items)}`}
                value={formatCurrency(course.total)}
              />
            ) : (
              <CardHeader
                title={title}
                detail={`${countLabel(course.items)} · ${formatCurrency(course.total)}`}
                trailing={<WarnChip label="Not sent" />}
              />
            )}
            {course.items.map((item) => (
              <LineItem key={item.id} item={item} onPress={onPressItem} />
            ))}
            {onAddItems && course === open ? <AddItemsRow onPress={onAddItems} /> : null}
          </Card>
        );
      })}
      {onAddItems && !open ? (
        <Card>
          <AddItemsRow onPress={onAddItems} divider={false} />
        </Card>
      ) : null}
      <Totals order={order} />
    </>
  );
}
