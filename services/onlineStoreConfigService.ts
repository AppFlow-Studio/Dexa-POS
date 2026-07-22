/**
 * OnlineStoreConfigService — POS read/write for the operational subset of
 * `online_store_config` (the same table the website dashboard manages).
 *
 * The POS only touches day-to-day operational switches; identity, branding,
 * SEO, payment, and tipping stay dashboard/HQ-only. Writes go through the
 * `online_store_config_merchant_write` RLS policy (Clerk staff token).
 *
 * Server-side enforcement is authoritative: the guest storefront and
 * create-online-order edge function read these columns directly, so a saved
 * change takes effect on the next guest request — no broadcast needed.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export interface PosOnlineStoreSettings {
  id: string;
  locationId: string;
  storeName: string | null;
  slug: string | null;
  customDomain: string | null;
  /** Store online/offline (maps to is_active). */
  isActive: boolean;
  acceptsPickup: boolean;
  acceptsDelivery: boolean;
  /** QR dine-in on/off (maps to accepts_dine_in). */
  acceptsDineIn: boolean;
  autoAcceptOrders: boolean;
  /** Prep lead time in minutes (maps to estimated_prep_minutes). */
  estimatedPrepMinutes: number;
  /** Minimum order in dollars (maps to min_order). */
  minOrder: number;
  /** Emergency QR kill switch. */
  qrKillSwitch: boolean;
}

export type PosOnlineStoreSettingsPatch = Partial<
  Pick<
    PosOnlineStoreSettings,
    | "isActive"
    | "acceptsPickup"
    | "acceptsDelivery"
    | "acceptsDineIn"
    | "autoAcceptOrders"
    | "estimatedPrepMinutes"
    | "minOrder"
    | "qrKillSwitch"
  >
>;

const SELECT_COLUMNS =
  "id, location_id, store_name, slug, custom_domain, is_active, accepts_pickup, accepts_delivery, accepts_dine_in, auto_accept_orders, estimated_prep_minutes, min_order, qr_kill_switch";

function mapRow(row: any): PosOnlineStoreSettings {
  return {
    id: String(row.id),
    locationId: String(row.location_id),
    storeName: row.store_name ?? null,
    slug: row.slug ?? null,
    customDomain: row.custom_domain ?? null,
    isActive: row.is_active === true,
    acceptsPickup: row.accepts_pickup === true,
    acceptsDelivery: row.accepts_delivery === true,
    acceptsDineIn: row.accepts_dine_in === true,
    autoAcceptOrders: row.auto_accept_orders === true,
    estimatedPrepMinutes: Number(row.estimated_prep_minutes ?? 0),
    minOrder: Number(row.min_order ?? 0),
    qrKillSwitch: row.qr_kill_switch === true,
  };
}

export class OnlineStoreConfigService {
  /** Read the operational settings row for a location (null = store not set up). */
  static async get(
    client: SupabaseClient,
    locationId: string,
  ): Promise<{ data: PosOnlineStoreSettings | null; error: any }> {
    const { data, error } = await client
      .from("online_store_config")
      .select(SELECT_COLUMNS)
      .eq("location_id", locationId)
      .maybeSingle();
    if (error) return { data: null, error };
    return { data: data ? mapRow(data) : null, error: null };
  }

  /** Patch operational columns. Returns the updated row. */
  static async update(
    client: SupabaseClient,
    configId: string,
    patch: PosOnlineStoreSettingsPatch,
  ): Promise<{ data: PosOnlineStoreSettings | null; error: any }> {
    const row: Record<string, unknown> = {};
    if (patch.isActive !== undefined) row.is_active = patch.isActive;
    if (patch.acceptsPickup !== undefined)
      row.accepts_pickup = patch.acceptsPickup;
    if (patch.acceptsDelivery !== undefined)
      row.accepts_delivery = patch.acceptsDelivery;
    if (patch.acceptsDineIn !== undefined)
      row.accepts_dine_in = patch.acceptsDineIn;
    if (patch.autoAcceptOrders !== undefined)
      row.auto_accept_orders = patch.autoAcceptOrders;
    if (patch.estimatedPrepMinutes !== undefined)
      row.estimated_prep_minutes = Math.max(
        0,
        Math.round(patch.estimatedPrepMinutes),
      );
    if (patch.minOrder !== undefined) {
      const v = Math.max(0, Number(patch.minOrder) || 0);
      row.min_order = v;
      row.min_order_cents = Math.round(v * 100);
    }
    if (patch.qrKillSwitch !== undefined)
      row.qr_kill_switch = patch.qrKillSwitch;

    if (Object.keys(row).length === 0) {
      return { data: null, error: { message: "Nothing to update" } };
    }

    const { data, error } = await client
      .from("online_store_config")
      .update(row)
      .eq("id", configId)
      .select(SELECT_COLUMNS)
      .single();
    if (error) return { data: null, error };
    return { data: mapRow(data), error: null };
  }
}
