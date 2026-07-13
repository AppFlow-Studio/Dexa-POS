/**
 * W1-2 Order Broadcast v3 payload trim — client hydration parity.
 *
 * The v3 trigger (migrations/20260713120000_broadcast_order_changes_v3_payload_trim.sql)
 * changes ONLY the payload shape:
 *   1. Drops 22 header fields no client reads from broadcasts.
 *   2. jsonb_strip_nulls() on each per-payment object, EXCEPT
 *      subtotal_portion / tax_portion which are re-attached (nullable +
 *      read uncoalesced by the transformer — must stay present-as-null so
 *      hydration output is byte-identical).
 *   3. Drops payment_items[].id (junction PK, never read).
 *
 * Acceptance criterion: a client hydrating a v3 payload produces output
 * BYTE-IDENTICAL to hydrating the v2 payload for the same order. Asserted
 * with toStrictEqual (distinguishes null vs undefined vs absent) AND
 * JSON.stringify equality (what MMKV persistence serializes).
 *
 * transactionDetails parity here also covers useOrderStore's
 * mergeTransactionDetails: it spreads TRANSFORMER OUTPUT (not raw payloads),
 * so identical transformer output ⇒ identical merge behavior.
 *
 * Fixtures mirror the exact SQL emit shape (coalesced defaults included).
 * Dropped header fields carry non-null values in the v2 fixture so any
 * FUTURE transformer read of a dropped field breaks parity here.
 */
import type {
  BroadcastOrderData,
  BroadcastOrderPaymentData
} from '@/hooks/realtime/useOrdersRealtime'
import {
  isHeaderOnlyBroadcast,
  transformBroadcastPaymentsToProfile,
  transformBroadcastToOrder
} from '@/utils/orderTransformers'

// ---------------------------------------------------------------------------
// v3 trim simulation — mirrors the migration SQL exactly
// ---------------------------------------------------------------------------

/** Header fields the v3 trigger no longer emits. */
const V3_DROPPED_HEADER_FIELDS = [
  'external_id',
  'merchant_id',
  'created_by_user_id',
  'seat_number',
  'subtotal',
  'tip_amount',
  'cash_subtotal',
  'cash_tax_amount',
  'cash_discount_applied',
  'cash_discount_amount',
  'effective_subtotal',
  'effective_tax_amount',
  'effective_total',
  'payment_pricing_mode',
  'started_preparing_at',
  'ready_at',
  'cancelled_at',
  'voided_at',
  'voided_by',
  'void_reason',
  'cancellation_reason',
  'is_offline'
] as const

/** Keys re-attached after jsonb_strip_nulls (present even when null). */
const V3_ALWAYS_PRESENT_PAYMENT_KEYS = new Set([
  'subtotal_portion',
  'tax_portion'
])

/** Per-payment jsonb_strip_nulls: the emitted payment object is flat (no
 *  nested objects; covers_items is an array of non-null uuids), so removing
 *  top-level null-valued keys matches Postgres semantics exactly. */
function stripNullsFromPayment (
  payment: BroadcastOrderPaymentData
): BroadcastOrderPaymentData {
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(payment)) {
    if (value === null && !V3_ALWAYS_PRESENT_PAYMENT_KEYS.has(key)) continue
    out[key] = value
  }
  return out as unknown as BroadcastOrderPaymentData
}

/** Produce the v3 payload the new trigger emits for a given v2 payload. */
function applyV3Trim (v2: BroadcastOrderData): BroadcastOrderData {
  const trimmed: Record<string, unknown> = { ...v2 }
  for (const field of V3_DROPPED_HEADER_FIELDS) delete trimmed[field]
  trimmed._broadcast_version = 3
  if (v2.order_payments) {
    trimmed.order_payments = v2.order_payments.map(stripNullsFromPayment)
  }
  if (v2.payment_items) {
    trimmed.payment_items = v2.payment_items.map(({ id: _id, ...rest }) => rest)
  }
  return trimmed as unknown as BroadcastOrderData
}

// ---------------------------------------------------------------------------
// Fixtures — exact v2 trigger emit shape (see 20260712124000 migration)
// ---------------------------------------------------------------------------

const ORDER_ID = '5f0b7f3a-1111-4a4a-9b9b-000000000001'
const LOCATION_ID = '5f0b7f3a-2222-4a4a-9b9b-000000000002'

