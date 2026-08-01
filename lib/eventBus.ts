/**
 * Event Bus - Lifecycle Event System (Phase 4.1)
 *
 * Type-safe event bus for decoupling store operations.
 * Allows stores to communicate without direct dependencies.
 *
 * Key Features:
 * - Subscribe/unsubscribe pattern for loose coupling
 * - Type-safe event payloads with TypeScript
 * - Event history for debugging
 * - Graceful error handling (one subscriber failure doesn't break others)
 * - Supports both sync and async event handlers
 *
 * Example Usage:
 *   // Subscribe
 *   eventBus.on<OrderPaidEvent>("order:paid", async (event) => {
 *     console.log("Order paid:", event.orderId);
 *   });
 *
 *   // Emit
 *   await eventBus.emit("order:paid", {
 *     orderId: "123",
 *     totalAmount: 50.00,
 *     paymentMethod: "cash"
 *   });
 */

// ============================================================================
// TYPES - Event Payloads
// ============================================================================

/**
 * Event emitted when an order is paid in full
 */
export interface OrderPaidEvent {
  orderId: string; // Local order ID
  orderType: string; // "dine_in" | "takeout" | "delivery"
  totalAmount: number;
  cashAmount: number;
  paymentMethod: string;
  sessionId?: string; // Session UUID (for dine-in orders)
  tableId?: string; // Table/location ID
}

/**
 * Event emitted when a new order is created
 */
export interface OrderCreatedEvent {
  orderId: string;
  orderType: string;
  sessionId?: string;
  merchantId: string;
  locationId: string;
}

/**
 * Event emitted when a table session ends
 */
export interface SessionEndedEvent {
  sessionId: string;
  tableId: string;
  orderId?: string;
  duration: number; // Session duration in minutes
  endReason: "paid" | "voided" | "transferred" | "manual";
}

/**
 * Event emitted when items are sent to the kitchen
 */
export interface ItemsSentToKitchenEvent {
  orderId: string;
  itemIds: string[];
  courseNumber?: number;
  timestamp: string;
}

/**
 * Event emitted when an order is archived
 */
export interface OrderArchivedEvent {
  orderId: string;
  orderType: string;
  totalAmount: number;
  archivedAt: string;
}

/**
 * Event emitted when an order is voided
 */
export interface OrderVoidedEvent {
  orderId: string;
  orderType: string;
  voidedBy: string; // Staff ID
  reason?: string;
}

// ============================================================================
// EVENT BUS IMPLEMENTATION
// ============================================================================

type EventCallback<T = any> = (payload: T) => void | Promise<void>;

interface EventSubscription {
  event: string;
  callback: EventCallback;
  once: boolean;
}

class EventBus {
  private subscriptions: Map<string, EventSubscription[]> = new Map();
  private eventHistory: Array<{
    event: string;
    payload: any;
    timestamp: string;
  }> = [];
  private maxHistorySize = 100;

  /**
   * Subscribe to an event
   *
   * @param event - Event name (e.g., "order:paid")
   * @param callback - Handler function (sync or async)
   * @returns Unsubscribe function
   */
  on<T = any>(event: string, callback: EventCallback<T>): () => void {
    if (!this.subscriptions.has(event)) {
      this.subscriptions.set(event, []);
    }

    const subscription: EventSubscription = {
      event,
      callback,
      once: false,
    };

    this.subscriptions.get(event)!.push(subscription);

    console.log(
      `[EventBus] Subscribed to: ${event} (total: ${this.subscriptions.get(event)!.length})`,
    );

    // Return unsubscribe function
    return () => this.off(event, callback);
  }

