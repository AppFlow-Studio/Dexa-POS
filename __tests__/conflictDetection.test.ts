/**
 * Tests for services/conflictDetectionService — PR B "smart payment-safe gate".
 *
 * Goals:
 * 1. hasLocalPendingChanges truth-table — covers every category the gate
 *    relies on (items, order-level, discounts, pre-auth payments).
 * 2. detectConflict downgrades non-payment, non-critical conflicts to 'silent'
 *    when the local order is clean — but ONLY when the flag is on, and NEVER
 *    when the server change is payment-touching.
 * 3. Flag-off path preserves pre-PR-B behavior.
 *
 * Loads the module twice via jest.isolateModules so we can flip the env-var
 * flag (read at module import time) per describe block.
 */

import type { OrderProfile } from '@/lib/types';

type ServiceModule = typeof import('@/services/conflictDetectionService');

function loadService(envFlag: '1' | '0' | undefined): ServiceModule {
  if (envFlag === undefined) {
    delete process.env.EXPO_PUBLIC_SILENCE_REMOTE_EDIT_TOASTS;
  } else {
    process.env.EXPO_PUBLIC_SILENCE_REMOTE_EDIT_TOASTS = envFlag;
  }
  let mod!: ServiceModule;
  jest.isolateModules(() => {
    mod = require('@/services/conflictDetectionService');
  });
  return mod;
}

// ---------------------------------------------------------------------------
// Fixture builders — minimal OrderProfile shapes good enough for the tests we
// care about. Anything detectConflict / hasLocalPendingChanges doesn't read is
// left undefined and cast through `as any`.
// ---------------------------------------------------------------------------

interface ItemFixture {
  id: string;
  db_order_item_id?: string;
  sync_status?: 'pending' | 'syncing' | 'synced' | 'failed';
  name: string;
  quantity: number;
  price: number;
  customizations?: { modifiers?: any[] };
}

function makeItem(overrides: Partial<ItemFixture> = {}): ItemFixture {
  // `'key' in overrides` so that explicit `undefined` (i.e. "force unsynced")
  // wins over the default-generated id. The `??` fallback would silently
  // re-introduce a synced id, masking the unsynced-add scenario.
  const dbId =
    'db_order_item_id' in overrides
      ? overrides.db_order_item_id
      : `db-${Math.random().toString(36).slice(2, 8)}`;
  return {
    id: overrides.id ?? `local-${Math.random().toString(36).slice(2, 8)}`,
    db_order_item_id: dbId,
    name: overrides.name ?? 'Burger',
    quantity: overrides.quantity ?? 1,
    price: overrides.price ?? 10,
    customizations: overrides.customizations,
    sync_status: overrides.sync_status,
  };
}

function makeOrder(overrides: Partial<OrderProfile> = {}): OrderProfile {
  const baseItems = overrides.items ?? [makeItem()];
  return {
    id: 'local-order-1',
    db_order_id: 'db-order-1',
    items: baseItems as any,
    sync_version: 1,
    order_status: 'pending',
    paid_status: 'Unpaid',
    amount_paid: 0,
    total_amount: 10,
    payments: [],
    applied_discounts: [],
    ...(overrides as any),
  } as OrderProfile;
}

function makeServerSnapshot(
  local: OrderProfile,
  overrides: Partial<OrderProfile> & { sync_version?: number } = {},
) {
  return {
    sync_version: (local.sync_version ?? 0) + 1,
    order_status: local.order_status,
    paid_status: local.paid_status,
    amount_paid: local.amount_paid,
    total_amount: local.total_amount,
    items: local.items,
    ...overrides,
  };
}

// ===========================================================================
// hasLocalPendingChanges truth table
// ===========================================================================

describe('hasLocalPendingChanges', () => {
  const { hasLocalPendingChanges } = loadService(undefined);

  it('returns false for a clean order (all items synced, no pending flags)', () => {
    expect(hasLocalPendingChanges(makeOrder())).toBe(false);
  });

  it('returns true when an item is missing db_order_item_id (unsynced add)', () => {
    const order = makeOrder({
      items: [makeItem({ db_order_item_id: undefined })] as any,
    });
    expect(hasLocalPendingChanges(order)).toBe(true);
  });

  it("returns true when an item has sync_status='pending'", () => {
    const order = makeOrder({
      items: [makeItem({ sync_status: 'pending' })] as any,
    });
    expect(hasLocalPendingChanges(order)).toBe(true);
  });

  it("returns true when order.sync_status='pending' (covers customer-info edits)", () => {
    expect(
      hasLocalPendingChanges(makeOrder({ sync_status: 'pending' } as any)),
    ).toBe(true);
  });

  it('returns true for an applied_discount without order_discount_id', () => {
    const order = makeOrder({
      applied_discounts: [
        {
          local_id: 'd1',
          // order_discount_id intentionally missing
          discount_id: 'discount-x',
          discount_type: 'percentage',
          discount_value: 10,
          source: 'preset',
          calculated_amount: 1,
          pre_discount_subtotal: 10,
          applied_by_staff_profiles_id: null,
          applied_at: new Date().toISOString(),
        } as any,
      ],
    } as any);
    expect(hasLocalPendingChanges(order)).toBe(true);
  });

  it("returns true for an applied_discount with sync_status='pending'", () => {
    const order = makeOrder({
      applied_discounts: [
        {
          local_id: 'd1',
          order_discount_id: 'srv-d1',
          discount_id: 'discount-x',
          discount_type: 'percentage',
          discount_value: 10,
          source: 'preset',
          calculated_amount: 1,
          pre_discount_subtotal: 10,
          applied_by_staff_profiles_id: null,
          applied_at: new Date().toISOString(),
          sync_status: 'pending',
        } as any,
      ],
    } as any);
    expect(hasLocalPendingChanges(order)).toBe(true);
  });

  it('returns true for an unsynced authorized pre-auth payment (real card lock)', () => {
    const order = makeOrder({
      payments: [
        {
          id: 'p1',
          amount: 50,
          method: 'Card',
          tip_amount: 0,
          total_collected: 50,
          itemsCovered: [],
          status: 'authorized',
          isPreAuth: true,
          isVoided: false,
          sync_status: 'pending',
          timestamp: new Date().toISOString(),
        } as any,
      ],
    } as any);
    expect(hasLocalPendingChanges(order)).toBe(true);
  });

  it('returns false when an authorized pre-auth is already synced (no risk left)', () => {
    const order = makeOrder({
      payments: [
        {
          id: 'p1',
          amount: 50,
          method: 'Card',
          tip_amount: 0,
          total_collected: 50,
          itemsCovered: [],
          status: 'authorized',
          isPreAuth: true,
          isVoided: false,
          sync_status: 'synced',
          timestamp: new Date().toISOString(),
        } as any,
      ],
    } as any);
    expect(hasLocalPendingChanges(order)).toBe(false);
  });

  it('returns false when a pre-auth was voided (no real lock)', () => {
    const order = makeOrder({
      payments: [
        {
          id: 'p1',
          amount: 50,
          method: 'Card',
          tip_amount: 0,
          total_collected: 50,
          itemsCovered: [],
          status: 'authorized',
          isPreAuth: true,
          isVoided: true,
          sync_status: 'pending',
          timestamp: new Date().toISOString(),
        } as any,
      ],
    } as any);
    expect(hasLocalPendingChanges(order)).toBe(false);
  });
});