function makeV2Header (
  overrides: Partial<BroadcastOrderData> = {}
): BroadcastOrderData {
  return {
    _broadcast_version: 2,
    item_count: 3,
    id: ORDER_ID,
    order_number: 'ORD-1042',
    display_number: '42',
    external_id: 'ext-abc', // dropped in v3 — non-null to catch future reads
    merchant_id: 'merch-1',
    location_id: LOCATION_ID,
    customer_id: 'cust-1',
    customer_name: 'Jane Doe',
    customer_phone: '555-0100',
    customer_email: 'jane@example.com',
    delivery_address: null,
    created_by_staff_id: 'staff-1',
    created_by_user_id: 'user-1',
    assigned_server_id: 'staff-2',
    session_id: 'sess-1',
    station_id: 'station-1',
    station_name: 'Front',
    order_type: 'dine_in',
    order_source: 'pos',
    delivery_platform: null,
    platform_order_number: null,
    split_payment_path: null,
    status: 'sent_to_kitchen',
    table_number: 'T4',
    seat_number: '2',
    check_status: 'Opened',
    subtotal: 100.0,
    tax_amount: 8.88,
    tip_amount: 5.0,
    discount_amount: 0,
    service_charge: 3.0,
    total_amount: 111.88,
    card_subtotal: 100.0,
    card_tax_amount: 8.88,
    card_total: 111.88,
    cash_subtotal: 96.0,
    cash_tax_amount: 8.52,
    cash_total: 107.52,
    cash_discount_applied: true,
    cash_discount_amount: 4.0,
    service_charge_name: 'Large Party',
    service_charge_rate: 0.03,
    service_charge_applies_on: 'pre_discount',
    service_charge_rule_id: 'scr-1',
    service_charge_is_manual: true,
    service_charge_is_taxable: false,
    effective_subtotal: 100.0,
    effective_tax_amount: 8.88,
    effective_total: 111.88,
    payment_pricing_mode: 'card',
    payment_status: 'partial',
    amount_paid: 50.0,
    amount_due: 61.88,
    cash_amount_due: 57.52,
    created_at: '2026-07-13T18:00:00Z',
    updated_at: '2026-07-13T18:05:00Z',
    sent_to_kitchen_at: '2026-07-13T18:01:00Z',
    started_preparing_at: '2026-07-13T18:02:00Z',
    ready_at: null,
    completed_at: null,
    cancelled_at: null,
    voided_at: null,
    voided_by: 'nobody', // non-null to catch future reads
    void_reason: 'none',
    cancellation_reason: 'none',
    sync_version: 7,
    is_offline: false,
    ...overrides
  }
}

/** Cash payment as the v2 trigger emits it: card/terminal/return keys null,
 *  coalesced defaults present. */
function makeV2CashPayment (
  overrides: Partial<BroadcastOrderPaymentData> = {}
): BroadcastOrderPaymentData {
  return {
    id: 'pay-cash-1',
    order_id: ORDER_ID,
    payment_method: 'cash',
    amount: 50.0,
    tip_amount: 0,
    total_amount: 50.0,
    status: 'captured',
    // Genuinely null at runtime for cash payments (interface types these
    // non-null to match OrderProfilePayment — pre-existing lie)
    subtotal_portion: null as unknown as number,
    tax_portion: null as unknown as number,
    amount_tendered: 60.0,
    change_given: 10.0,
    is_cash_priced: true,
    original_amount: 52.0,
    split_portion_index: null,
    split_count: null,
    covers_items: [],
    card_type: null,
    card_last_four: null,
    transaction_id: null,
    terminal_type: null,
    is_voided: false,
    void_reason: null,
    refunded_amount: 0,
    refunded_at: null,
    captured_at: '2026-07-13T18:04:00Z',
    authorization_code: null,
    auth_code: null,
    rrn: null,
    batch_number: null,
    dejavoo_batch_number: null,
    dejavoo_invoice_number: null,
    result_code: null,
    entry_mode: null,
    reference_id: null,
    created_at: '2026-07-13T18:03:50Z',
    is_returned: false,
    returned_at: null,
    returned_by: null,
    return_amount: 0,
    return_rrn: null,
    return_auth_code: null,
    return_reference_id: null,
    return_number: null,
    return_reason: null,
    ...overrides
  }
}

/** Card (Castles) payment: cash keys null, card/terminal keys populated. */
function makeV2CardPayment (
  overrides: Partial<BroadcastOrderPaymentData> = {}
): BroadcastOrderPaymentData {
  return makeV2CashPayment({
    id: 'pay-card-1',
    payment_method: 'card',
    amount: 61.88,
    tip_amount: 10.0,
    total_amount: 71.88,
    subtotal_portion: 55.0,
    tax_portion: 6.88,
    amount_tendered: null,
    change_given: 0,
    is_cash_priced: false,
    original_amount: null,
    card_type: 'VISA',
    card_last_four: '4242',
    transaction_id: 'txn-987',
    terminal_type: 'castles',
    authorization_code: 'AUTH01',
    auth_code: 'AUTH01',
    rrn: '425500001234',
    batch_number: '17',
    result_code: '00',
    reference_id: 'ref-777',
    covers_items: ['item-uuid-1', 'item-uuid-2'],
    ...overrides
  })
}

