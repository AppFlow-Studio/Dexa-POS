import {
  CartItem,
  ExternalExpense,
  ExternalExpenseLineItem,
  InventoryItem,
  POLineItem,
  PurchaseOrder,
  Vendor,
} from "@/lib/types";
import { InventoryService } from "@/services/inventoryService";
import { SupabaseClient } from "@supabase/supabase-js";
import { create } from "zustand";
import { useEmployeeStore } from "./useEmployeeStore";
import { useMenuStore } from "./useMenuStore";
import { useStoreSettingsStore } from "./useStoreSettingsStore";

type PurchaseOrderStatus = PurchaseOrder["status"];
type InventoryTrackingMode = InventoryItem["stockTrackingMode"];

const normalizeInventoryTrackingMode = (
  mode: string | null | undefined,
  currentStock?: number | null,
  reorderPoint?: number | null,
): InventoryTrackingMode => {
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
};

const toDbInventoryTrackingMode = (
  mode: InventoryTrackingMode | undefined,
): "stock_tracking" | "in_stock" | "out_of_stock" => {
  if (mode === "in_stock" || mode === "out_of_stock") return mode;
  return "stock_tracking";
};

const purchaseOrderStatusToDb = (status: PurchaseOrderStatus): string => {
  switch (status) {
    case "Draft":
      return "draft";
    case "Pending Delivery":
      return "pending";
    case "Awaiting Payment":
      return "received";
    case "Paid":
      return "paid";
    case "Cancelled":
      return "cancelled";
    default:
      return "draft";
  }
};

const normalizePurchaseOrderStatus = (
  status: string | null | undefined,
): PurchaseOrderStatus => {
  const normalized = (status ?? "").trim().toLowerCase().replace(/[_-]+/g, " ");
  switch (normalized) {
    case "draft":
      return "Draft";
    case "pending":
    case "pending delivery":
      return "Pending Delivery";
    case "received":
    case "awaiting payment":
      return "Awaiting Payment";
    case "paid":
      return "Paid";
    case "cancelled":
      return "Cancelled";
    default:
      return "Draft";
  }
};

const normalizePaymentMethod = (
  method: string | null | undefined,
): "Card" | "Cash" | undefined => {
  const normalized = (method ?? "").trim().toLowerCase();
  if (normalized === "card") return "Card";
  if (normalized === "cash") return "Cash";
  return undefined;
};

const toDbPurchaseOrderPaymentMethod = (
  method: "Card" | "Cash",
): "card" | "cash" => {
  return method === "Card" ? "card" : "cash";
};

const calculatePurchaseOrderTotal = (items: POLineItem[]) =>
  items.reduce((sum, item) => sum + item.quantity * item.cost, 0);

const calculateExternalExpenseTotal = (items: ExternalExpenseLineItem[]) =>
  items.reduce((sum, item) => sum + item.totalAmount, 0);

const EXPENSE_META_PREFIX = "DEXA_EXPENSE_META:";

const buildExpenseNotes = (
  expense: Omit<ExternalExpense, "id" | "expenseNumber">,
) => {
  const metadata = {
    relatedPOId: expense.relatedPOId ?? null,
    relatedPONumber: expense.relatedPONumber ?? null,
    storeLocation: expense.storeLocation ?? null,
  };

  const noteBody = expense.notes?.trim() ?? "";
  return `${EXPENSE_META_PREFIX}${JSON.stringify(metadata)}\n${noteBody}`.trim();
};

const parseExpenseNotes = (value: string | null | undefined) => {
  const raw = (value ?? "").trim();
  if (!raw.startsWith(EXPENSE_META_PREFIX)) {
    return {
      notes: raw || undefined,
      relatedPOId: undefined,
      relatedPONumber: undefined,
      storeLocation: undefined,
    };
  }

  const newlineIndex = raw.indexOf("\n");
  const metaRaw =
    newlineIndex === -1
      ? raw.slice(EXPENSE_META_PREFIX.length)
      : raw.slice(EXPENSE_META_PREFIX.length, newlineIndex);
  const noteBody =
    newlineIndex === -1 ? "" : raw.slice(newlineIndex + 1).trim();

  try {
    const metadata = JSON.parse(metaRaw) as {
      relatedPOId?: string | null;
      relatedPONumber?: string | null;
      storeLocation?: string | null;
    };

    return {
      notes: noteBody || undefined,
      relatedPOId: metadata.relatedPOId ?? undefined,
      relatedPONumber: metadata.relatedPONumber ?? undefined,
      storeLocation: metadata.storeLocation ?? undefined,
    };
  } catch {
    return {
      notes: raw || undefined,
      relatedPOId: undefined,
      relatedPONumber: undefined,
      storeLocation: undefined,
    };
  }
};

const getCurrentStoreContext = () => {
  const selectedStore = useStoreSettingsStore.getState().selectedStore;
  if (!selectedStore?.id || !selectedStore.merchant_id) {
    throw new Error("Selected store is required for purchase orders.");
  }

  return {
    locationId: selectedStore.id,
    merchantId: selectedStore.merchant_id,
  };
};

const getActiveEmployeeContext = () => {
  const { activeEmployeeId, employees } = useEmployeeStore.getState();
  const employee =
    employees.find((entry) => entry.id === activeEmployeeId) ?? null;

  return {
    userId: activeEmployeeId ?? "",
    userName: employee?.fullName ?? "POS User",
  };
};

