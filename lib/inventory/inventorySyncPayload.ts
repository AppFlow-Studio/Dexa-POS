/**
 * The ONE transform from the inventory sync wire shape to the shape
 * `useInventoryStore` holds — Phase 5.
 *
 * This module exists for the same reason `readMenuSnapshot` hands its result to
 * the same `setMenuData` a live sync uses: a screen rendered from the local
 * mirror must not be able to diverge from the same screen rendered from the
 * network. The only way to guarantee that is to have one mapping, run by both
 * paths, over the same inputs.
 *
 * So the mirror stores the RAW inputs — the `get_pos_inventory_sync` rows, the
 * direct `inventory_items` rows and the `vendors` rows — and rebuilds them on
 * read. `mapInventorySyncPayload` then runs over reconstructed inputs exactly
 * as it runs over live ones. "Offline shows what online shows" reduces to "the
 * inputs round-trip", which is a property a test can assert.
 *
 * It also de-duplicates a mapping that was already written twice, character for
 * character, in `hooks/pos/useInventorySync.ts` and
 * `useInventoryStore.fetchInventoryItems` — two copies that could drift apart
 * and produce different stock for the same item depending on which one ran.
 */
import type { InventoryItem, InventoryUnitType, Vendor } from "@/lib/types";

/**
 * A row from `get_pos_inventory_sync`. The RPC resolves effective cost,
 * reorder point and stock quantity server-side out of `location_inventory_stock`
 * and `location_inventory_overrides` — which is precisely why this whole entity
 * is a snapshot and not a keyset delta (see lib/db/descriptors/inventory.ts).
 */
export interface RpcInventoryRow {
  id: string;
  name: string;
  sku: string | null;
  unit_type: string;
  stock_mode: string | null;
  reorder_point: number | null;
  reorder_quantity: number | null;
  is_active: boolean;
  updated_at: string | null;
  stock_quantity: number;
  effective_cost: number;
  effective_reorder_point: number | null;
}

/** The columns the direct `inventory_items` select asks for. */
export interface DirectInventoryRow {
  id: string;
  name: string;
  category: string | null;
  current_stock: number | null;
  unit_type: string;
  reorder_point: number | null;
  cost_per_unit: number | null;
  vendor_id: string | null;
  stock_mode: string | null;
  updated_at: string | null;
}

/** The columns the `vendors` select asks for. */
export interface RawVendorRow {
  id: string;
  name: string;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  address_line1: string | null;
  city: string | null;
  state: string | null;
  zip_code: string | null;
}

/** Everything one inventory sync fetched, before any mapping. */
export interface RawInventorySync {
  rpcRows: RpcInventoryRow[];
  itemRows: DirectInventoryRow[];
  vendorRows: RawVendorRow[];
}

/** What the store consumes. */
export interface InventorySyncData {
  inventoryItems: InventoryItem[];
  vendors: Vendor[];
  menuRecipes: any[];
  modifierRecipes: any[];
}

/**
 * `stock_mode` is a three-valued remote enum and the app's tracking mode is a
 * different three-valued set; the mapping is not one-to-one.
 *
 * The `in_stock` arm is the load-bearing one: an item flagged in/out of stock
 * that nevertheless carries a stock number or a reorder point is really being
 * counted, so it is shown as a quantity item. Preserved verbatim from the two
 * copies this module replaces — changing it would silently re-classify every
 * item in the catalog.
 */
export function normalizeInventoryTrackingMode(
  mode: string | null | undefined,
  currentStock?: number | null,
  reorderPoint?: number | null,
): InventoryItem["stockTrackingMode"] {
  if (mode === "stock_tracking") return "quantity";
  if (
    mode === "in_stock" &&
    ((currentStock !== null && currentStock !== undefined) ||
      (reorderPoint !== null && reorderPoint !== undefined))
  ) {
    return "quantity";
  }
  if (mode === "in_stock" || mode === "out_of_stock") return mode;
  return "quantity";
}

/**
 * Merge the resolved RPC rows with the direct table rows.
 *
 * The precedence is deliberate and is preserved exactly as it was: the DIRECT
 * row wins for name/category/cost/reorder point, and the RPC wins for
 * `stock_quantity`. That looks backwards for a "resolved" RPC until you notice
 * the direct read exists precisely because the sync RPC can lag a recent write
 * — so the direct row is the fresher of the two for anything it carries, while
 * stock is the one value the RPC resolves per location and the direct row
 * cannot supply.
 *
 * The direct rows are also the row UNIVERSE: an RPC row with no direct row is
 * dropped (the item is not active at this location), and a direct row with no
 * RPC row is appended unresolved.
 */
export function mapInventorySyncPayload(
  raw: RawInventorySync,
  locationId: string,
): InventorySyncData {
  const itemRowMap = new Map(raw.itemRows.map((row) => [row.id, row]));

  const inventoryItems: InventoryItem[] = raw.rpcRows
    .filter((i) => itemRowMap.has(i.id))
    .map((i) => {
      const directRow = itemRowMap.get(i.id);
      return {
        id: i.id,
        name: directRow?.name ?? i.name,
        category: directRow?.category ?? "",
        description: null,
        image: null,
        stockQuantity: i.stock_quantity ?? directRow?.current_stock ?? 0,
        unit: directRow?.unit_type ?? i.unit_type,
        unitType: (directRow?.unit_type ?? i.unit_type) as InventoryUnitType,
        reorderThreshold:
          directRow?.reorder_point ??
          i.effective_reorder_point ??
          i.reorder_point ??
          0,
        cost: directRow?.cost_per_unit ?? i.effective_cost ?? 0,
        vendorId: directRow?.vendor_id ?? null,
        locationId,
        isGlobal: false,
        stockTrackingMode: normalizeInventoryTrackingMode(
          directRow?.stock_mode,
          directRow?.current_stock,
          directRow?.reorder_point,
        ),
      };
    });

  const rpcItemIds = new Set(inventoryItems.map((item) => item.id));
  const missingDirectItems: InventoryItem[] = raw.itemRows
    .filter((row) => !rpcItemIds.has(row.id))
    .map((row) => ({
      id: row.id,
      name: row.name,
      category: row.category ?? "",
      description: null,
      image: null,
      stockQuantity: row.current_stock ?? 0,
      unit: row.unit_type,
      unitType: row.unit_type as InventoryUnitType,
      reorderThreshold: row.reorder_point ?? 0,
      cost: row.cost_per_unit ?? 0,
      vendorId: row.vendor_id ?? null,
      locationId,
      isGlobal: false,
      stockTrackingMode: normalizeInventoryTrackingMode(
        row.stock_mode,
        row.current_stock,
        row.reorder_point,
      ),
    }));

  const vendors: Vendor[] = raw.vendorRows.map((v) => ({
    id: v.id,
    name: v.name,
    contactName: v.contact_name ?? "",
    email: v.email ?? null,
    phone: v.phone ?? null,
    address:
      [v.address_line1, v.city, v.state].filter(Boolean).join(", ") || null,
    website: null,
    description: "",
  }));

  return {
    inventoryItems: [...inventoryItems, ...missingDirectItems],
    vendors,
    menuRecipes: [],
    modifierRecipes: [],
  };
}

/** The exact column lists the two selects use. Shared so the mirror cannot ask for less. */
export const INVENTORY_ITEM_COLUMNS =
  "id, name, category, current_stock, unit_type, reorder_point, cost_per_unit, vendor_id, stock_mode, updated_at";

export const VENDOR_COLUMNS =
  "id, name, contact_name, email, phone, address_line1, city, state, zip_code";
