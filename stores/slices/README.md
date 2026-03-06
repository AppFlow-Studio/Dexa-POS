# Order Store Slice Architecture

Future refactoring target: split `useOrderStore.ts` (~10K lines) into composable Zustand slices.

## Proposed Slices

| Slice | Responsibility | Key Actions |
|-------|---------------|-------------|
| `orderCrudSlice` | Create, update, delete orders | `startNewOrder`, `addItemToActiveOrder`, `removeItem` |
| `orderSyncSlice` | Broadcast, realtime sync, conflict | `_handleOrderBroadcast`, `syncOrderFromBackendComplete` |
| `orderPaymentSlice` | Payments, refunds | `addPaymentToOrder`, `syncPaymentToBackend`, `rollbackPayment` |
| `orderKitchenSlice` | Kitchen status, coursing | `sendNewItemsToKitchenForOrder`, `updateKitchenStatus` |
| `orderPersistSlice` | Partialize, rehydration | `partialize`, `merge`, `clearInactiveOrders` |

## Migration Strategy

1. Extract pure helper functions first (already done: `mergePayments`, `calculateOrderTotals`)
2. Create slice files that export slice creator functions
3. Compose slices in `useOrderStore.ts` using `(...a) => ({ ...slice1(...a), ...slice2(...a) })`
4. Move tests alongside each slice

## Dependencies

- All slices share `ordersById`, `orderIds`, `dbOrderIdIndex`, `persistableOrderIds`
- `orderSyncSlice` depends on `orderCrudSlice` for state updates
- `orderPaymentSlice` depends on `orderCrudSlice` for order mutations
