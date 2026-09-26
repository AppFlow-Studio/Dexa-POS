/**
 * Modifier rows bound for the order-item RPCs (add_order_item_v5,
 * replace_order_item_modifiers_v2, add_order_items_batch, ...).
 *
 * Every one of those RPCs hard-casts `modifier_group_id` / `modifier_item_id`
 * to uuid, and the cast runs AFTER the order_items insert in the same call — so
 * one non-uuid id (a custom modifier's "custom-modifiers" / "custom_mod_…"
 * sentinel, an add-on placeholder) rolls back the whole item with 22P02. On the
 * local-first outbox that is classified permanent: the item never reaches the
 * server and the card payment behind it waits forever (Charcoal Gardenia
 * S1-0011, 2026-09-25).
 *
 * Both columns are nullable server-side; the name + price columns carry the
 * real data. So anything that isn't a uuid is sent as null.
 */
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const uuidOrNull = (value: unknown): string | null =>
  typeof value === "string" && UUID_RE.test(value) ? value : null;

export function sanitizeModifierRowsForRpc<T>(rows: T): T {
  if (!Array.isArray(rows)) return rows;
  return rows.map((row) =>
    row && typeof row === "object"
      ? {
          ...row,
          modifier_group_id: uuidOrNull(
            (row as Record<string, unknown>).modifier_group_id,
          ),
          modifier_item_id: uuidOrNull(
            (row as Record<string, unknown>).modifier_item_id,
          ),
        }
      : row,
  ) as T;
}
