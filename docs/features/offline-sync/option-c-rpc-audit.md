# Option C — `useOrderStore.ts` RPC Site Audit

Phase 0 deliverable per `lets-look-into-this-stateless-blossom.md`.

## Summary

`stores/useOrderStore.ts` has **5 inline `supabase.rpc(` calls and 0 inline `supabase.from(` calls**. All other mutations route through `services/orderService.ts` (the wrap layer target). This is a smaller surface than the original estimate of 5–15.

## Site inventory

| Line | RPC | Category | Decision |
|---|---|---|---|
| 1337 | `replace_order_item_modifiers_v2` | A — target-state (replace, not append) | Inline-wrap with `executeWithFallback` + `DEADLINES.hotMutation` |
| 2093 | `process_payment_v8` | B — payment | **Leave unchanged** (Option C explicitly excludes Category B) |
| 10641 | `void_payment` | A — target-state (set to voided) | Inline-wrap with `executeWithFallback` + `DEADLINES.hotMutation` |
| 12023 | `link_order_to_session` | A — target-state (link a single session_id) | Inline-wrap with `executeWithFallback` + `DEADLINES.hotMutation` |
| 12610 | `get_order_details` | C — read | Inline-wrap with `withDeadline` + `DEADLINES.read` (no queue) |

## Notes

- **Category B at line 2093** is the only blocked freeze in `useOrderStore.ts`. It is intentionally out of scope; payment flow continues to await directly. Documented in plan acceptance criteria.
- **`replace_order_item_modifiers_v2` at line 1337** is naturally idempotent: passing the same modifiers payload twice produces the same end state. Safe to retry via offline queue.
- **`link_order_to_session` at line 12023** sets `orders.session_id` to a specific value. Retry sets the same value. Idempotent.
- **`get_order_details` at line 12610** is a read; deadline-only treatment (no queue, no fallback). On timeout, callers should already handle errors gracefully (it's a read).
- All other mutations in `useOrderStore.ts` route through `OrderService` methods, which will be wrapped in `services/orderService.ts` itself.

## CI discipline

Phase 3 deliverable `scripts/check-rpc-discipline.sh` will allow these 5 sites via explicit allowlist comments:

```ts
// rpc-discipline-allow: <reason>
const { ... } = await supabase.rpc(...)
```

Allowlist reasons:
- 1337: `inline-wrapped Category A — replace_order_item_modifiers_v2 with retry safety`
- 2093: `Category B payment — Option C accepted scope, deferred to Phase 2`
- 10641: `inline-wrapped Category A — void_payment with retry safety`
- 12023: `inline-wrapped Category A — link_order_to_session with retry safety`
- 12610: `inline-wrapped Category C read — get_order_details deadline-only`