  /**
   * Subscribe to an event once (auto-unsubscribe after first emit)
   *
   * @param event - Event name
   * @param callback - Handler function
   * @returns Unsubscribe function
   */
  once<T = any>(event: string, callback: EventCallback<T>): () => void {
    if (!this.subscriptions.has(event)) {
      this.subscriptions.set(event, []);
    }

    const subscription: EventSubscription = {
      event,
      callback,
      once: true,
    };

    this.subscriptions.get(event)!.push(subscription);

    console.log(`[EventBus] Subscribed once to: ${event}`);

    return () => this.off(event, callback);
  }

  /**
   * Unsubscribe from an event
   *
   * @param event - Event name
   * @param callback - Handler function to remove
   */
  off(event: string, callback: EventCallback): void {
    const subs = this.subscriptions.get(event);
    if (!subs) return;

    const index = subs.findIndex((sub) => sub.callback === callback);
    if (index !== -1) {
      subs.splice(index, 1);
      console.log(
        `[EventBus] Unsubscribed from: ${event} (remaining: ${subs.length})`,
      );
    }

    // Clean up empty subscription lists
    if (subs.length === 0) {
      this.subscriptions.delete(event);
    }
  }

  /**
   * Emit an event to all subscribers
   *
   * Executes all subscribers in parallel with graceful error handling.
   * One subscriber failure does not affect others.
   *
   * @param event - Event name
   * @param payload - Event data
   */
  async emit<T = any>(event: string, payload: T): Promise<void> {
    // Record in history for debugging
    this.recordEvent(event, payload);

    const subs = this.subscriptions.get(event);
    if (!subs || subs.length === 0) {
      console.log(`[EventBus] No subscribers for event: ${event}`);
      return;
    }

    console.log(`[EventBus] Emitting ${event} to ${subs.length} subscribers`);

    // Execute all callbacks (parallel execution with Promise.allSettled)
    const promises = subs.map(async (sub) => {
      try {
        await sub.callback(payload);

        // Remove if one-time subscription
        if (sub.once) {
          this.off(event, sub.callback);
        }
      } catch (error) {
        console.error(`[EventBus] Error in subscriber for ${event}:`, error);
        // Don't let one subscriber failure break others
      }
    });

    // Wait for all subscribers (but don't throw on failure)
    await Promise.allSettled(promises);

    console.log(`[EventBus] ${event} emission complete`);
  }

  /**
   * Record event for debugging
   *
   * @param event - Event name
   * @param payload - Event data
   */
  private recordEvent(event: string, payload: any): void {
    this.eventHistory.push({
      event,
      payload,
      timestamp: new Date().toISOString(),
    });

    // Limit history size to prevent memory leaks
    if (this.eventHistory.length > this.maxHistorySize) {
      this.eventHistory.shift();
    }
  }

  /**
   * Get recent event history (for debugging)
   *
   * @param event - Optional: filter by event name
   * @returns Array of recent events
   */
  getHistory(event?: string): typeof this.eventHistory {
    if (event) {
      return this.eventHistory.filter((e) => e.event === event);
    }
    return [...this.eventHistory];
  }

  /**
   * Clear all subscriptions (for testing)
   */
  clear(): void {
    this.subscriptions.clear();
    this.eventHistory = [];
    console.log("[EventBus] Cleared all subscriptions and history");
  }

  /**
   * Get count of subscribers for an event (for debugging)
   *
   * @param event - Event name
   * @returns Number of subscribers
   */
  getSubscriberCount(event: string): number {
    return this.subscriptions.get(event)?.length || 0;
  }

  /**
   * Get list of all active event subscriptions (for debugging)
   *
   * @returns Array of event names with subscriber counts
   */
  getActiveSubscriptions(): Array<{ event: string; count: number }> {
    return Array.from(this.subscriptions.entries()).map(([event, subs]) => ({
      event,
      count: subs.length,
    }));
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

/**
 * Global event bus instance
 *
 * Import and use this singleton throughout your app:
 *   import { eventBus } from "@/lib/eventBus";
 */
export const eventBus = new EventBus();

/**
 * Export the EventBus class for testing purposes
 */
export { EventBus };