function expectHydrationParity (v2Order: BroadcastOrderData): void {
  const v3Order = applyV3Trim(v2Order)

  const hydratedV2 = transformBroadcastToOrder(v2Order, v2Order.station_name)
  const hydratedV3 = transformBroadcastToOrder(v3Order, v3Order.station_name)

  expect(hydratedV3).toStrictEqual(hydratedV2)
  expect(JSON.stringify(hydratedV3)).toBe(JSON.stringify(hydratedV2))
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('broadcast v3 payload trim — hydration parity with v2', () => {
  it('v3 payloads are still recognized as header-only', () => {
    expect(isHeaderOnlyBroadcast(applyV3Trim(makeV2Header()))).toBe(true)
  })

  it('plain order write (header-only, no payments block)', () => {
    expectHydrationParity(makeV2Header())
  })

  it('order with null-heavy optional header fields', () => {
    expectHydrationParity(
      makeV2Header({
        customer_id: null,
        customer_name: null,
        customer_phone: null,
        customer_email: null,
        session_id: null,
        station_name: null,
        check_status: null,
        service_charge_name: null,
        service_charge_rate: null,
        service_charge_applies_on: null,
        service_charge_rule_id: null,
        service_charge_is_manual: null,
        service_charge_is_taxable: null,
        split_payment_path: null,
        completed_at: null
      })
    )
  })

  it('cash payment write (null card/return keys stripped in v3)', () => {
    expectHydrationParity(
      makeV2Header({ order_payments: [makeV2CashPayment()], payment_items: [] })
    )
  })

  it('card payment write (null cash keys stripped in v3)', () => {
    expectHydrationParity(
      makeV2Header({ order_payments: [makeV2CardPayment()], payment_items: [] })
    )
  })

  it('split payment with payment_items coverage (junction id dropped in v3)', () => {
    expectHydrationParity(
      makeV2Header({
        order_payments: [
          makeV2CardPayment({
            id: 'pay-split-1',
            split_portion_index: 1,
            split_count: 2
          }),
          makeV2CashPayment({
            id: 'pay-split-2',
            split_portion_index: 2,
            split_count: 2
          })
        ],
        payment_items: [
          {
            id: 'opi-1',
            order_payment_id: 'pay-split-1',
            order_item_id: 'item-uuid-1',
            quantity_paid: 1,
            unit_price_paid: 25.0,
            subtotal_paid: 25.0,
            tax_paid: 2.22
          },
          {
            id: 'opi-2',
            order_payment_id: 'pay-split-2',
            order_item_id: 'item-uuid-2',
            quantity_paid: 2,
            unit_price_paid: 12.5,
            subtotal_paid: 25.0,
            tax_paid: null
          }
        ]
      })
    )
  })

  it('refunded-via-return payment (return_* keys populated)', () => {
    expectHydrationParity(
      makeV2Header({
        payment_status: 'refunded',
        order_payments: [
          makeV2CardPayment({
            status: 'refunded',
            refunded_amount: 71.88,
            refunded_at: '2026-07-13T19:00:00Z',
            is_returned: true,
            returned_at: '2026-07-13T19:00:00Z',
            returned_by: 'staff-9',
            return_amount: 71.88,
            return_rrn: '425500009999',
            return_auth_code: 'RAUTH1',
            return_reference_id: 'rref-1',
            return_number: 'RN-1',
            return_reason: 'guest request'
          })
        ]
      })
    )
  })

  it('voided payment', () => {
    expectHydrationParity(
      makeV2Header({
        order_payments: [
          makeV2CashPayment({
            id: 'pay-void-1',
            status: 'voided',
            is_voided: true,
            void_reason: 'wrong order'
          })
        ]
      })
    )
  })

  it('online order INSERT with payment (auto-close hydration path)', () => {
    expectHydrationParity(
      makeV2Header({
        order_source: 'orderout',
        delivery_platform: 'ubereats',
        platform_order_number: 'UE-55321',
        order_type: 'takeout',
        table_number: null,
        payment_status: 'paid',
        amount_due: 0,
        cash_amount_due: 0,
        order_payments: [makeV2CardPayment({ status: 'captured' })],
        payment_items: []
      })
    )
  })

  it('payments transformer parity directly (transactionDetails feeds mergeTransactionDetails)', () => {
    const v2Payments = [makeV2CashPayment(), makeV2CardPayment()]
    const v3Payments = v2Payments.map(stripNullsFromPayment)

    const profileV2 = transformBroadcastPaymentsToProfile(
      v2Payments,
      undefined,
      undefined,
      111.88,
      107.52
    )
    const profileV3 = transformBroadcastPaymentsToProfile(
      v3Payments,
      undefined,
      undefined,
      111.88,
      107.52
    )

    expect(profileV3).toStrictEqual(profileV2)
    expect(JSON.stringify(profileV3)).toBe(JSON.stringify(profileV2))
    // Spot-check the spread-merge inputs specifically
    expect(profileV3[1].transactionDetails).toStrictEqual(
      profileV2[1].transactionDetails
    )
  })

  it('null subtotal_portion/tax_portion keys survive v3 (re-attached, not stripped)', () => {
    const v3Payment = stripNullsFromPayment(makeV2CashPayment())
    expect('subtotal_portion' in v3Payment).toBe(true)
    expect('tax_portion' in v3Payment).toBe(true)
    expect(v3Payment.subtotal_portion).toBeNull()
    // ...while genuinely-null optional keys are gone
    expect('card_type' in v3Payment).toBe(false)
    expect('return_rrn' in v3Payment).toBe(false)
    // ...and coalesced defaults are retained
    expect(v3Payment.change_given).toBe(10.0)
    expect(v3Payment.is_returned).toBe(false)
  })
})