const mapPurchaseOrderFromDb = (po: any): PurchaseOrder => {
  const employeeStore = useEmployeeStore.getState();
  const createdByEmployee = po.created_by
    ? (employeeStore.employees.find((entry) => entry.id === po.created_by) ??
      null)
    : null;
  const dbItems = (po.purchase_order_items ?? []).filter(
    (item: any) => item.inventory_item_id,
  );
  const items: POLineItem[] = dbItems.map((item: any) => ({
    inventoryItemId: item.inventory_item_id,
    quantity: item.quantity_ordered ?? 0,
    cost: item.unit_cost ?? 0,
  }));

  const receivedItems: POLineItem[] | undefined = dbItems.some(
    (item: any) =>
      item.quantity_received !== null && item.quantity_received !== undefined,
  )
    ? dbItems.map((item: any) => ({
        inventoryItemId: item.inventory_item_id,
        quantity: item.quantity_received ?? item.quantity_ordered ?? 0,
        cost: item.unit_cost ?? 0,
      }))
    : undefined;

  const paymentRecord = Array.isArray(po.purchase_order_payments)
    ? po.purchase_order_payments[0]
    : null;
  const paymentMethod = normalizePaymentMethod(
    paymentRecord?.payment_method ?? po.payment_method,
  );

  return {
    id: po.id,
    poNumber: po.po_number,
    vendorId: po.vendor_id ?? "",
    status: normalizePurchaseOrderStatus(po.status),
    items,
    originalItems: items,
    receivedItems,
    createdAt: po.created_at ?? po.ordered_at ?? new Date().toISOString(),
    deliveryLoggedAt: po.delivered_at ?? po.received_at ?? undefined,
    deliveryPhotos: [],
    discrepancyNotes: po.delivery_notes ?? undefined,
    createdByEmployeeId: po.created_by ?? undefined,
    createdByEmployeeName: createdByEmployee?.fullName ?? undefined,
    payment: paymentMethod
      ? {
          method: paymentMethod,
          amount:
            paymentRecord?.amount ??
            po.total_amount ??
            calculatePurchaseOrderTotal(items),
          paidAt:
            paymentRecord?.paid_at ?? po.paid_at ?? new Date().toISOString(),
          cardLast4:
            paymentRecord?.card_last_four ?? po.card_last_four ?? undefined,
          paidToEmployee: paymentRecord?.paid_to ?? undefined,
        }
      : undefined,
  };
};

const mapExternalExpenseFromDb = (po: any): ExternalExpense => {
  const employeeStore = useEmployeeStore.getState();
  const createdByEmployee = po.created_by
    ? (employeeStore.employees.find((entry) => entry.id === po.created_by) ??
      null)
    : null;
  const parsedNotes = parseExpenseNotes(po.expense_notes);
  const items: ExternalExpenseLineItem[] = (po.purchase_order_items ?? [])
    .filter((item: any) => item.inventory_item_id || item.item_name)
    .map((item: any) => {
      const quantity = item.quantity_ordered ?? item.quantity_received ?? 0;
      const unitPrice = item.unit_cost ?? 0;
      return {
        inventoryItemId: item.inventory_item_id ?? "",
        itemName: item.item_name ?? "Expense Item",
        quantity,
        unitPrice,
        totalAmount: quantity * unitPrice,
      };
    });

  return {
    id: po.id,
    expenseNumber: po.po_number,
    totalAmount: po.total_amount ?? calculateExternalExpenseTotal(items),
    purchasedByEmployeeId: po.created_by ?? "",
    purchasedByEmployeeName: createdByEmployee?.fullName ?? "Unknown Employee",
    purchasedAt: po.created_at ?? new Date().toISOString(),
    items,
    notes: parsedNotes.notes,
    relatedPOId: parsedNotes.relatedPOId,
    relatedPONumber: parsedNotes.relatedPONumber,
    storeName: po.expense_vendor_name ?? undefined,
    storeLocation: parsedNotes.storeLocation,
  };
};

const getNextPurchaseOrderNumber = async (
  supabase: SupabaseClient,
  merchantId: string,
  locationId: string,
) => {
  // Count only POs (not expenses) for this merchant+location
  const { count, error } = await supabase
    .from("purchase_orders")
    .select("id", { count: "exact", head: true })
    .eq("merchant_id", merchantId)
    .eq("location_id", locationId)
    .or("is_adhoc_expense.is.null,is_adhoc_expense.eq.false");

  if (error) {
    throw error;
  }

  const nextSeq = (count ?? 0) + 1;
  // Pad to at least 4 digits; auto-extends to 5, 6, etc. as the counter grows
  const padded = String(nextSeq).padStart(
    Math.max(4, String(nextSeq).length),
    "0",
  );
  return `PO-${padded}`;
};

const getNextExpenseNumber = async (
  supabase: SupabaseClient,
  merchantId: string,
  locationId: string,
) => {
  // Count only expenses for this merchant+location
  const { count, error } = await supabase
    .from("purchase_orders")
    .select("id", { count: "exact", head: true })
    .eq("merchant_id", merchantId)
    .eq("location_id", locationId)
    .eq("is_adhoc_expense", true);

  if (error) {
    throw error;
  }

  const nextSeq = (count ?? 0) + 1;
  // Pad to at least 4 digits; auto-extends to 5, 6, etc. as the counter grows
  const padded = String(nextSeq).padStart(
    Math.max(4, String(nextSeq).length),
    "0",
  );
  return `EXP-${padded}`;
};

