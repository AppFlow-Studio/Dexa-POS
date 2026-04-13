/**
 * Today's Orders MMKV Cache
 *
 * Lightweight projection of today's orders stored in MMKV for instant
 * list rendering on app boot (before the network fetch completes).
 *
 * Uses the existing syncStorage instance to stay consistent with the
 * codebase's centralized MMKV pattern. Keys are registered in
 * CLEARABLE_SYNC_KEYS for proper cache reset.
 *
 * The projection keeps only fields needed for the list view (~300 bytes/order
 * vs 5-20KB for full order with items/modifiers). Full details are fetched
 * on tap from the server.
 */

import { syncStorage } from '@/lib/storage';
import {
  getCurrentBusinessDay,
  getBusinessDayForTimestamp,
  type BusinessDayConfig,
} from '@/lib/businessDay';
import type { PreviousOrder } from '@/lib/types';

// Lightweight projection — only fields needed for list rendering.
export interface CachedOrderSummary {
  id: string;           // db_order_id (server UUID) or local orderId
  orderId: string;      // local orderId (stable across offline→online)
  db_order_id?: string; // server UUID (populated after sync)
  display_number: string;
  order_status: string;
  order_type: string;
  total: number;
  customer_name: string;
  item_count: number;
  timestamp: string;      // ISO
  station_id: string | null;
  server_name: string;
  paymentStatus: string;
  checkStatus: string;
}

/**
 * Project a PreviousOrder to a lightweight CachedOrderSummary.
 */
export function projectToSummary(order: PreviousOrder): CachedOrderSummary {
  return {
    id: order.db_order_id || order.orderId,
    orderId: order.orderId,
    db_order_id: order.db_order_id,
    display_number: order.display_number || '',
    order_status: order.voided ? 'void' : order.refunded ? 'refunded' : 'completed',
    order_type: order.type || 'Dine In',
    total: order.total,
    customer_name: order.customer || 'Walk-In',
    item_count: order.itemCount,
    timestamp: order.timestamp,
    station_id: order.station_id ?? null,
    server_name: order.server || 'Unknown',
    paymentStatus: order.paymentStatus,
    checkStatus: order.checkStatus || 'Opened',
  };
}

const KEY = (locationId: string, businessDay: string) =>
  `today_orders:${locationId}:${businessDay}`;

const PREFIX = (locationId: string) => `today_orders:${locationId}:`;

// Cap cache payload — busy QSR ceiling, prevents pathological MMKV bloat
const MAX_CACHED_ORDERS_PER_DAY = 1000;

export const todayOrdersCache = {
  get(locationId: string, businessDay: string): CachedOrderSummary[] | null {
    try {
      const raw = syncStorage.getString(KEY(locationId, businessDay));
      if (!raw) return null;
      const parsed = JSON.parse(raw) as CachedOrderSummary[];
      return Array.isArray(parsed) ? parsed : null;
    } catch (err) {
      console.error('[todayOrdersCache.get]', err);
      return null;
    }
  },

  set(
    locationId: string,
    businessDay: string,
    orders: CachedOrderSummary[]
  ): void {
    try {
      const capped = orders.length > MAX_CACHED_ORDERS_PER_DAY
        ? orders.slice(0, MAX_CACHED_ORDERS_PER_DAY)
        : orders;
      syncStorage.set(KEY(locationId, businessDay), JSON.stringify(capped));
    } catch (err) {
      console.error('[todayOrdersCache.set]', err);
    }
  },

  /**
   * Upsert a single order — used by the realtime write-through path.
   * Dedupes by orderId (handles offline-created orders that later
   * sync and arrive via broadcast with a db_order_id).
   */
  upsert(
    locationId: string,
    config: BusinessDayConfig,
    order: CachedOrderSummary
  ): void {
    try {
      const orderBday = getBusinessDayForTimestamp(order.timestamp, config);
      const currentBday = getCurrentBusinessDay(config);

      // Only cache if it's today's business day
      if (orderBday !== currentBday) return;

      const existing = this.get(locationId, currentBday) ?? [];
      // Dedupe by both orderId and db_order_id to handle offline→online transition
      const filtered = existing.filter(
        o => o.orderId !== order.orderId &&
             (!order.db_order_id || o.db_order_id !== order.db_order_id)
      );
      const merged = [order, ...filtered].sort(
        (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      );
      this.set(locationId, currentBday, merged);
    } catch (err) {
      console.error('[todayOrdersCache.upsert]', err);
    }
  },

  /**
   * Bulk-write today's cache from a full refresh response.
   * Projects PreviousOrder[] to summaries and writes in one shot.
   */
  writeFromRefresh(
    locationId: string,
    businessDay: string,
    orders: PreviousOrder[]
  ): void {
    const summaries = orders.map(projectToSummary);
    this.set(locationId, businessDay, summaries);
  },

  /**
   * Evict all cached business days for this location except the current one.
   * Call on app foreground to handle business day rollover.
   */
  evictStale(locationId: string, currentBusinessDay: string): void {
    try {
      const allKeys = syncStorage.getAllKeys();
      const prefix = PREFIX(locationId);
      const currentKey = KEY(locationId, currentBusinessDay);

      for (const key of allKeys) {
        if (key.startsWith(prefix) && key !== currentKey) {
          syncStorage.remove(key);
        }
      }
    } catch (err) {
      console.error('[todayOrdersCache.evictStale]', err);
    }
  },

  /** Nuke everything for a location — used on logout or location switch. */
  clearLocation(locationId: string): void {
    try {
      const allKeys = syncStorage.getAllKeys();
      const prefix = PREFIX(locationId);
      for (const key of allKeys) {
        if (key.startsWith(prefix)) syncStorage.remove(key);
      }
    } catch (err) {
      console.error('[todayOrdersCache.clearLocation]', err);
    }
  },
};
