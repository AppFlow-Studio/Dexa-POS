/**
 * Event Subscribers - Lifecycle Event Handlers (Phase 4.3)
 *
 * Centralized event subscribers that handle post-payment and other lifecycle events.
 * Each subscriber is independent and can fail without affecting others.
 *
 * This decouples stores from each other - they communicate via events instead of
 * direct imports and method calls.
 *
 * Usage:
 *   Call initializeEventSubscribers() ONCE during app initialization (in app/_layout.tsx)
 */

import type {
  OrderArchivedEvent,
  OrderPaidEvent,
  SessionEndedEvent
} from './eventBus'
import { eventBus } from './eventBus'

/**
 * Initialize all event subscribers.
 *
 * IMPORTANT: Call this ONCE during app initialization (e.g., in app/_layout.tsx).
 * Do not call multiple times as it will create duplicate subscriptions.
 */
// TODO: Maybe can set this up
export const initializeEventSubscribers = () => {
  console.log('[EventSubscribers] ====== INITIALIZING ======')

  // ================================================================
  // SUBSCRIBER 1: Auto-archive completed takeout orders
  // ================================================================
  eventBus.on<OrderPaidEvent>('order:paid', async event => {
    try {
      const isTakeoutOrDelivery =
        event.orderType === 'takeout' || event.orderType === 'delivery'
      if (!isTakeoutOrDelivery) return

      const { useStoreSettingsStore } = await import(
        '@/stores/useStoreSettingsStore'
      )
      const completionMode =
        useStoreSettingsStore.getState().orderCompletionMode
      // Manual mode: user must explicitly press Mark Done. auto_on_payment is
      // already handled by syncPaymentToBackend in useOrderStore. Only "auto"
      // mode should auto-archive from this subscriber.
      if (completionMode !== 'auto') return

      const { useOrderStore } = await import('@/stores/useOrderStore')
      const order = useOrderStore.getState().ordersById[event.orderId]
      if (!order) return

      const allItemsReady =
        order.items.length > 0 &&
        order.items.every(
          i => i.kitchen_status === 'ready' || i.kitchen_status === 'served'
        )

      if (allItemsReady && order.paid_status === 'Paid') {
        console.log(
          `[EventSubscribers:Archive] Auto-archiving ${event.orderType} order ${event.orderId}`
        )

        // Small delay for UX (let success screen show)
        setTimeout(() => {
          useOrderStore.getState().archiveOrder(event.orderId)
          console.log(
            `[EventSubscribers:Archive] ✓ Archived order ${event.orderId}`
          )
        }, 500)
      } else {
        console.log(
          `[EventSubscribers:Archive] Order ${event.orderId} does not need archiving (type: ${event.orderType}, mode: ${completionMode}, allItemsReady: ${allItemsReady}, paid: ${order.paid_status})`
        )
      }
    } catch (error) {
      console.error('[EventSubscribers:Archive] Failed:', error)
    }
  })

  // ================================================================
  // SUBSCRIBER 2: Update table status after dine-in payment
  // ================================================================
  eventBus.on<OrderPaidEvent>('order:paid', async event => {
    try {
      // Only for dine-in/table orders
      if (!event.tableId && !event.sessionId) {
        console.log(
          `[EventSubscribers:Table] Order ${event.orderId} has no table/session, skipping table update`
        )
        return
      }

      const { useTableSessionStore } = await import(
        '@/stores/useTableSessionStore'
      )
      const { useOrderStore } = await import('@/stores/useOrderStore')
      const { useFloorPlanStore } = await import('@/stores/useFloorPlanStore')

      const order = useOrderStore.getState().ordersById[event.orderId]
      const tableId =
        event.tableId ||
        order?.service_location_id ||
        (event.sessionId
          ? useTableSessionStore
              .getState()
              .getSessionBySessionId(event.sessionId)?.tableId
          : undefined)

      if (tableId) {
        const sessionStore = useTableSessionStore.getState()
        const session = sessionStore.getSession(tableId)
        if (
          session &&
          session.status !== 'paid' &&
          session.status !== 'cleaning'
        ) {
          const result = await sessionStore.dispatchAction({
            type: 'FULL_PAYMENT',
            tableId
          })
          if (!result.success) {
            console.warn(
              `[EventSubscribers:Table] FULL_PAYMENT transition skipped for table ${tableId}: ${result.error}`
            )
          }
        }
      }

      // Defer the floor-plan refresh out of the post-payment hot path.
      // Realtime push already updates the table-status cell; this fetch is
      // insurance, and synchronously awaiting it contends for the JS thread
      // and the network in the same window the receipt printer is talking on
      // USB. 1s buys us a clean print/cashbox window. The store's in-flight
      // dedupe prevents duplicate fetches on rapid back-to-back payments.
      setTimeout(() => {
        useFloorPlanStore
          .getState()
          .loadFloorPlanStatus()
          .catch(err =>
            console.error(
              `[EventSubscribers:Table] Floor plan refresh failed for session ${event.sessionId}:`,
              err
            )
          )
      }, 1000)
    } catch (error) {
      console.error('[EventSubscribers:Table] Failed:', error)
    }
  })

  // ================================================================
  // SUBSCRIBER 3: Record analytics (placeholder for future)
  // ================================================================
  eventBus.on<OrderPaidEvent>('order:paid', async event => {
    try {
      console.log('[EventSubscribers:Analytics] Recording payment:', {
        orderId: event.orderId,
        orderType: event.orderType,
        amount: event.totalAmount,
        cashAmount: event.cashAmount,
        method: event.paymentMethod,
        sessionId: event.sessionId,
        timestamp: new Date().toISOString()
      })

      // TODO: Send to analytics service (Segment, Mixpanel, etc.)
      // await analytics.track("Order Paid", {
      //   order_id: event.orderId,
      //   order_type: event.orderType,
      //   amount: event.totalAmount,
      //   payment_method: event.paymentMethod,
      //   session_id: event.sessionId,
      // });
    } catch (error) {
      console.error('[EventSubscribers:Analytics] Failed:', error)
    }
  })

  // ================================================================
  // SUBSCRIBER 4: Deduct inventory when order archived
  // ================================================================
  eventBus.on<OrderArchivedEvent>('order:archived', async event => {
    try {
      console.log(
        `[EventSubscribers:Inventory] Deducting stock for archived order ${event.orderId}`
      )

      // This is a placeholder - actual inventory deduction logic would go here
      // For now, we log it since archiveOrder already handles inventory

      // TODO: If inventory deduction needs to move here:
      // const { useInventoryStore } = await import("@/stores/useInventoryStore");
      // const { useOrderStore } = await import("@/stores/useOrderStore");
      // const order = useOrderStore.getState().ordersById[event.orderId];
      //
      // if (order) {
      //   for (const item of order.items) {
      //     if (item.menuItemId && !item.is_voided) {
      //       await useInventoryStore.getState().decrementStockFromSale(
      //         item.menuItemId,
      //         item.quantity
      //       );
      //     }
      //   }
      // }

      console.log(
        `[EventSubscribers:Inventory] ✓ Inventory handled for order ${event.orderId}`
      )
    } catch (error) {
      console.error('[EventSubscribers:Inventory] Failed:', error)
    }
  })

  // ================================================================
  // SUBSCRIBER 5: Log session end (for reporting)
  // ================================================================
  eventBus.on<SessionEndedEvent>('session:ended', async event => {
    try {
      console.log('[EventSubscribers:Session] Session ended:', {
        sessionId: event.sessionId,
        duration: event.duration,
        tableId: event.tableId,
        orderId: event.orderId,
        endReason: event.endReason
      })

      // TODO: Record session metrics
      // - Average session duration
      // - Orders per session
      // - Revenue per session
      // - Table turnover rate

      // Example:
      // await analyticsService.recordSessionEnd({
      //   session_id: event.sessionId,
      //   duration_minutes: event.duration,
      //   table_id: event.tableId,
      //   order_id: event.orderId,
      //   end_reason: event.endReason,
      // });
    } catch (error) {
      console.error('[EventSubscribers:Session] Failed:', error)
    }
  })

  console.log('[EventSubscribers] ====== INITIALIZED ======')
  console.log(
    `[EventSubscribers] Active subscriptions:`,
    eventBus.getActiveSubscriptions()
  )
}

/**
 * Cleanup function to remove all event subscribers.
 *
 * This is useful for testing or when you need to reset the event bus.
 * In production, you typically don't need to call this.
 */
export const cleanupEventSubscribers = () => {
  console.log('[EventSubscribers] Cleaning up...')
  eventBus.clear()
  console.log('[EventSubscribers] All subscribers removed')
}
