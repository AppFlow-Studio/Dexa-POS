import type { CartItem, OrderProfile } from "@/lib/types";
import { useOrderStore } from "@/stores/useOrderStore";
import React from "react";
import { orderKind } from "../../lib/checks";
import { formatCurrency } from "../../lib/format";
import { Card, CardHeader, SentDisc, WarnChip } from "./Card";
import { LineItem } from "./LineItem";
import { Totals } from "./Totals";

interface Course {
  number: number;
  items: CartItem[];
  sent: boolean;
  total: number;
}

/** Live items grouped by course; a course is "sent" once every item left. */
function courses(order: OrderProfile): Course[] {
  const byNumber = new Map<number, CartItem[]>();
  for (const item of order.items) {
    if (item.is_voided) continue;
    const n = item.courseNumber ?? 1;
    const list = byNumber.get(n) ?? [];
    list.push(item);
    byNumber.set(n, list);
  }
  return [...byNumber.entries()]
    .sort(([a], [b]) => a - b)
    .map(([number, items]) => ({
      number,
      items,
      sent: items.every((i) => i.kitchen_status && i.kitchen_status !== "new"),
      total: items.reduce((sum, i) => sum + i.price * i.quantity, 0),
    }));
}

function countLabel(items: CartItem[]): string {
  const n = items.reduce((sum, i) => sum + i.quantity, 0);
  return n === 1 ? "1 item" : `${n} items`;
}

/**
 * Screen 5 / S3 as a read-only body: course cards then the totals. The
 * artifact folds sent courses to one line; on a page whose whole point is
 * seeing the check, the items stay listed under the "Sent" header instead.
 */
export function CheckBody({ orderId }: { orderId: string }) {
  const order = useOrderStore((s) => s.ordersById[orderId]);
  if (!order) return null;
  const list = courses(order);
  const dineIn = orderKind(order) === "dine_in";
  const singleCourse = list.length === 1;

  return (
    <>
      {list.map((course) => {
        const title = dineIn && !singleCourse ? `Course ${course.number}` : "Items";
        return (
          <Card key={course.number}>
            {course.sent ? (
              <CardHeader
                leading={<SentDisc />}
                title={title}
                detail={`Sent · ${countLabel(course.items)}`}
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
              <LineItem key={item.id} item={item} />
            ))}
          </Card>
        );
      })}
      <Totals order={order} />
    </>
  );
}
