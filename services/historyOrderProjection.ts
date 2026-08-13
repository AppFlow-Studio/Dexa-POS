/**
 * Explicit column projections for the Previous Orders page query.
 *
 * The nested rows are what multiply: 50 orders × their items × their payments.
 * `order_items(*)` transferred 68 columns of which the transform reads 26, and
 * `order_payments(*)` transferred 105 of which it reads 52 — and the unread
 * remainder is where the bulk sits (`emv_data`, `terminal_request`,
 * `card_token`, per-payment `metadata`, the processor text/response codes).
 *
 * The column set is defined by what `normalizeFetchedItems` /
 * `normalizeFetchedPayment` (utils/orderTransformers.ts) and
 * `restoreDiscountsFromBackend` (utils/discountUtils.ts) actually read — those
 * normalizers are the contract. A field absent from the response reads as
 * `undefined` and falls through the same `?? null` defaults an absent column
 * always did, so adding a read there without adding the column here degrades
 * silently. Change the two together.
 *
 * Naming columns explicitly introduces one failure mode `*` never had: a name
 * that doesn't exist makes PostgREST reject the request and the whole list
 * fails to load. `__tests__/historyOrderProjection.test.ts` checks every name
 * against the generated schema types to keep that a test failure rather than a
 * runtime one — which is also why this lives in its own module, free of the
 * native-only imports that make `orderService` unimportable under Jest.
 */

export const HISTORY_ITEM_COLUMNS = [
  "id",
  "menu_item_id",
  "item_name",
  "quantity",
  "unit_price",
  "cash_price",
  "subtotal",
  "cash_subtotal",
  "tax_amount",
  "cash_tax_amount",
  "discount_amount",
  "item_status",
  "kitchen_status",
  "paid_quantity",
  "refunded_quantity",
  "refunded_amount",
  "course_number",
  "is_voided",
  "is_to_go",
  "is_open_item",
  "open_item_name",
  "open_item_price",
  "special_instructions",
  "category_name",
  "base_card_price",
  "base_cash_price",
].join(",");

/**
 * `processor_response` and `terminal_response` stay despite being large: the
 * RRN and entry-mode fallbacks parse them when the flat columns are null.
 */
export const HISTORY_PAYMENT_COLUMNS = [
  "id",
  "order_id",
  "payment_method",
  "amount",
  "tip_amount",
  "total_amount",
  "status",
  "subtotal_portion",
  "tax_portion",
  "discount_portion",
  "service_charge",
  "service_charge_refunded",
  "voided_at",
  "amount_tendered",
  "change_given",
  "is_cash_priced",
  "original_amount",
  "split_portion_index",
  "split_count",
  "covers_items",
  "card_type",
  "card_last_four",
  "transaction_id",
  "terminal_type",
  "is_voided",
  "void_reason",
  "refunded_amount",
  "refunded_at",
  "authorized_at",
  "captured_at",
  // No `created_at` here on purpose: `order_payments` has no such column.
  // `normalizeFetchedPayment` reads `payment.created_at` and has always got
  // `undefined` for it — naming it in this projection would make PostgREST
  // reject the request and take the whole list down. `initiated_at` /
  // `approved_at` / `captured_at` are the real timestamps.
  "reference_number",
  "authorization_code",
  "auth_code",
  "rrn",
  "processor_response",
  "terminal_response",
  "batch_number",
  "dejavoo_batch_number",
  "dejavoo_invoice_number",
  "result_code",
  "is_settled",
  "settled_at",
  "is_returned",
  "returned_at",
  "returned_by",
  "return_amount",
  "return_rrn",
  "return_auth_code",
  "return_reference_id",
  "return_number",
  "return_reason",
].join(",");

export const HISTORY_DISCOUNT_COLUMNS = [
  "id",
  "discount_id",
  "discount_name",
  "discount_type",
  "discount_value",
  "source",
  "calculated_amount",
  "pre_discount_subtotal",
  "applied_by_staff_profiles_id",
  "approved_by_staff_profiles_id",
  "applied_at",
  "created_at",
  "applied_to_item_ids",
  // Read by the voided-discount filter in normalizeFetchedOrder.
  "voided_at",
].join(",");