// --- STORE INTERFACE ---
interface InventoryState {
  supabase: SupabaseClient | null;
  inventoryItems: InventoryItem[];
  vendors: Vendor[];
  purchaseOrders: PurchaseOrder[];
  externalExpenses: ExternalExpense[];

  // --- ACTIONS ---
  setSupabaseClient: (client: SupabaseClient) => void;
  setInventoryData: (data: {
    items: InventoryItem[];
    vendors: Vendor[];
    purchaseOrders?: PurchaseOrder[];
  }) => void; // Called by sync loop
  fetchInventoryItems: (locationId: string) => Promise<void>;
  fetchVendors: (locationId: string) => Promise<void>;
  fetchPurchaseOrders: (locationId?: string) => Promise<void>;

  // Async Actions (Call Backend + Optimistic Update)
  addVendor: (
    vendorData: Omit<Vendor, "id">,
    merchantId: string,
    locationId: string,
  ) => Promise<void>;
  updateVendor: (
    vendorId: string,
    updates: Omit<Vendor, "id">,
  ) => Promise<void>;
  deleteVendor: (vendorId: string) => Promise<void>;

  addInventoryItem: (
    itemData: Omit<InventoryItem, "id">,
    locationId: string,
  ) => Promise<void>;
  updateInventoryItem: (
    itemId: string,
    updates: Partial<InventoryItem>,
    locationId: string,
  ) => Promise<void>;
  deleteInventoryItem: (itemId: string) => Promise<void>;

  createPurchaseOrder: (
    po: Omit<PurchaseOrder, "id" | "poNumber" | "createdAt">,
  ) => Promise<void>;
  updatePurchaseOrder: (
    poId: string,
    updates: Partial<Omit<PurchaseOrder, "id">>,
  ) => Promise<void>;
  deletePurchaseOrder: (poId: string) => Promise<void>;
  // New lifecycle actions
  submitPurchaseOrder: (poId: string) => Promise<void>; // Draft -> Pending Delivery
  logDeliveryForPO: (
    poId: string,
    data: {
      photos?: string[];
      deliveredAt?: string;
      notes?: string;
      receivedItems: POLineItem[];
    },
  ) => Promise<void>; // -> Awaiting Payment
  logPaymentForPO: (
    poId: string,
    data: {
      method: "Card" | "Cash";
      amount: number;
      paidAt?: string;
      cardLast4?: string;
      paidToEmployee?: string;
    },
  ) => Promise<void>; // -> Paid
  cancelPurchaseOrder: (poId: string) => Promise<void>; // -> Cancelled
  // External expense actions
  addExternalExpense: (
    expense: Omit<ExternalExpense, "id" | "expenseNumber">,
  ) => Promise<void>;
  updateExternalExpense: (
    expenseId: string,
    updates: Partial<Omit<ExternalExpense, "id" | "expenseNumber">>,
  ) => void;
  removeExternalExpense: (expenseId: string) => Promise<void>;
  // --- NEW ACTIONS ---
  decrementStockFromSale: (soldItems: CartItem[]) => void;
  decrementStockFromItem: (cartItem: CartItem) => void;
  getLowStockItems: () => InventoryItem[];
}

