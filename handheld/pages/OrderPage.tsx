import { useOrderStore } from "@/stores/useOrderStore";
import React from "react";
import { checkNumber, checkTitle, orderKind, orderKindLabel } from "../lib/checks";
import { CheckPage } from "./CheckPage";

/** Screen S3, read-only: "Order #1045 / Takeout · Ben K.". Route: /handheld/order/[id]. */
export default function OrderPage({ orderId }: { orderId: string }) {
  const order = useOrderStore((s) => s.ordersById[orderId]);
  if (!order) {
    return <CheckPage title="Order" orderId={null} emptyText="This order is no longer open on this station." />;
  }
  const who = checkTitle(order).split(" · ")[1] ?? "";
  return (
    <CheckPage
      title={`Order ${checkNumber(order)}`}
      subtitle={[orderKindLabel(orderKind(order)), who].filter(Boolean).join(" · ")}
      orderId={order.id}
      emptyText=""
    />
  );
}
