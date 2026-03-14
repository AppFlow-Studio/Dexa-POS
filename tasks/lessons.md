# Lessons Learned

## Order Lookup Patterns
- `getOrder()` alone is fragile for DraggableTable — `dbOrderIdIndex` has timing gaps after seating
- Sidebar (`TableListItem`, `SeatedPanel`) already uses resilient fallbacks (scan by `service_location_id` or `db_order_id`)
- When multiple components need the same data, ensure they all have equivalent resilience — don't let one component use a weaker lookup strategy

