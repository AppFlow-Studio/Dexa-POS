/**
 * Per-item "TO GO" flag — transform round-trip.
 *
 * mapBackendItemToCartItem is the single inbound mapper used by both the
 * realtime broadcast transform and the get_order_details / useOrdersQuery
 * fetch paths. If is_to_go survives this mapping, it survives reload and
 * cross-station sync (the server stores it as an order_items column that flows
 * through row_to_json / select *).
 */
import {
  mapBackendItemToCartItem,
  normalizeFetchedOrder,
  transformBroadcastToOrder,
  type FetchedOrderData,
} from '@/utils/orderTransformers'

const baseBackendItem = {
  id: 'oi-1',
  menu_item_id: 'menu-1',
  item_name: 'Fountain Drink (Cola)',
  quantity: 1,
  unit_price: 4,
  cash_price: 4,
  subtotal: 4,
  cash_subtotal: 4,
}

describe('mapBackendItemToCartItem — is_to_go', () => {
  it('maps is_to_go=true through to the CartItem', () => {
    const cartItem = mapBackendItemToCartItem(
      { ...baseBackendItem, is_to_go: true },
      undefined,
    )
    expect(cartItem.is_to_go).toBe(true)
    expect(cartItem.name).toBe('Fountain Drink (Cola)')
  })

  it('defaults is_to_go to false when the backend omits it', () => {
    const cartItem = mapBackendItemToCartItem(baseBackendItem, undefined)
    expect(cartItem.is_to_go).toBe(false)
  })

  it('maps is_to_go=false (and null) to false', () => {
    expect(
      mapBackendItemToCartItem({ ...baseBackendItem, is_to_go: false }, undefined)
        .is_to_go,
    ).toBe(false)
    expect(
      mapBackendItemToCartItem({ ...baseBackendItem, is_to_go: null }, undefined)
        .is_to_go,
    ).toBe(false)
  })
})

describe('cold-start fetch (normalizeFetchedOrder → transformBroadcastToOrder)', () => {
  // Regression: normalizeFetchedItems rebuilds each item from a field whitelist.
  // is_to_go must survive that whitelist or the cold-start hydrate overwrites the
  // MMKV-restored flag with false on every restart.
  const fetchedOrder: FetchedOrderData = {
    id: 'order-1',
    order_number: '0022',
    display_number: '22',
    merchant_id: 'm-1',
    location_id: 'loc-1',
    order_type: 'dine_in',
    status: 'sent_to_kitchen',
    created_at: '2026-06-16T10:00:00Z',
    updated_at: '2026-06-16T10:00:00Z',
    order_items: [
      {
        id: 'oi-1',
        item_name: 'Fountain Drink (Cola)',
        quantity: 1,
        unit_price: 4,
        base_card_price: 4,
        base_cash_price: 4,
        is_to_go: true,
      },
    ],
  }

  it('preserves is_to_go through the cold-start transform', () => {
    const order = transformBroadcastToOrder(normalizeFetchedOrder(fetchedOrder))
    expect(order.items).toHaveLength(1)
    expect(order.items[0].is_to_go).toBe(true)
  })
})