// --- STORE CREATION ---
export const useInventoryStore = create<InventoryState>((set, get) => ({
  supabase: null,
  inventoryItems: [],
  vendors: [],
  purchaseOrders: [], // TODO: Wire up POs to backend later
  externalExpenses: [], // TODO: Wire up to backend later

  setSupabaseClient: (client) => set({ supabase: client }),

  setInventoryData: ({ items, vendors, purchaseOrders }) => {
    set({
      inventoryItems: items,
      vendors: vendors,
      ...(purchaseOrders ? { purchaseOrders } : {}),
    });
  },

  fetchInventoryItems: async (locationId) => {
    const { supabase } = get();
    if (!supabase) return;

    const { data, error } = await supabase.rpc("get_pos_inventory_sync", {
      p_location_id: locationId,
    });

    if (error) {
      console.error("[InventoryStore] fetchInventoryItems error:", error);
      return;
    }

    // RPC returns a flat JSON array of inventory rows
    const rows = (data as any[]) ?? [];

    const { data: itemRows } = await supabase
      .from("inventory_items")
      .select(
        "id, name, category, current_stock, unit_type, reorder_point, cost_per_unit, vendor_id, stock_mode",
      )
      .eq("location_id", locationId)
      .eq("is_active", true);

    const itemRowMap = new Map(
      (itemRows ?? []).map((row: any) => [row.id, row]),
    );

    const inventoryItems: InventoryItem[] = rows
      .filter((i: any) => itemRowMap.has(i.id))
      .map((i: any) => {
        const directRow = itemRowMap.get(i.id);
        return {
          id: i.id,
          name: directRow?.name ?? i.name,
          category: directRow?.category ?? "",
          description: null,
          image: null,
          stockQuantity: i.stock_quantity ?? directRow?.current_stock ?? 0,
          unit: directRow?.unit_type ?? i.unit_type,
          unitType: directRow?.unit_type ?? i.unit_type,
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
    const missingDirectItems: InventoryItem[] = (itemRows ?? [])
      .filter((row: any) => !rpcItemIds.has(row.id))
      .map((row: any) => ({
        id: row.id,
        name: row.name,
        category: row.category ?? "",
        description: null,
        image: null,
        stockQuantity: row.current_stock ?? 0,
        unit: row.unit_type,
        unitType: row.unit_type,
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

    const itemsWithVendor = [...inventoryItems, ...missingDirectItems];

    const { data: vendorsData } = await supabase
      .from("vendors")
      .select(
        "id, name, contact_name, email, phone, address_line1, city, state, zip_code",
      )
      .eq("location_id", locationId)
      .eq("is_active", true);

    const vendors: Vendor[] = (vendorsData ?? []).map((v: any) => ({
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

    set({ inventoryItems: itemsWithVendor, vendors });
  },

  fetchVendors: async (locationId) => {
    const { supabase } = get();
    if (!supabase || !locationId) return;

    const { data, error } = await supabase
      .from("vendors")
      .select(
        "id, name, contact_name, email, phone, address_line1, city, state, zip_code",
      )
      .eq("location_id", locationId)
      .eq("is_active", true);

    if (error) {
      console.error("[InventoryStore] fetchVendors error:", error);
      return;
    }

    const vendors: Vendor[] = (data ?? []).map((v: any) => ({
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

    set({ vendors });
  },

  fetchPurchaseOrders: async (locationIdArg) => {
    const { supabase } = get();
    if (!supabase) return;

    const locationId =
      locationIdArg ?? useStoreSettingsStore.getState().selectedStore?.id;
    if (!locationId) return;

    const { data, error } = await supabase
      .from("purchase_orders")
      .select(
        `
        id,
        po_number,
        vendor_id,
        status,
        is_adhoc_expense,
        created_at,
        created_by,
        ordered_at,
        delivered_at,
        received_at,
        delivery_notes,
        expense_category,
        expense_notes,
        expense_vendor_name,
        delivery_logged_by_name,
        payment_method,
        paid_at,
        card_last_four,
        total_amount,
        purchase_order_items (
          inventory_item_id,
          quantity_ordered,
          quantity_received,
          unit_cost
        ),
        purchase_order_payments (
          amount,
          payment_method,
          paid_at,
          card_last_four,
          paid_to
        )
      `,
      )
      .eq("location_id", locationId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[InventoryStore] fetchPurchaseOrders error:", error);
      return;
    }

    const rows = data ?? [];
    const purchaseOrders = rows
      .filter((po: any) => !po.is_adhoc_expense && po.vendor_id)
      .map(mapPurchaseOrderFromDb);
    const externalExpenses = rows
      .filter((po: any) => !!po.is_adhoc_expense)
      .map(mapExternalExpenseFromDb);

    set({ purchaseOrders, externalExpenses });
  },

  addVendor: async (vendorData, merchantId, locationId) => {
    const { supabase } = get();
    if (!supabase || !merchantId) return;

    const { error } = await supabase.from("vendors").insert({
      merchant_id: merchantId,
      location_id: locationId,
      name: vendorData.name,
      contact_name: vendorData.contactName || null,
      email: vendorData.email || null,
      phone: vendorData.phone || null,
      address_line1: vendorData.address || null,
      is_active: true,
    });

    if (error) {
      console.error("[InventoryStore] addVendor error:", error);
      throw error;
    }

    await get().fetchVendors(locationId);
  },

  updateVendor: async (vendorId, updates) => {
    const { supabase } = get();
    if (!supabase) return;

    // Optimistic update for instant UI feedback
    set((state) => ({
      vendors: state.vendors.map((v) =>
        v.id === vendorId ? { ...v, ...updates } : v,
      ),
    }));

    const { error } = await supabase
      .from("vendors")
      .update({
        name: updates.name,
        contact_name: updates.contactName || null,
        email: updates.email || null,
        phone: updates.phone || null,
        address_line1: updates.address || null,
      })
      .eq("id", vendorId);

    if (error) {
      console.error("[InventoryStore] updateVendor error:", error);
      throw error;
    }
  },

  deleteVendor: async (vendorId) => {
    const { supabase, vendors } = get();
    if (!supabase) return;

    // Optimistic removal
    set((state) => ({
      vendors: state.vendors.filter((v) => v.id !== vendorId),
    }));

    const { error } = await supabase
      .from("vendors")
      .update({ is_active: false })
      .eq("id", vendorId);

    if (error) {
      console.error("[InventoryStore] deleteVendor error:", error);
      set({ vendors }); // revert
      throw error;
    }
  },

  addInventoryItem: async (itemData, locationId) => {
    const { supabase } = get();
    if (!supabase) return;

    const { stockQuantity, ...itemDetails } = itemData;
    const newItem = await InventoryService.upsertInventoryItem(
      supabase,
      itemDetails as any,
      locationId,
    );

    // The RPC doesn't support vendor_id — patch it directly after creation
    const newItemId = newItem?.id ?? newItem;
    if (newItemId && itemData.vendorId) {
      await supabase
        .from("inventory_items")
        .update({ vendor_id: itemData.vendorId })
        .eq("id", newItemId);
    }

    const directItemPatch: Record<string, unknown> = {
      reorder_point: itemData.reorderThreshold,
      stock_mode: toDbInventoryTrackingMode(itemData.stockTrackingMode),
    };

    if (newItemId) {
      const { error: directPatchError } = await supabase
        .from("inventory_items")
        .update(directItemPatch)
        .eq("id", newItemId);

      if (directPatchError) {
        throw directPatchError;
      }
    }

    if (newItemId && stockQuantity !== undefined) {
      const { error: stockError } = await supabase.rpc(
        "app_set_location_stock",
        {
          p_inventory_item_id: newItemId,
          p_location_id: locationId,
          p_quantity: stockQuantity,
        },
      );

      if (stockError) {
        throw stockError;
      }
    }

    // Re-fetch to get the real item back with correct shape
    await get().fetchInventoryItems(locationId);
    // Invalidate TanStack query cache so PosSyncProvider also sees fresh data
    const { queryClient } =
      require("@/contexts/TanstackProvider") as typeof import("@/contexts/TanstackProvider");
    queryClient.invalidateQueries({ queryKey: ["inventory_sync", locationId] });
  },

  updateInventoryItem: async (itemId, updates, locationId) => {
    const { supabase, inventoryItems } = get();
    if (!supabase) return;

    const oldItems = inventoryItems;
    const item = oldItems.find((i) => i.id === itemId);
    if (!item) return;

    // Optimistic Update
    set((state) => ({
      inventoryItems: state.inventoryItems.map((i) =>
        i.id === itemId ? { ...i, ...updates } : i,
      ),
    }));

    try {
      const { stockQuantity, stockUpdateReason, ...otherUpdates } = updates;

      if (item.isGlobal) {
        await InventoryService.updateGlobalItemLocationSettings(
          supabase,
          locationId,
          itemId,
          {
            stockQuantity:
              stockQuantity !== item.stockQuantity ? stockQuantity : undefined,
            stockUpdateReason: stockUpdateReason,
            costOverride:
              updates.cost !== undefined && updates.cost !== item.cost
                ? updates.cost
                : undefined,
            reorderThresholdOverride:
              updates.reorderThreshold !== undefined &&
              updates.reorderThreshold !== item.reorderThreshold
                ? updates.reorderThreshold
                : undefined,
          },
        );
      } else {
        if (Object.keys(otherUpdates).length > 0) {
          const merged = { ...item, ...otherUpdates };
          await InventoryService.upsertInventoryItem(
            supabase,
            merged as any,
            locationId,
          );
        }

        // Patch vendor_id directly since the RPC doesn't support it
        const directItemPatch: Record<string, unknown> = {};

        if ("vendorId" in updates) {
          directItemPatch.vendor_id = updates.vendorId ?? null;
        }

        if (updates.reorderThreshold !== undefined) {
          directItemPatch.reorder_point = updates.reorderThreshold;
        }

        if (updates.stockTrackingMode !== undefined) {
          directItemPatch.stock_mode = toDbInventoryTrackingMode(
            updates.stockTrackingMode,
          );
        }

        if (Object.keys(directItemPatch).length > 0) {
          const { error: directPatchError } = await supabase
            .from("inventory_items")
            .update(directItemPatch)
            .eq("id", itemId);
          if (directPatchError) throw directPatchError;
        }

        if (
          stockQuantity !== undefined &&
          stockQuantity !== item.stockQuantity
        ) {
          const { error: stockError } = await supabase.rpc(
            "app_set_location_stock",
            {
              p_inventory_item_id: itemId,
              p_location_id: locationId,
              p_quantity: stockQuantity,
            },
          );
          if (stockError) throw stockError;
        }
      }

      // Re-fetch to sync real state
      await get().fetchInventoryItems(locationId);
      const { queryClient } =
        require("@/contexts/TanstackProvider") as typeof import("@/contexts/TanstackProvider");
      queryClient.invalidateQueries({
        queryKey: ["inventory_sync", locationId],
      });
    } catch (e) {
      console.error(e);
      set({ inventoryItems: oldItems });
      throw e;
    }
  },

  deleteInventoryItem: async (itemId) => {
    const { supabase, inventoryItems } = get();
    if (!supabase) return;

    const oldItems = inventoryItems;
    set((state) => ({
      inventoryItems: state.inventoryItems.filter((i) => i.id !== itemId),
    }));

    try {
      await InventoryService.deleteInventoryItem(supabase, itemId);
    } catch (e) {
      console.error(e);
      set({ inventoryItems: oldItems });
      throw e;
    }
  },

  createPurchaseOrder: async (poData) => {
    const { supabase } = get();
    if (!supabase) return;

    const { merchantId, locationId } = getCurrentStoreContext();
    const { userId } = getActiveEmployeeContext();
    const now = new Date().toISOString();
    const poNumber = await getNextPurchaseOrderNumber(
      supabase,
      merchantId,
      locationId,
    );
    const totalAmount = calculatePurchaseOrderTotal(poData.items);
    const createdByUserId = poData.createdByEmployeeId ?? userId ?? null;

    const { data: purchaseOrderRow, error: purchaseOrderError } = await supabase
      .from("purchase_orders")
      .insert({
        merchant_id: merchantId,
        location_id: locationId,
        vendor_id: poData.vendorId,
        status: purchaseOrderStatusToDb(poData.status),
        po_number: poNumber,
        created_by: createdByUserId,
        ordered_at: poData.status === "Pending Delivery" ? now : null,
        total_amount: totalAmount,
      })
      .select("id")
      .single();

    if (purchaseOrderError) {
      console.error(
        "[InventoryStore] createPurchaseOrder error:",
        purchaseOrderError,
      );
      throw purchaseOrderError;
    }

    const purchaseOrderId = purchaseOrderRow.id;
    const lineItems = poData.items.map((item) => {
      const inventoryItem = get().inventoryItems.find(
        (entry) => entry.id === item.inventoryItemId,
      );

      return {
        purchase_order_id: purchaseOrderId,
        inventory_item_id: item.inventoryItemId,
        quantity_ordered: item.quantity,
        quantity_received: null,
        unit_cost: item.cost,
        item_name: inventoryItem?.name ?? null,
        item_category: inventoryItem?.category ?? null,
        item_unit_type: inventoryItem?.unitType ?? inventoryItem?.unit ?? null,
        item_sku: null,
      };
    });

    const { error: itemsError } = await supabase
      .from("purchase_order_items")
      .insert(lineItems);

    if (itemsError) {
      await supabase.from("purchase_orders").delete().eq("id", purchaseOrderId);
      console.error(
        "[InventoryStore] createPurchaseOrder items error:",
        itemsError,
      );
      throw itemsError;
    }

    await get().fetchPurchaseOrders(locationId);
  },
  updatePurchaseOrder: async (poId, updates) => {
    const { supabase, purchaseOrders } = get();
    if (!supabase) return;

    const existing = purchaseOrders.find((po) => po.id === poId);
    if (!existing || existing.status !== "Draft") {
      console.warn("Cannot edit a PO that is not in Draft status.");
      return;
    }

    const nextVendorId = updates.vendorId ?? existing.vendorId;
    const nextItems = updates.items ?? existing.items;
    const totalAmount = calculatePurchaseOrderTotal(nextItems);

    const { error: updateError } = await supabase
      .from("purchase_orders")
      .update({
        vendor_id: nextVendorId,
        total_amount: totalAmount,
      })
      .eq("id", poId);

    if (updateError) {
      console.error("[InventoryStore] updatePurchaseOrder error:", updateError);
      throw updateError;
    }

    if (updates.items) {
      const { error: deleteItemsError } = await supabase
        .from("purchase_order_items")
        .delete()
        .eq("purchase_order_id", poId);

      if (deleteItemsError) {
        console.error(
          "[InventoryStore] updatePurchaseOrder delete items error:",
          deleteItemsError,
        );
        throw deleteItemsError;
      }

      const replacementItems = nextItems.map((item) => {
        const inventoryItem = get().inventoryItems.find(
          (entry) => entry.id === item.inventoryItemId,
        );

        return {
          purchase_order_id: poId,
          inventory_item_id: item.inventoryItemId,
          quantity_ordered: item.quantity,
          quantity_received: null,
          unit_cost: item.cost,
          item_name: inventoryItem?.name ?? null,
          item_category: inventoryItem?.category ?? null,
          item_unit_type:
            inventoryItem?.unitType ?? inventoryItem?.unit ?? null,
          item_sku: null,
        };
      });

      const { error: insertItemsError } = await supabase
        .from("purchase_order_items")
        .insert(replacementItems);

      if (insertItemsError) {
        console.error(
          "[InventoryStore] updatePurchaseOrder insert items error:",
          insertItemsError,
        );
        throw insertItemsError;
      }
    }

    await get().fetchPurchaseOrders();
  },

  deletePurchaseOrder: async (poId) => {
    const { supabase } = get();
    if (!supabase) return;

    const po = get().purchaseOrders.find((p) => p.id === poId);
    if (po?.status !== "Draft") {
      console.warn("Cannot delete a PO that is not in Draft status.");
      return;
    }

    const { error: deleteItemsError } = await supabase
      .from("purchase_order_items")
      .delete()
      .eq("purchase_order_id", poId);

    if (deleteItemsError) {
      console.error(
        "[InventoryStore] deletePurchaseOrder items error:",
        deleteItemsError,
      );
      throw deleteItemsError;
    }

    const { error } = await supabase
      .from("purchase_orders")
      .delete()
      .eq("id", poId);

    if (error) {
      console.error("[InventoryStore] deletePurchaseOrder error:", error);
      throw error;
    }

    await get().fetchPurchaseOrders();
  },

  submitPurchaseOrder: async (poId) => {
    const { supabase } = get();
    if (!supabase) return;

    const { error } = await supabase
      .from("purchase_orders")
      .update({
        status: purchaseOrderStatusToDb("Pending Delivery"),
        ordered_at: new Date().toISOString(),
      })
      .eq("id", poId)
      .eq("status", purchaseOrderStatusToDb("Draft"));

    if (error) {
      console.error("[InventoryStore] submitPurchaseOrder error:", error);
      throw error;
    }

    await get().fetchPurchaseOrders();
  },

  logDeliveryForPO: async (poId, data) => {
    const { supabase } = get();
    if (!supabase) return;

    const po = get().purchaseOrders.find((p) => p.id === poId);
    if (!po) return;

    const { locationId } = getCurrentStoreContext();
    const { userId, userName } = getActiveEmployeeContext();
    const received =
      data.receivedItems && data.receivedItems.length > 0
        ? data.receivedItems
        : po.items;

    const { error } = await supabase.rpc("log_purchase_order_delivery", {
      p_purchase_order_id: poId,
      p_delivered_by: userName,
      p_delivery_notes: data.notes || "",
      p_logged_by_name: userName,
      p_logged_by_user_id: userId,
      p_received_items: received.map((item) => ({
        inventory_item_id: item.inventoryItemId,
        quantity_received: item.quantity,
        unit_cost: item.cost,
      })),
    });

    if (error) {
      console.error("[InventoryStore] logDeliveryForPO error:", error);
      throw error;
    }

    if (data.deliveredAt) {
      const { error: deliveredAtError } = await supabase
        .from("purchase_orders")
        .update({
          delivered_at: data.deliveredAt,
          received_at: data.deliveredAt,
        })
        .eq("id", poId);

      if (deliveredAtError) {
        console.error(
          "[InventoryStore] logDeliveryForPO deliveredAt error:",
          deliveredAtError,
        );
        throw deliveredAtError;
      }
    }

    await Promise.all([
      get().fetchPurchaseOrders(locationId),
      get().fetchInventoryItems(locationId),
    ]);
  },

  logPaymentForPO: async (poId, data) => {
    const { supabase } = get();
    if (!supabase) return;

    const po = get().purchaseOrders.find((p) => p.id === poId);
    if (!po) return;

    const { locationId } = getCurrentStoreContext();
    const { userId, userName } = getActiveEmployeeContext();
    const paidAt = data.paidAt || new Date().toISOString();
    const cardLast4 = data.method === "Card" ? data.cardLast4 || null : null;
    const paymentMethod = toDbPurchaseOrderPaymentMethod(data.method);

    const { error: paymentInsertError } = await supabase
      .from("purchase_order_payments")
      .insert({
        purchase_order_id: poId,
        amount: data.amount,
        payment_method: paymentMethod,
        paid_to: data.paidToEmployee || null,
        paid_by_user_id: userId || null,
        paid_by_name: userName || null,
        notes: null,
        card_last_four: cardLast4,
        paid_at: paidAt,
        vendor_id: po.vendorId || null,
        vendor_name:
          get().vendors.find((vendor) => vendor.id === po.vendorId)?.name ??
          null,
      });

    if (paymentInsertError) {
      console.error(
        "[InventoryStore] logPaymentForPO payment insert error:",
        paymentInsertError,
      );
      throw paymentInsertError;
    }

    const { error: purchaseOrderUpdateError } = await supabase
      .from("purchase_orders")
      .update({
        status: purchaseOrderStatusToDb("Paid"),
        payment_method: paymentMethod,
        card_last_four: cardLast4,
        paid_at: paidAt,
      })
      .eq("id", poId);

    if (purchaseOrderUpdateError) {
      console.error(
        "[InventoryStore] logPaymentForPO purchase order update error:",
        purchaseOrderUpdateError,
      );
      throw purchaseOrderUpdateError;
    }

    await get().fetchPurchaseOrders(locationId);
  },
  cancelPurchaseOrder: async (poId) => {
    const { supabase } = get();
    if (!supabase) return;

    const { error } = await supabase
      .from("purchase_orders")
      .update({ status: purchaseOrderStatusToDb("Cancelled") })
      .eq("id", poId);

    if (error) {
      console.error("[InventoryStore] cancelPurchaseOrder error:", error);
      throw error;
    }

    await get().fetchPurchaseOrders();
  },

  addExternalExpense: async (expense) => {
    const { supabase } = get();
    if (!supabase) return;

    const { merchantId, locationId } = getCurrentStoreContext();
    const expenseNumber = await getNextExpenseNumber(
      supabase,
      merchantId,
      locationId,
    );
    const purchasedAt = expense.purchasedAt || new Date().toISOString();

    const { data: expenseRow, error: expenseError } = await supabase
      .from("purchase_orders")
      .insert({
        merchant_id: merchantId,
        location_id: locationId,
        created_by: expense.purchasedByEmployeeId || null,
        po_number: expenseNumber,
        status: purchaseOrderStatusToDb("Paid"),
        is_adhoc_expense: true,
        total_amount: expense.totalAmount,
        ordered_at: purchasedAt,
        paid_at: purchasedAt,
        payment_method: "cash",
        expense_category: "external_expense",
        expense_vendor_name: expense.storeName ?? null,
        expense_notes: buildExpenseNotes(expense),
      })
      .select("id")
      .single();

    if (expenseError) {
      console.error("[InventoryStore] addExternalExpense error:", expenseError);
      throw expenseError;
    }

    const expenseItems = expense.items.map((item) => ({
      purchase_order_id: expenseRow.id,
      inventory_item_id: item.inventoryItemId || null,
      item_name: item.itemName,
      item_category:
        get().inventoryItems.find((entry) => entry.id === item.inventoryItemId)
          ?.category ?? null,
      item_unit_type:
        get().inventoryItems.find((entry) => entry.id === item.inventoryItemId)
          ?.unitType ?? null,
      item_sku: null,
      quantity_ordered: item.quantity,
      quantity_received: item.quantity,
      unit_cost: item.unitPrice,
    }));

    const { error: itemsError } = await supabase
      .from("purchase_order_items")
      .insert(expenseItems);

    if (itemsError) {
      await supabase.from("purchase_orders").delete().eq("id", expenseRow.id);
      console.error(
        "[InventoryStore] addExternalExpense items error:",
        itemsError,
      );
      throw itemsError;
    }

    const { error } = await supabase
      .from("purchase_orders")
      .update({ received_at: purchasedAt })
      .eq("id", expenseRow.id);

    if (error) {
      console.error(
        "[InventoryStore] addExternalExpense finalize error:",
        error,
      );
      throw error;
    }

    await get().fetchPurchaseOrders(locationId);
  },

  updateExternalExpense: (expenseId, updates) => {
    set((state) => ({
      externalExpenses: state.externalExpenses.map((expense) =>
        expense.id === expenseId ? { ...expense, ...updates } : expense,
      ),
    }));
  },

  removeExternalExpense: async (expenseId) => {
    const { supabase } = get();
    if (!supabase) return;

    const { error } = await supabase
      .from("purchase_orders")
      .delete()
      .eq("id", expenseId)
      .eq("is_adhoc_expense", true);

    if (error) {
      console.error("[InventoryStore] removeExternalExpense error:", error);
      throw error;
    }

    await get().fetchPurchaseOrders();
  },

  // Real-time stock deduction logic ---
  decrementStockFromSale: (soldItems) => {
    const { menuItems, updateMenuItem } = useMenuStore.getState();
    const currentInventory = get().inventoryItems;

    const stockUpdates: Record<string, number> = {};
    const menuItemStockUpdates: Record<string, number> = {};

    soldItems.forEach((cartItem) => {
      const menuItem = menuItems.find((mi) => mi.id === cartItem.menuItemId);
      if (!menuItem) return;
      if (menuItem.recipe && menuItem.recipe.length > 0) {
        // Recipe-based depletion: deplete ingredients according to recipe
        menuItem.recipe.forEach((recipeItem) => {
          const currentDecrement =
            stockUpdates[recipeItem.inventoryItemId] || 0;
          stockUpdates[recipeItem.inventoryItemId] =
            currentDecrement + recipeItem.quantity * cartItem.quantity;
        });
        console.log("Found recipe", menuItem.recipe);
        console.log("Stock updates", stockUpdates);
        return;
      }

      if (
        menuItem.stockTrackingMode === "quantity" &&
        menuItem.stockQuantity !== undefined
      ) {
        // Simple item depletion: deplete the menu item's own stock
        const currentDecrement = menuItemStockUpdates[menuItem.id] || 0;
        menuItemStockUpdates[menuItem.id] =
          currentDecrement + cartItem.quantity;
        console.log("Found quantity tracking mode", menuItem.stockTrackingMode);
        console.log("Menu item stock updates", menuItemStockUpdates);
      }
      // If stockTrackingMode is "in_stock" or "out_of_stock", no quantity tracking needed
    });

    // Update inventory items (for recipe-based items)
    const updatedInventory = currentInventory.map((invItem) => {
      const totalToDecrement = stockUpdates[invItem.id];
      if (totalToDecrement) {
        return {
          ...invItem,
          stockQuantity: Math.max(0, invItem.stockQuantity - totalToDecrement),
        };
      }
      return invItem;
    });

    // Update menu items (for simple items with quantity tracking)
    Object.entries(menuItemStockUpdates).forEach(
      ([menuItemId, quantityToDecrement]) => {
        const menuItem = menuItems.find((mi) => mi.id === menuItemId);
        if (menuItem && menuItem.stockQuantity !== undefined) {
          const newStockQuantity = Math.max(
            0,
            menuItem.stockQuantity - quantityToDecrement,
          );
          updateMenuItem(menuItemId, { stockQuantity: newStockQuantity });
        }
      },
    );

    set({ inventoryItems: updatedInventory });
  },

  // Single item stock deduction logic ---
  decrementStockFromItem: (cartItem) => {
    const { menuItems, updateMenuItem } = useMenuStore.getState();
    const currentInventory = get().inventoryItems;

    const menuItem = menuItems.find((mi) => mi.id === cartItem.menuItemId);
    if (!menuItem) return;

    // Check if menu item has a recipe
    if (menuItem.recipe && menuItem.recipe.length > 0) {
      // Recipe-based depletion: deplete ingredients according to recipe
      const stockUpdates: Record<string, number> = {};

      menuItem.recipe.forEach((recipeItem) => {
        const currentDecrement = stockUpdates[recipeItem.inventoryItemId] || 0;
        stockUpdates[recipeItem.inventoryItemId] =
          currentDecrement + recipeItem.quantity * cartItem.quantity;
      });

      // Update inventory items
      const updatedInventory = currentInventory.map((invItem) => {
        const totalToDecrement = stockUpdates[invItem.id];
        if (totalToDecrement) {
          return {
            ...invItem,
            stockQuantity: Math.max(
              0,
              invItem.stockQuantity - totalToDecrement,
            ),
          };
        }
        return invItem;
      });

      set({ inventoryItems: updatedInventory });
    } else if (
      menuItem.stockTrackingMode === "quantity" &&
      menuItem.stockQuantity !== undefined
    ) {
      // Simple item depletion: deplete the menu item's own stock
      const newStockQuantity = Math.max(
        0,
        menuItem.stockQuantity - cartItem.quantity,
      );
      updateMenuItem(menuItem.id, { stockQuantity: newStockQuantity });
    }
    // If stockTrackingMode is "in_stock" or "out_of_stock", no quantity tracking needed
  },

  // --- Selector for low stock items ---
  getLowStockItems: () => {
    return get().inventoryItems.filter(
      (item) => item.stockQuantity <= item.reorderThreshold,
    );
  },
}));
