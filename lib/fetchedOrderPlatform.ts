import { isOnlineOrderSource } from "@/lib/orderSource";

/** `online_orders` row as joined by `getHistoryOrders`. */
export interface OnlineOrderJoinRow {
  order_id: string;
  provider?: string | null;
  delivery_company?: string | null;
}

/** The `orders` columns that determine online/platform identity. */
export interface OrderPlatformColumns {
  order_source?: string | null;
  delivery_platform?: string | null;
}

export interface FetchedOrderPlatform {
  isOnlineOrder: boolean;
  /** Raw platform token; feed to `resolveOrderPlatformLogo` for display. */
  deliveryPlatform: string | null;
}

/**
 * Decide whether a fetched order is online, and which platform it belongs to.
 *
 * Both answers were previously derived inline in `_transformFetchedOrder` and
 * both were wrong in ways that only showed up on the Previous Orders screen:
 *
 * 1. **Online-ness** was tested by the presence of an `online_orders` join row
 *    alone. Website / QR orders can land without one, so they fell onto the
 *    Takeaway tab — while the broadcast path, which tests `order_source`,
 *    called the same order online. The two are OR'd here so every path agrees.
 *
 * 2. **Platform** preferred `online_orders.provider` over
 *    `orders.delivery_platform`. `provider` records how an order was INGESTED
 *    ('website', 'orderout'), not who fulfils it — so a Grubhub order placed
 *    through the web storefront (provider='website', delivery_company=null,
 *    delivery_platform='grubhub') was rewritten to 'website' and rendered as
 *    House, even as the provider chips (built from `orders.delivery_platform`)
 *    correctly showed Grubhub. `provider` is now the last resort.
 */
export function resolveFetchedOrderPlatform(
  order: OrderPlatformColumns,
  joinRows: OnlineOrderJoinRow[] | null | undefined,
): FetchedOrderPlatform {
  const hasJoinRow = Array.isArray(joinRows) && joinRows.length > 0;
  const join = hasJoinRow ? joinRows![0] : null;

  return {
    isOnlineOrder: hasJoinRow || isOnlineOrderSource(order.order_source),
    deliveryPlatform:
      join?.delivery_company ??
      order.delivery_platform ??
      join?.provider ??
      null,
  };
}
