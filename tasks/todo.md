# Tasks

## Completed

- [x] Fix DraggableTable "Loading..." on floor plan tiles — replaced fragile `getOrder()` with resilient `effectiveOrder` memo (O(1) fast path + O(n) fallback by `service_location_id`)
- [x] Fix merge-mode table selection tap
  - Identify gesture path blocking tap selection in merge mode
  - Update table gesture handling to allow tap-to-select while merge mode is active
  - Verify selection highlight and MergeActionBar counts update on tap

## Pending

- [ ] Clean up OrderLineItemsView modal design — layout is cramped/broken
  - Item names wrapping mid-word ("Macchiato" breaks to "Macchiat o")
  - Modifier text truncated ("+$" cut off on Syrup Flavors)
  - Left ITEMS column too narrow, causing excessive wrapping
  - File: `components/order/OrderLineItemsView.tsx`
- [ ] Fix merge-mode tap still opening context sheet
  - Ensure table gesture handlers re-render when merge mode toggles
  - Tie interaction mode to merge mode so stale handlers cannot fire
  - Validate tap selects without opening context sheet in merge mode

## Review

- Merge mode: tap-to-select works without long-press interference; long-press actions are disabled while merge mode is active.
