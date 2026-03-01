# Tasks

## Completed
- [x] Fix DraggableTable "Loading..." on floor plan tiles — replaced fragile `getOrder()` with resilient `effectiveOrder` memo (O(1) fast path + O(n) fallback by `service_location_id`)

## Pending
- [ ] Clean up OrderLineItemsView modal design — layout is cramped/broken
  - Item names wrapping mid-word ("Macchiato" breaks to "Macchiat o")
  - Modifier text truncated ("+$" cut off on Syrup Flavors)
  - Left ITEMS column too narrow, causing excessive wrapping
  - File: `components/order/OrderLineItemsView.tsx`