// ===========================================================================
// detectConflict — flag ON (silence remote-edit toasts)
// ===========================================================================

describe('detectConflict — flag ON (silence remote-edit toasts)', () => {
  const { detectConflict } = loadService('1');

  it("downgrades to severity='silent' when locally clean and server removed an item", () => {
    const local = makeOrder({
      items: [
        makeItem({ id: 'a', db_order_item_id: 'srv-a' }),
        makeItem({ id: 'b', db_order_item_id: 'srv-b' }),
      ] as any,
    });
    const server = makeServerSnapshot(local, {
      items: [makeItem({ id: 'a', db_order_item_id: 'srv-a' })] as any,
    });
    const result = detectConflict(local, server as any);
    expect(result?.severity).toBe('silent');
    expect(result?.conflictType).toBe('item_removed');
  });

  it("does NOT silence when local has a pending unsynced item (real conflict)", () => {
    const local = makeOrder({
      items: [
        makeItem({ id: 'a', db_order_item_id: 'srv-a' }),
        makeItem({ id: 'b', db_order_item_id: 'srv-b' }),
        // unsynced local addition — has something at risk
        makeItem({ id: 'c', db_order_item_id: undefined }),
      ] as any,
    });
    const server = makeServerSnapshot(local, {
      items: [makeItem({ id: 'a', db_order_item_id: 'srv-a' })] as any,
    });
    const result = detectConflict(local, server as any);
    expect(result?.severity).not.toBe('silent');
    // item_removed → 'warning' per determineSeverity
    expect(result?.severity).toBe('warning');
  });

  it('does NOT silence a payment-processed change even on a locally-clean order', () => {
    // This is the regression test for the original plan's hard bug:
    // payment conflicts on synced orders MUST always go through.
    const local = makeOrder({ amount_paid: 0, paid_status: 'Unpaid' } as any);
    const server = makeServerSnapshot(local, {
      amount_paid: 25,
      paid_status: 'Partial',
    } as any);
    const result = detectConflict(local, server as any);
    expect(result).not.toBeNull();
    expect(result?.severity).toBe('critical');
    expect(result?.conflictType).toBe('payment');
  });

  it('returns null when sync_version is older or equal (existing guard preserved)', () => {
    const local = makeOrder({ sync_version: 5 } as any);
    const server = makeServerSnapshot(local, { sync_version: 5 });
    expect(detectConflict(local, server as any)).toBeNull();
  });

  it('returns null when server transitions to void/cancelled (existing guard)', () => {
    const local = makeOrder();
    const server = makeServerSnapshot(local, { order_status: 'void' });
    expect(detectConflict(local, server as any)).toBeNull();
  });
});

// ===========================================================================
// detectConflict — flag OFF (pre-PR-B behavior)
// ===========================================================================

describe('detectConflict — flag OFF (pre-PR-B behavior)', () => {
  const { detectConflict } = loadService('0');

  it("emits 'warning' (not 'silent') for a remote item removal on a clean order", () => {
    const local = makeOrder({
      items: [
        makeItem({ id: 'a', db_order_item_id: 'srv-a' }),
        makeItem({ id: 'b', db_order_item_id: 'srv-b' }),
      ] as any,
    });
    const server = makeServerSnapshot(local, {
      items: [makeItem({ id: 'a', db_order_item_id: 'srv-a' })] as any,
    });
    const result = detectConflict(local, server as any);
    expect(result?.severity).toBe('warning');
  });

  it('still escalates payment conflicts to critical', () => {
    const local = makeOrder({ amount_paid: 0, paid_status: 'Unpaid' } as any);
    const server = makeServerSnapshot(local, {
      amount_paid: 25,
      paid_status: 'Partial',
    } as any);
    const result = detectConflict(local, server as any);
    expect(result?.severity).toBe('critical');
  });
});
