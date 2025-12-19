// ============================================================================
// DEXA POS - Merged Optimized Order Store
// Combines your existing useOrderStore API with local-first calculations
// ============================================================================

import { create } from "zustand";
import { subscribeWithSelector, persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { toastService } from "@/lib/toastService";
import { useEmployeeStore } from "./useEmployeeStore";
import { useInventoryStore } from "./useInventoryStore";
import { usePreviousOrdersStore } from "./usePreviousOrdersStore";
import { useStoreSettingsStore } from "./useStoreSettingsStore";
import { OrderService } from "@/services/orderService";
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  AddOrderItemParams,
  CreateOrderParams,
  OrderType as DbOrderType,
} from "@/types/db-order-management-types";

// ============================================================================
// SUPABASE CLIENT MANAGEMENT
// ============================================================================

let _supabaseClient: SupabaseClient | null = null;

export const setOrderStoreSupabaseClient = (client: SupabaseClient | null) => {
  _supabaseClient = client;
};

export const getOrderStoreSupabaseClient = () => _supabaseClient;

// ============================================================================
// TYPES (Keep your existing types, add optimizations)
// ============================================================================

export type PaymentType = "Cash" | "Card";
export type OrderType = "Dine In" | "Takeaway" | "Delivery" | "Pickup";
export type OrderStatus = "draft" | "preparing" | "ready" | "completed" | "void";
export type KitchenStatus = "new" | "sent" | "ready" | "served";
export type CourseStatus = "open" | "fired" | "served";

export interface Discount {
  type: "percent" | "amount";
  value: number;
  reason?: string;
}

export interface ModifierOption {
  id: string;
  name: string;
  price: number;
}

export interface ModifierGroup {
  categoryId: string;
  categoryName: string;
  options: ModifierOption[];
}

export interface CartItemCustomizations {
  size?: { id: string; name: string; priceModifier: number };
  notes?: string;
  addOns?: Array<{ id: string; name: string; price: number }>;
  modifiers?: ModifierGroup[];
}

export interface CartItem {
  id: string;
  db_order_item_id?: string;  // Server ID after sync
  
  // Item identification
  menuItemId: string;
  locationExclusiveItemId?: string;
  name: string;
  category_name?: string;
  
  // Pricing
  originalPrice: number;       // Base price from menu
  price: number;               // Effective price (with modifiers)
  
  // Customizations
  customizations: CartItemCustomizations;
  
  // Quantity
  quantity: number;
  paidQuantity: number;
  
  // Coursing
  course_number: number;       // Which course this item belongs to
  
  // Status
  isDraft?: boolean;
  item_status?: "preparing" | "ready" | "served";
  kitchen_status?: KitchenStatus;
  
  // Discounts
  availableDiscount?: Discount;
  appliedDiscount?: Discount;
  
  // Sync status
  synced: boolean;
  syncing: boolean;
}

export interface Payment {
  amount: number;
  method: PaymentType;
  cardBrand?: string;
  last4?: string;
  tipAmount?: number;
  transactionDetails?: Record<string, unknown>;
}

export interface CourseInfo {
  course_number: number;
  status: CourseStatus;
  fired_at?: number;
  served_at?: number;
}

export interface OrderProfile {
  id: string;
  db_order_id?: string;
  order_number?: string;
  display_number?: string;
  
  // Order details
  service_location_id: string | null;  // Table ID
  order_type: OrderType;
  order_status: OrderStatus;
  check_status: "Opened" | "Closed";
  paid_status: "Unpaid" | "Pending" | "Paid";
  
  customer_name?: string;
  guest_count: number;
  server_name?: string;
  
  // Items
  items: CartItem[];
  
  // Coursing (embedded for O(1) access)
  courses: Record<number, CourseInfo>;
  working_course: number;
  
  // Payments
  payments: Payment[];
  
  // Discounts
  checkDiscount?: Discount | null;
  
  // === CALCULATED TOTALS (Stored, updated synchronously) ===
  subtotal: number;
  discount_amount: number;
  tax_amount: number;
  total_amount: number;
  amount_paid: number;
  amount_due: number;
  
  // Outstanding (unpaid) amounts
  outstanding_subtotal: number;
  outstanding_tax: number;
  outstanding_total: number;
  
  // Sync
  sync_status: "pending" | "syncing" | "synced" | "error";
  
  // Timestamps
  opened_at: string | null;
  closed_at?: string | null;
}

// ============================================================================
// PURE CALCULATION FUNCTIONS (No async, no side effects)
// ============================================================================

function round2(num: number): number {
  return Math.round(num * 100) / 100;
}

/**
 * Calculate effective item price including all modifiers
 */
function calculateItemPrice(item: CartItem): number {
  let price = item.originalPrice;
  
  // Size modifier
  if (item.customizations.size?.priceModifier) {
    price += item.customizations.size.priceModifier;
  }
  
  // Add-ons
  if (item.customizations.addOns) {
    price += item.customizations.addOns.reduce((sum, addon) => sum + addon.price, 0);
  }
  
  // Modifiers
  if (item.customizations.modifiers) {
    price += item.customizations.modifiers.reduce((sum, group) => 
      sum + group.options.reduce((optSum, opt) => optSum + opt.price, 0), 0
    );
  }
  
  return round2(price);
}

/**
 * Calculate all order totals - PURE FUNCTION, SYNCHRONOUS
 */
function calculateOrderTotals(
  items: CartItem[],
  checkDiscount: Discount | null | undefined,
  payments: Payment[],
  taxRatePercent: number
): {
  subtotal: number;
  discount_amount: number;
  tax_amount: number;
  total_amount: number;
  amount_paid: number;
  amount_due: number;
  outstanding_subtotal: number;
  outstanding_tax: number;
  outstanding_total: number;
} {
  const taxRate = taxRatePercent / 100;
  
  // Subtotal (all items with their effective prices)
  const subtotal = items.reduce(
    (acc, item) => acc + item.price * item.quantity,
    0
  );
  
  // Item-level discounts
  const itemDiscountsTotal = items.reduce((acc, item) => {
    if (item.appliedDiscount) {
      return acc + item.originalPrice * item.appliedDiscount.value * item.quantity;
    }
    return acc;
  }, 0);
  
  const subtotalAfterItemDiscounts = subtotal - itemDiscountsTotal;
  
  // Check-level discount
  let checkDiscountAmount = 0;
  if (checkDiscount) {
    if (checkDiscount.type === "percent") {
      checkDiscountAmount = subtotalAfterItemDiscounts * checkDiscount.value;
    } else {
      checkDiscountAmount = checkDiscount.value;
    }
  }
  
  const discount_amount = round2(itemDiscountsTotal + checkDiscountAmount);
  const taxableAmount = Math.max(0, subtotal - discount_amount);
  const tax_amount = round2(taxableAmount * taxRate);
  const total_amount = round2(taxableAmount + tax_amount);
  
  // Amount paid
  const amount_paid = round2(payments.reduce((sum, p) => sum + p.amount, 0));
  const amount_due = round2(Math.max(0, total_amount - amount_paid));
  
  // Outstanding (unpaid items only)
  const outstanding_subtotal = items.reduce((acc, item) => {
    const unpaidQty = item.quantity - (item.paidQuantity || 0);
    return acc + unpaidQty * item.price;
  }, 0);
  
  const proportionOutstanding = subtotal > 0 ? outstanding_subtotal / subtotal : 0;
  const outstandingDiscount = discount_amount * proportionOutstanding;
  const outstandingSubtotalAfterDiscount = outstanding_subtotal - outstandingDiscount;
  const outstanding_tax = round2(outstandingSubtotalAfterDiscount * taxRate);
  const outstanding_total = round2(outstandingSubtotalAfterDiscount + outstanding_tax);
  
  return {
    subtotal: round2(subtotal),
    discount_amount,
    tax_amount,
    total_amount,
    amount_paid,
    amount_due,
    outstanding_subtotal: round2(outstanding_subtotal),
    outstanding_tax,
    outstanding_total,
  };
}

// ============================================================================
// COMPOSITE KEY GENERATION (For item merging)
// ============================================================================

function generateItemCompositeKey(
  menuItemId: string,
  customizations: CartItemCustomizations
): string {
  const keyParts: string[] = [menuItemId];
  
  if (customizations.size?.id) {
    keyParts.push(`size:${customizations.size.id}`);
  }
  
  if (customizations.notes) {
    keyParts.push(`notes:${customizations.notes.trim()}`);
  }
  
  if (customizations.addOns?.length) {
    const addOnIds = customizations.addOns.map(a => a.id).sort();
    keyParts.push(`addons:${addOnIds.join(",")}`);
  }
  
  if (customizations.modifiers?.length) {
    const modifierKeys = customizations.modifiers
      .map(mod => `${mod.categoryId}:${mod.options.map(opt => opt.id).sort().join(",")}`)
      .sort();
    keyParts.push(`modifiers:${modifierKeys.join("|")}`);
  }
  
  return keyParts.join("|");
}

// ============================================================================
// STORE STATE
// ============================================================================

interface OrderState {
  // === OPTIMIZED DATA STRUCTURE ===
  // O(1) lookup instead of O(n) array search
  ordersById: Record<string, OrderProfile>;
  orderIds: string[];  // Maintains order for iteration
  activeOrderId: string | null;
  
  // === CACHED ACTIVE ORDER TOTALS ===
  // Pre-calculated, updated synchronously with every change
  // Components can subscribe to just these without re-rendering on other changes
  activeOrderSubtotal: number;
  activeOrderTax: number;
  activeOrderTotal: number;
  activeOrderDiscount: number;
  activeOrderOutstandingSubtotal: number;
  activeOrderOutstandingTax: number;
  activeOrderOutstandingTotal: number;
  
  // === PENDING TABLE SELECTION ===
  pendingTableSelection: string | null;
  
  // === ACTIONS (Same API as before) ===
  setActiveOrder: (orderId: string | null) => void;
  getActiveOrder: () => OrderProfile | null;
  getOrder: (orderId: string) => OrderProfile | null;
  
  startNewOrder: (details?: { tableId?: string; guestCount?: number }) => OrderProfile;
  addItemToActiveOrder: (newItem: CartItem) => void;
  updateItemInActiveOrder: (updatedItem: CartItem) => void;
  removeItemFromActiveOrder: (itemId: string) => void;
  confirmDraftItem: (itemId: string) => void;
  updateItemStatusInActiveOrder: (itemId: string, status: "preparing" | "ready" | "served") => void;
  
  updateActiveOrderDetails: (details: Partial<OrderProfile>) => void;
  applyDiscountToCheck: (orderId: string, discount: Discount) => void;
  removeCheckDiscount: (orderId: string) => void;
  applyDiscountToItem: (orderId: string, itemId: string) => void;
  removeDiscountFromItem: (orderId: string, itemId: string) => void;
  
  assignOrderToTable: (orderId: string, tableId: string) => void;
  assignActiveOrderToTable: (tableId: string) => void;
  updateOrderStatus: (orderId: string, status: OrderStatus) => void;
  addPaymentToOrder: (details: {
    orderId: string;
    amount: number;
    method: PaymentType;
    cardBrand?: string;
    last4?: string;
    tipAmount?: number;
    transactionDetails?: Record<string, unknown>;
  }) => void;
  
  markOrderAsPaid: (orderId: string) => void;
  setPendingTableSelection: (tableId: string | null) => void;
  archiveOrder: (orderId: string) => string | null;
  
  markAllItemsAsReady: (orderId: string) => void;
  markAllItemsAsServed: (orderId: string) => void;
  
  fireActiveOrderToKitchen: () => void;
  sendNewItemsToKitchen: () => void;
  sendNewItemsToKitchenForOrder: (orderId: string) => void;
  
  transferOrderToTable: (orderId: string, newTableId: string) => void;
  consolidateOrdersForTables: (tableIds: string[], tableNames: string[]) => string;
  
  deleteOrder: (orderId: string) => void;
  clearCart: () => void;
  voidOrder: (orderId: string) => void;
  
  setOrders: (orders: OrderProfile[]) => void;
  setOpenedAt: (orderId: string, openedAt: string) => void;
  setClosedAt: (orderId: string, closedAt: string) => void;
  
  generateCartItemId: (menuItemId: string, customizations: CartItemCustomizations, isDraft?: boolean) => string;
  
  // === COURSING ACTIONS ===
  setWorkingCourse: (orderId: string, courseNumber: number) => void;
  createNextCourse: (orderId: string) => number;
  fireCourse: (orderId: string, courseNumber: number) => Promise<void>;
  markCourseServed: (orderId: string, courseNumber: number) => void;
  setItemCourse: (orderId: string, itemId: string, targetCourse: number) => void;
  
  // === COURSING GETTERS ===
  getItemsByCourse: (orderId: string, courseNumber: number) => CartItem[];
  isCourseOpen: (orderId: string, courseNumber: number) => boolean;
  canModifyItem: (orderId: string, itemId: string) => boolean;
  getOpenCourses: (orderId: string) => number[];
  getFiredCourses: (orderId: string) => number[];
  
  // === INTERNAL HELPERS ===
  _recalculateOrder: (orderId: string) => void;
  _updateActiveOrderTotals: () => void;
  _syncItemToBackend: (order: OrderProfile, item: CartItem) => Promise<void>;
}

// ============================================================================
// STORE IMPLEMENTATION
// ============================================================================

export const useOrderStore = create<OrderState>()(
  subscribeWithSelector(
    persist(
      (set, get) => {
        // ====================================================================
        // INTERNAL: Recalculate order totals (SYNCHRONOUS)
        // ====================================================================
        const _recalculateOrder = (orderId: string) => {
          const order = get().ordersById[orderId];
          if (!order) return;
          
          const taxRate = useStoreSettingsStore.getState().defaultTaxRate || 8.25;
          
          const totals = calculateOrderTotals(
            order.items,
            order.checkDiscount,
            order.payments,
            taxRate
          );
          
          // Single atomic update
          set(state => ({
            ordersById: {
              ...state.ordersById,
              [orderId]: {
                ...state.ordersById[orderId],
                ...totals,
              }
            }
          }));
          
          // Update cached active order totals if this is active
          if (orderId === get().activeOrderId) {
            get()._updateActiveOrderTotals();
          }
        };
        
        // ====================================================================
        // INTERNAL: Update cached active order totals
        // ====================================================================
        const _updateActiveOrderTotals = () => {
          const { activeOrderId, ordersById } = get();
          
          if (!activeOrderId || !ordersById[activeOrderId]) {
            set({
              activeOrderSubtotal: 0,
              activeOrderTax: 0,
              activeOrderTotal: 0,
              activeOrderDiscount: 0,
              activeOrderOutstandingSubtotal: 0,
              activeOrderOutstandingTax: 0,
              activeOrderOutstandingTotal: 0,
            });
            return;
          }
          
          const order = ordersById[activeOrderId];
          set({
            activeOrderSubtotal: order.subtotal,
            activeOrderTax: order.tax_amount,
            activeOrderTotal: order.total_amount,
            activeOrderDiscount: order.discount_amount,
            activeOrderOutstandingSubtotal: order.outstanding_subtotal,
            activeOrderOutstandingTax: order.outstanding_tax,
            activeOrderOutstandingTotal: order.outstanding_total,
          });
        };
        
        // ====================================================================
        // INTERNAL: Sync item to backend (BACKGROUND, non-blocking)
        // ====================================================================
        const _syncItemToBackend = async (order: OrderProfile, item: CartItem) => {
          const supabase = _supabaseClient;
          if (!supabase || item.isDraft) return;
          
          const selectedStore = useStoreSettingsStore.getState().selectedStore;
          if (!selectedStore) return;
          
          try {
            let dbOrderId = order.db_order_id;
            
            // Create order if doesn't exist
            if (!dbOrderId) {
              const createParams: CreateOrderParams = {
                p_merchant_id: selectedStore.merchant_id,
                p_location_id: selectedStore.id,
                p_order_type: order.order_type === "Takeaway" ? "takeout" 
                  : order.order_type === "Dine In" ? "dine_in"
                  : (order.order_type.toLowerCase() as DbOrderType),
                p_table_number: order.service_location_id || undefined,
              };
              
              const { data, error } = await OrderService.createOrder(supabase, createParams);
              
              if (error) {
                console.error("Failed to create order:", error);
                return;
              }
              
              const orderData = Array.isArray(data) ? data[0] : data;
              dbOrderId = orderData?.order_id || orderData?.id;
              
              // Update order with server ID
              set(state => ({
                ordersById: {
                  ...state.ordersById,
                  [order.id]: {
                    ...state.ordersById[order.id],
                    db_order_id: dbOrderId,
                    order_number: orderData?.order_number,
                    display_number: orderData?.display_number,
                    sync_status: "synced",
                  }
                }
              }));
            }
            
            if (!dbOrderId) return;
            
            // Add item to backend
            const addParams: AddOrderItemParams = {
              p_order_id: dbOrderId,
              p_menu_item_id: item.menuItemId || undefined,
              p_quantity: item.quantity,
              p_item_name: item.name,
              p_category_name: item.category_name || "Uncategorized",
              p_unit_price: item.originalPrice,
              p_cash_price: item.originalPrice,
              p_use_cash_price: true,
              p_selected_size_id: item.customizations.size?.id,
              p_selected_size_name: item.customizations.size?.name,
              p_size_price_modifier: item.customizations.size?.priceModifier,
              p_special_instructions: item.customizations.notes,
              p_modifiers: item.customizations.modifiers?.flatMap(mod =>
                mod.options.map(opt => ({
                  modifier_group_id: mod.categoryId,
                  modifier_item_id: opt.id,
                  modifier_group_name: mod.categoryName,
                  modifier_name: opt.name,
                  price_modifier: opt.price,
                  quantity: 1,
                }))
              ),
              p_location_exclusive_item_id: item.locationExclusiveItemId,
              p_course_number: 1,
            };
            
            const { data: addResult, error: addError } = await OrderService.addOrderItem(
              supabase, 
              addParams
            );
            
            if (addError) {
              console.error("Failed to add item:", addError);
              return;
            }
            
            // Update item with server ID
            if (addResult?.order_item_id) {
              set(state => ({
                ordersById: {
                  ...state.ordersById,
                  [order.id]: {
                    ...state.ordersById[order.id],
                    items: state.ordersById[order.id].items.map(i =>
                      i.id === item.id
                        ? { ...i, db_order_item_id: addResult.order_item_id, synced: true, syncing: false }
                        : i
                    ),
                  }
                }
              }));
            }
          } catch (error) {
            console.error("Backend sync error:", error);
          }
        };
        
        // ====================================================================
        // RETURN STORE
        // ====================================================================
        return {
          // === INITIAL STATE ===
          ordersById: {},
          orderIds: [],
          activeOrderId: null,
          activeOrderSubtotal: 0,
          activeOrderTax: 0,
          activeOrderTotal: 0,
          activeOrderDiscount: 0,
          activeOrderOutstandingSubtotal: 0,
          activeOrderOutstandingTax: 0,
          activeOrderOutstandingTotal: 0,
          pendingTableSelection: null,
          
          // === INTERNAL ===
          _recalculateOrder,
          _updateActiveOrderTotals,
          _syncItemToBackend,
          
          // === GETTERS (O(1)) ===
          getActiveOrder: () => {
            const { activeOrderId, ordersById } = get();
            return activeOrderId ? ordersById[activeOrderId] || null : null;
          },
          
          getOrder: (orderId) => {
            return get().ordersById[orderId] || null;
          },
          
          // === ORDER MANAGEMENT ===
          setActiveOrder: (orderId) => {
            set({ activeOrderId: orderId });
            _updateActiveOrderTotals();
          },
          
          startNewOrder: (details) => {
            const { activeEmployeeId, employees } = useEmployeeStore.getState();
            const activeEmployee = employees.find(e => e.id === activeEmployeeId);
            
            const id = `order_${Date.now()}`;
            const newOrder: OrderProfile = {
              id,
              service_location_id: details?.tableId || null,
              order_type: details?.tableId ? "Dine In" : "Takeaway",
              order_status: "draft",
              check_status: "Opened",
              paid_status: "Unpaid",
              customer_name: "",
              guest_count: details?.guestCount || 1,
              server_name: activeEmployee?.fullName || "Unknown",
              items: [],
              courses: { 1: { course_number: 1, status: "open" } },
              working_course: 1,
              payments: [],
              // Totals start at 0
              subtotal: 0,
              discount_amount: 0,
              tax_amount: 0,
              total_amount: 0,
              amount_paid: 0,
              amount_due: 0,
              outstanding_subtotal: 0,
              outstanding_tax: 0,
              outstanding_total: 0,
              sync_status: "pending",
              opened_at: null,
            };
            
            set(state => ({
              ordersById: { ...state.ordersById, [id]: newOrder },
              orderIds: [...state.orderIds, id],
            }));
            
            return newOrder;
          },
          
          // === ITEM MANAGEMENT ===
          addItemToActiveOrder: (newItem) => {
            const { activeOrderId, ordersById } = get();
            if (!activeOrderId) return;
            
            const order = ordersById[activeOrderId];
            if (!order) return;
            
            // Get working course from embedded coursing
            const workingCourse = order.working_course;
            
            // Validate: working course must be open
            const courseInfo = order.courses[workingCourse];
            if (courseInfo && courseInfo.status !== 'open') {
              toastService.show({
                title: 'Cannot Add Item',
                message: `Course ${workingCourse} has been fired. Switch to an open course first.`,
                type: 'warning'
              });
              return;
            }
            
            // Calculate effective price
            const effectivePrice = calculateItemPrice(newItem);
            const itemWithPrice = { 
              ...newItem, 
              price: effectivePrice,
              course_number: workingCourse,  // Assign to working course
            };
            
            // Check for merge candidate (same item, same course, still 'new')
            const newItemKey = generateItemCompositeKey(newItem.menuItemId, newItem.customizations);
            let updatedItems = order.items.filter(item => 
              !(item.isDraft && item.menuItemId === newItem.menuItemId)
            );
            
            const mergeCandidate = updatedItems.find(item => {
              if (item.isDraft || (item.kitchen_status && item.kitchen_status !== "new")) {
                return false;
              }
              // Must be in same course
              if (item.course_number !== workingCourse) return false;
              
              return generateItemCompositeKey(item.menuItemId, item.customizations) === newItemKey;
            });
            
            if (mergeCandidate) {
              // Merge quantities
              updatedItems = updatedItems.map(item =>
                item.id === mergeCandidate.id
                  ? { ...item, quantity: item.quantity + newItem.quantity }
                  : item
              );
            } else {
              // Add new item
              const finalItem: CartItem = {
                ...itemWithPrice,
                paidQuantity: 0,
                course_number: workingCourse,
                item_status: order.order_type === "Dine In" ? "preparing" : undefined,
                kitchen_status: newItem.isDraft ? undefined : "new",
                synced: false,
                syncing: false,
              };
              updatedItems = [...updatedItems, finalItem];
            }
            
            // Calculate new totals SYNCHRONOUSLY
            const taxRate = useStoreSettingsStore.getState().defaultTaxRate || 8.25;
            const totals = calculateOrderTotals(
              updatedItems,
              order.checkDiscount,
              order.payments,
              taxRate
            );
            
            // SINGLE atomic update with items AND totals
            set(state => ({
              ordersById: {
                ...state.ordersById,
                [activeOrderId]: {
                  ...state.ordersById[activeOrderId],
                  items: updatedItems,
                  ...totals,
                }
              },
              // Also update cached active order totals in same update
              activeOrderSubtotal: totals.subtotal,
              activeOrderTax: totals.tax_amount,
              activeOrderTotal: totals.total_amount,
              activeOrderDiscount: totals.discount_amount,
              activeOrderOutstandingSubtotal: totals.outstanding_subtotal,
              activeOrderOutstandingTax: totals.outstanding_tax,
              activeOrderOutstandingTotal: totals.outstanding_total,
            }));
            
            // Background sync (fire and forget)
            if (!newItem.isDraft) {
              const itemToSync = mergeCandidate || itemWithPrice;
              const updatedOrder = get().ordersById[activeOrderId];
              _syncItemToBackend(updatedOrder, itemToSync).catch(console.error);
            }
          },
          
          updateItemInActiveOrder: (updatedItem) => {
            const { activeOrderId, ordersById } = get();
            if (!activeOrderId) return;
            
            const order = ordersById[activeOrderId];
            if (!order) return;
            
            // Recalculate price if customizations changed
            const effectivePrice = calculateItemPrice(updatedItem);
            const itemWithPrice = { ...updatedItem, price: effectivePrice };
            
            const updatedItems = order.items.map(i =>
              i.id === updatedItem.id ? itemWithPrice : i
            );
            
            // Calculate totals
            const taxRate = useStoreSettingsStore.getState().defaultTaxRate || 8.25;
            const totals = calculateOrderTotals(
              updatedItems,
              order.checkDiscount,
              order.payments,
              taxRate
            );
            
            // Single update
            set(state => ({
              ordersById: {
                ...state.ordersById,
                [activeOrderId]: {
                  ...state.ordersById[activeOrderId],
                  items: updatedItems,
                  ...totals,
                }
              },
              activeOrderSubtotal: totals.subtotal,
              activeOrderTax: totals.tax_amount,
              activeOrderTotal: totals.total_amount,
              activeOrderDiscount: totals.discount_amount,
              activeOrderOutstandingSubtotal: totals.outstanding_subtotal,
              activeOrderOutstandingTax: totals.outstanding_tax,
              activeOrderOutstandingTotal: totals.outstanding_total,
            }));
            
            // Background sync for quantity/instruction changes
            const supabase = _supabaseClient;
            const originalItem = order.items.find(i => i.id === updatedItem.id);
            if (supabase && originalItem?.db_order_item_id) {
              if (updatedItem.quantity !== originalItem.quantity) {
                OrderService.updateOrderItemQuantity(
                  supabase,
                  originalItem.db_order_item_id,
                  updatedItem.quantity
                ).catch(console.error);
              }
            }
          },
          
          removeItemFromActiveOrder: (itemId) => {
            const { activeOrderId, ordersById } = get();
            if (!activeOrderId) return;
            
            const order = ordersById[activeOrderId];
            if (!order) return;
            
            const itemToRemove = order.items.find(i => i.id === itemId);
            if (!itemToRemove) return;
            
            // Check if item's course is open (determines remove vs void)
            const courseInfo = order.courses[itemToRemove.course_number];
            const isCourseOpen = !courseInfo || courseInfo.status === 'open';
            
            const updatedItems = order.items.filter(i => i.id !== itemId);
            
            // Calculate totals
            const taxRate = useStoreSettingsStore.getState().defaultTaxRate || 8.25;
            const totals = calculateOrderTotals(
              updatedItems,
              order.checkDiscount,
              order.payments,
              taxRate
            );
            
            // Single update (instant UI)
            set(state => ({
              ordersById: {
                ...state.ordersById,
                [activeOrderId]: {
                  ...state.ordersById[activeOrderId],
                  items: updatedItems,
                  ...totals,
                }
              },
              activeOrderSubtotal: totals.subtotal,
              activeOrderTax: totals.tax_amount,
              activeOrderTotal: totals.total_amount,
              activeOrderDiscount: totals.discount_amount,
              activeOrderOutstandingSubtotal: totals.outstanding_subtotal,
              activeOrderOutstandingTax: totals.outstanding_tax,
              activeOrderOutstandingTotal: totals.outstanding_total,
            }));
            
            // Background sync - remove or void based on course status
            const supabase = _supabaseClient;
            if (supabase && itemToRemove.db_order_item_id) {
              if (isCourseOpen) {
                // Course open → Try hard delete
                supabase.rpc('remove_order_item', {
                  p_order_item_id: itemToRemove.db_order_item_id
                }).then(({ error }) => {
                  if (error) {
                    // If remove fails (order not draft), fallback to void
                    if (error.message?.includes('Cannot remove')) {
                      supabase.rpc('void_order_item', {
                        p_order_item_id: itemToRemove.db_order_item_id,
                        p_void_reason: "Removed by cashier"
                      }).catch(console.error);
                    } else {
                      console.error('Failed to remove item:', error);
                    }
                  }
                });
              } else {
                // Course fired → Must void (audit trail)
                supabase.rpc('void_order_item', {
                  p_order_item_id: itemToRemove.db_order_item_id,
                  p_void_reason: "Removed from fired course"
                }).catch(console.error);
              }
            }
          },
          
          confirmDraftItem: (itemId) => {
            const { activeOrderId, ordersById } = get();
            if (!activeOrderId) return;
            
            set(state => ({
              ordersById: {
                ...state.ordersById,
                [activeOrderId]: {
                  ...state.ordersById[activeOrderId],
                  items: state.ordersById[activeOrderId].items.map(i =>
                    i.id === itemId ? { ...i, isDraft: false, kitchen_status: "new" as const } : i
                  ),
                }
              }
            }));
            
            // Now sync to backend
            const order = get().ordersById[activeOrderId];
            const item = order?.items.find(i => i.id === itemId);
            if (order && item) {
              _syncItemToBackend(order, item).catch(console.error);
            }
          },
          
          updateItemStatusInActiveOrder: (itemId, status) => {
            const { activeOrderId, ordersById } = get();
            if (!activeOrderId) return;
            
            const order = ordersById[activeOrderId];
            const item = order?.items.find(i => i.id === itemId);
            
            // Trigger inventory if becoming ready/served
            if ((status === "ready" || status === "served") && item) {
              useInventoryStore.getState().decrementStockFromItem(item);
            }
            
            let kitchenStatus: KitchenStatus | undefined;
            if (status === "preparing") kitchenStatus = "sent";
            else if (status === "ready") kitchenStatus = "ready";
            else if (status === "served") kitchenStatus = "served";
            
            set(state => ({
              ordersById: {
                ...state.ordersById,
                [activeOrderId]: {
                  ...state.ordersById[activeOrderId],
                  items: state.ordersById[activeOrderId].items.map(i =>
                    i.id === itemId
                      ? { ...i, item_status: status, kitchen_status: kitchenStatus }
                      : i
                  ),
                }
              }
            }));
          },
          
          // === DISCOUNTS ===
          applyDiscountToCheck: (orderId, discount) => {
            const order = get().ordersById[orderId];
            if (!order) return;
            
            const taxRate = useStoreSettingsStore.getState().defaultTaxRate || 8.25;
            const totals = calculateOrderTotals(order.items, discount, order.payments, taxRate);
            
            set(state => ({
              ordersById: {
                ...state.ordersById,
                [orderId]: {
                  ...state.ordersById[orderId],
                  checkDiscount: discount,
                  ...totals,
                }
              }
            }));
            
            if (orderId === get().activeOrderId) {
              _updateActiveOrderTotals();
            }
          },
          
          removeCheckDiscount: (orderId) => {
            const order = get().ordersById[orderId];
            if (!order) return;
            
            const taxRate = useStoreSettingsStore.getState().defaultTaxRate || 8.25;
            const totals = calculateOrderTotals(order.items, null, order.payments, taxRate);
            
            set(state => ({
              ordersById: {
                ...state.ordersById,
                [orderId]: {
                  ...state.ordersById[orderId],
                  checkDiscount: null,
                  ...totals,
                }
              }
            }));
            
            if (orderId === get().activeOrderId) {
              _updateActiveOrderTotals();
            }
          },
          
          applyDiscountToItem: (orderId, itemId) => {
            const order = get().ordersById[orderId];
            if (!order) return;
            
            const updatedItems = order.items.map(item => {
              if (item.id === itemId && item.availableDiscount) {
                return { ...item, appliedDiscount: item.availableDiscount };
              }
              return item;
            });
            
            const taxRate = useStoreSettingsStore.getState().defaultTaxRate || 8.25;
            const totals = calculateOrderTotals(updatedItems, order.checkDiscount, order.payments, taxRate);
            
            set(state => ({
              ordersById: {
                ...state.ordersById,
                [orderId]: {
                  ...state.ordersById[orderId],
                  items: updatedItems,
                  ...totals,
                }
              }
            }));
            
            if (orderId === get().activeOrderId) {
              _updateActiveOrderTotals();
            }
          },
          
          removeDiscountFromItem: (orderId, itemId) => {
            const order = get().ordersById[orderId];
            if (!order) return;
            
            const updatedItems = order.items.map(item =>
              item.id === itemId ? { ...item, appliedDiscount: undefined } : item
            );
            
            const taxRate = useStoreSettingsStore.getState().defaultTaxRate || 8.25;
            const totals = calculateOrderTotals(updatedItems, order.checkDiscount, order.payments, taxRate);
            
            set(state => ({
              ordersById: {
                ...state.ordersById,
                [orderId]: {
                  ...state.ordersById[orderId],
                  items: updatedItems,
                  ...totals,
                }
              }
            }));
            
            if (orderId === get().activeOrderId) {
              _updateActiveOrderTotals();
            }
          },
          
          // === ORDER DETAILS ===
          updateActiveOrderDetails: (details) => {
            const { activeOrderId } = get();
            if (!activeOrderId) return;
            
            set(state => ({
              ordersById: {
                ...state.ordersById,
                [activeOrderId]: {
                  ...state.ordersById[activeOrderId],
                  ...details,
                }
              }
            }));
          },
          
          assignOrderToTable: (orderId, tableId) => {
            set(state => ({
              ordersById: {
                ...state.ordersById,
                [orderId]: {
                  ...state.ordersById[orderId],
                  service_location_id: tableId,
                }
              }
            }));
          },
          
          assignActiveOrderToTable: (tableId) => {
            const { activeOrderId, ordersById, startNewOrder } = get();
            if (!activeOrderId) return;
            
            const order = ordersById[activeOrderId];
            if (!order || order.items.length === 0) {
              toastService.show({
                title: "Empty Cart",
                message: "Cannot assign an empty order to a table.",
                type: "error",
              });
              return;
            }
            
            // Update order
            set(state => ({
              ordersById: {
                ...state.ordersById,
                [activeOrderId]: {
                  ...state.ordersById[activeOrderId],
                  service_location_id: tableId,
                  order_type: "Dine In",
                  order_status: "preparing",
                }
              }
            }));
            
            // Create new order for next customer
            const newOrder = startNewOrder();
            set({ activeOrderId: newOrder.id });
            _updateActiveOrderTotals();
            
            // Sync status to backend
            const supabase = _supabaseClient;
            if (supabase && order.db_order_id) {
              OrderService.updateOrderStatus(supabase, order.db_order_id, "preparing")
                .catch(console.error);
            }
          },
          
          updateOrderStatus: (orderId, status) => {
            const order = get().ordersById[orderId];
            
            set(state => ({
              ordersById: {
                ...state.ordersById,
                [orderId]: {
                  ...state.ordersById[orderId],
                  order_status: status,
                  check_status: (status === "completed" || status === "void") ? "Closed" : state.ordersById[orderId].check_status,
                }
              }
            }));
            
            // Sync to backend
            const supabase = _supabaseClient;
            if (supabase && order?.db_order_id) {
              OrderService.updateOrderStatus(supabase, order.db_order_id, status)
                .catch(console.error);
            }
          },
          
          // === PAYMENTS ===
          addPaymentToOrder: ({ orderId, amount, method, cardBrand, last4, tipAmount, transactionDetails }) => {
            const order = get().ordersById[orderId];
            if (!order) return;
            
            const newPayment: Payment = {
              amount,
              method,
              ...(cardBrand && { cardBrand }),
              ...(last4 && { last4 }),
              ...(tipAmount && { tipAmount }),
              ...(transactionDetails && { transactionDetails }),
            };
            
            const newPayments = [...order.payments, newPayment];
            
            // Mark items as paid FIFO
            let remaining = amount;
            const updatedItems = order.items.map(item => {
              const unitPrice = item.price;
              const unpaidQty = item.quantity - (item.paidQuantity || 0);
              if (remaining <= 0 || unpaidQty <= 0) return item;
              
              const canCover = Math.min(unpaidQty, Math.floor(remaining / unitPrice + 1e-6));
              if (canCover <= 0) return item;
              
              remaining -= canCover * unitPrice;
              return { ...item, paidQuantity: (item.paidQuantity || 0) + canCover };
            });
            
            // Recalculate totals
            const taxRate = useStoreSettingsStore.getState().defaultTaxRate || 8.25;
            const totals = calculateOrderTotals(updatedItems, order.checkDiscount, newPayments, taxRate);
            
            // Update paid status
            let paidStatus: "Unpaid" | "Pending" | "Paid" = order.paid_status;
            if (totals.amount_due <= 0.01) {
              paidStatus = "Paid";
            } else if (totals.amount_paid > 0) {
              paidStatus = "Pending";
            }
            
            set(state => ({
              ordersById: {
                ...state.ordersById,
                [orderId]: {
                  ...state.ordersById[orderId],
                  payments: newPayments,
                  items: updatedItems,
                  paid_status: paidStatus,
                  ...totals,
                }
              }
            }));
            
            if (orderId === get().activeOrderId) {
              _updateActiveOrderTotals();
            }
            
            // Sync payment to backend
            const supabase = _supabaseClient;
            if (supabase && order.db_order_id) {
              supabase.rpc('process_payment', {
                p_order_id: order.db_order_id,
                p_payment_method: method === "Cash" ? "cash" : "card_manual",
                p_amount: amount,
                p_tip_amount: tipAmount || 0,
                p_amount_tendered: transactionDetails?.amountTendered,
                p_terminal_type: transactionDetails?.terminalType || "manual",
                p_terminal_id: transactionDetails?.terminalId || "POS-001",
                p_transaction_details: transactionDetails,
              }).catch(console.error);
            }
          },
          
          markOrderAsPaid: (orderId) => {
            const order = get().ordersById[orderId];
            if (!order) return;
            
            // Trigger inventory depletion
            if (order.items.length > 0) {
              useInventoryStore.getState().decrementStockFromSale(order.items);
            }
            
            set(state => ({
              ordersById: {
                ...state.ordersById,
                [orderId]: {
                  ...state.ordersById[orderId],
                  paid_status: "Paid",
                  check_status: "Closed",
                }
              }
            }));
          },
          
          // === KITCHEN ===
          markAllItemsAsReady: (orderId) => {
            const order = get().ordersById[orderId];
            if (!order) return;
            
            // Trigger inventory
            useInventoryStore.getState().decrementStockFromSale(order.items);
            
            // Merge similar items
            const mergedItemsMap = new Map<string, CartItem>();
            for (const item of order.items) {
              if (item.isDraft) continue;
              
              const itemKey = generateItemCompositeKey(item.menuItemId, item.customizations);
              const existing = mergedItemsMap.get(itemKey);
              
              if (existing) {
                existing.quantity += item.quantity;
              } else {
                mergedItemsMap.set(itemKey, {
                  ...item,
                  item_status: "ready",
                  kitchen_status: "ready",
                });
              }
            }
            
            const updatedItems = Array.from(mergedItemsMap.values());
            
            set(state => ({
              ordersById: {
                ...state.ordersById,
                [orderId]: {
                  ...state.ordersById[orderId],
                  items: updatedItems,
                  order_status: "ready",
                }
              }
            }));
            
            // Sync status
            const supabase = _supabaseClient;
            if (supabase && order.db_order_id) {
              OrderService.updateOrderStatus(supabase, order.db_order_id, "ready")
                .catch(console.error);
            }
          },
          
          markAllItemsAsServed: (orderId) => {
            const order = get().ordersById[orderId];
            if (!order) return;
            
            useInventoryStore.getState().decrementStockFromSale(order.items);
            
            set(state => ({
              ordersById: {
                ...state.ordersById,
                [orderId]: {
                  ...state.ordersById[orderId],
                  items: state.ordersById[orderId].items.map(item => ({
                    ...item,
                    item_status: "served" as const,
                    kitchen_status: "served" as const,
                  })),
                  order_status: "completed",
                }
              }
            }));
            
            const supabase = _supabaseClient;
            if (supabase && order.db_order_id) {
              OrderService.updateOrderStatus(supabase, order.db_order_id, "completed")
                .catch(console.error);
            }
          },
          
          fireActiveOrderToKitchen: () => {
            const { activeOrderId, ordersById, startNewOrder } = get();
            if (!activeOrderId) return;
            
            const currentOrder = ordersById[activeOrderId];
            if (!currentOrder || currentOrder.items.length === 0) return;
            if (currentOrder.order_status !== "draft") return;
            
            const now = new Date().toISOString();
            
            // Update current order
            set(state => ({
              ordersById: {
                ...state.ordersById,
                [activeOrderId]: {
                  ...state.ordersById[activeOrderId],
                  items: state.ordersById[activeOrderId].items.map(item => ({
                    ...item,
                    item_status: "preparing" as const,
                    kitchen_status: "sent" as const,
                  })),
                  order_status: "preparing",
                  opened_at: state.ordersById[activeOrderId].opened_at || now,
                }
              }
            }));
            
            // Create new order
            const newOrder = startNewOrder();
            set({
              activeOrderId: newOrder.id,
              activeOrderSubtotal: 0,
              activeOrderTax: 0,
              activeOrderTotal: 0,
              activeOrderDiscount: 0,
              activeOrderOutstandingSubtotal: 0,
              activeOrderOutstandingTax: 0,
              activeOrderOutstandingTotal: 0,
            });
            
            // Sync status
            const supabase = _supabaseClient;
            if (supabase && currentOrder.db_order_id) {
              OrderService.updateOrderStatus(supabase, currentOrder.db_order_id, "preparing")
                .catch(console.error);
            }
            
            toastService.show({
              title: "Order Sent",
              message: "The order has been sent to the kitchen.",
              type: "success",
            });
          },
          
          sendNewItemsToKitchen: () => {
            const { activeOrderId, ordersById } = get();
            if (!activeOrderId) return;
            
            const order = ordersById[activeOrderId];
            if (!order) return;
            
            const newItems = order.items.filter(item => 
              !item.kitchen_status || item.kitchen_status === "new"
            );
            
            if (newItems.length === 0) return;
            
            set(state => ({
              ordersById: {
                ...state.ordersById,
                [activeOrderId]: {
                  ...state.ordersById[activeOrderId],
                  items: state.ordersById[activeOrderId].items.map(item =>
                    (!item.kitchen_status || item.kitchen_status === "new")
                      ? { ...item, kitchen_status: "sent" as const, item_status: "preparing" as const }
                      : item
                  ),
                  order_status: "preparing",
                }
              }
            }));
            
            const supabase = _supabaseClient;
            if (supabase && order.db_order_id) {
              OrderService.updateOrderStatus(supabase, order.db_order_id, "preparing")
                .catch(console.error);
            }
            
            toastService.show({
              title: "Items Sent",
              message: `${newItems.length} item${newItems.length > 1 ? "s" : ""} sent to kitchen.`,
              type: "success",
            });
          },
          
          sendNewItemsToKitchenForOrder: (orderId) => {
            const order = get().ordersById[orderId];
            if (!order) return;
            
            const hasNewItems = order.items.some(item => 
              !item.kitchen_status || item.kitchen_status === "new"
            );
            
            if (!hasNewItems) return;
            
            set(state => ({
              ordersById: {
                ...state.ordersById,
                [orderId]: {
                  ...state.ordersById[orderId],
                  items: state.ordersById[orderId].items.map(item =>
                    (!item.kitchen_status || item.kitchen_status === "new")
                      ? { ...item, kitchen_status: "sent" as const, item_status: "preparing" as const }
                      : item
                  ),
                  order_status: "preparing",
                  opened_at: state.ordersById[orderId].opened_at || new Date().toISOString(),
                }
              }
            }));
            
            toastService.show({
              title: "Items Sent",
              message: "New items sent to kitchen.",
              type: "success",
            });
          },
          
          // === TABLE MANAGEMENT ===
          transferOrderToTable: (orderId, newTableId) => {
            set(state => ({
              ordersById: {
                ...state.ordersById,
                [orderId]: {
                  ...state.ordersById[orderId],
                  service_location_id: newTableId,
                }
              }
            }));
          },
          
          consolidateOrdersForTables: (tableIds, tableNames) => {
            const { ordersById, orderIds } = get();
            
            const ordersToMerge = orderIds
              .map(id => ordersById[id])
              .filter(o => o.service_location_id && tableIds.includes(o.service_location_id));
            
            if (ordersToMerge.length === 0) return "";
            
            const allItems = ordersToMerge.flatMap(o => o.items);
            const oldOrderIds = ordersToMerge.map(o => o.id);
            const primaryTableId = tableIds[0];
            
            const earliestStartTime = ordersToMerge.reduce((earliest: string | null, order) => {
              if (!order.opened_at) return earliest;
              if (!earliest || order.opened_at < earliest) return order.opened_at;
              return earliest;
            }, null);
            
            const newId = `order_${Date.now()}`;
            const taxRate = useStoreSettingsStore.getState().defaultTaxRate || 8.25;
            const totals = calculateOrderTotals(
              allItems,
              null,
              ordersToMerge.flatMap(o => o.payments),
              taxRate
            );
            
            const newOrder: OrderProfile = {
              id: newId,
              service_location_id: primaryTableId,
              order_type: "Dine In",
              order_status: "preparing",
              check_status: "Opened",
              paid_status: "Unpaid",
              customer_name: `Merged Table (${tableNames.join(", ")})`,
              guest_count: ordersToMerge.reduce((sum, o) => sum + (o.guest_count || 1), 0),
              server_name: ordersToMerge[0]?.server_name || "Unknown",
              items: allItems,
              courses: { 1: { course_number: 1, status: "open" } },
              working_course: 1,
              payments: ordersToMerge.flatMap(o => o.payments),
              ...totals,
              sync_status: "pending",
              opened_at: earliestStartTime,
            };
            
            // Remove old orders, add new one
            const newOrdersById = { ...ordersById };
            oldOrderIds.forEach(id => delete newOrdersById[id]);
            newOrdersById[newId] = newOrder;
            
            set({
              ordersById: newOrdersById,
              orderIds: [...orderIds.filter(id => !oldOrderIds.includes(id)), newId],
            });
            
            return newId;
          },
          
          // === ARCHIVING & CLEANUP ===
          archiveOrder: (orderId) => {
            const order = get().ordersById[orderId];
            if (!order) return null;
            
            // Trigger stock deduction
            if (order.items.length > 0) {
              useInventoryStore.getState().decrementStockFromSale(order.items);
            }
            
            const tableId = order.service_location_id;
            
            // Prepare final order for history
            const finalOrder = {
              ...order,
              order_status: order.order_status === "void" ? "void" as const : "completed" as const,
              closed_at: order.closed_at || new Date().toISOString(),
            };
            
            // Save to previous orders
            usePreviousOrdersStore.getState().addOrderToHistory(finalOrder);
            
            // Remove from active orders
            set(state => {
              const { [orderId]: removed, ...remaining } = state.ordersById;
              return {
                ordersById: remaining,
                orderIds: state.orderIds.filter(id => id !== orderId),
                activeOrderId: state.activeOrderId === orderId ? null : state.activeOrderId,
              };
            });
            
            _updateActiveOrderTotals();
            
            return tableId;
          },
          
          deleteOrder: (orderId) => {
            set(state => {
              const { [orderId]: removed, ...remaining } = state.ordersById;
              return {
                ordersById: remaining,
                orderIds: state.orderIds.filter(id => id !== orderId),
              };
            });
          },
          
          clearCart: () => {
            const { activeOrderId, ordersById } = get();
            if (!activeOrderId) return;
            
            const order = ordersById[activeOrderId];
            const taxRate = useStoreSettingsStore.getState().defaultTaxRate || 8.25;
            const totals = calculateOrderTotals([], order?.checkDiscount, [], taxRate);
            
            set(state => ({
              ordersById: {
                ...state.ordersById,
                [activeOrderId]: {
                  ...state.ordersById[activeOrderId],
                  items: [],
                  payments: [],
                  ...totals,
                }
              },
              activeOrderSubtotal: 0,
              activeOrderTax: 0,
              activeOrderTotal: 0,
              activeOrderDiscount: 0,
              activeOrderOutstandingSubtotal: 0,
              activeOrderOutstandingTax: 0,
              activeOrderOutstandingTotal: 0,
            }));
            
            toastService.show({
              title: "Cart Cleared",
              message: "All items removed from the order.",
              type: "success",
            });
          },
          
          voidOrder: (orderId) => {
            set(state => ({
              ordersById: {
                ...state.ordersById,
                [orderId]: {
                  ...state.ordersById[orderId],
                  order_status: "void",
                  check_status: "Closed",
                }
              }
            }));
            
            get().archiveOrder(orderId);
          },
          
          // === UTILITIES ===
          setPendingTableSelection: (tableId) => {
            set({ pendingTableSelection: tableId });
          },
          
          setOrders: (orders) => {
            const ordersById: Record<string, OrderProfile> = {};
            const orderIds: string[] = [];
            
            orders.forEach(o => {
              // Ensure all required fields
              const sanitized: OrderProfile = {
                ...o,
                items: o.items || [],
                payments: o.payments || [],
                courses: o.courses || { 1: { course_number: 1, status: "open" } },
                working_course: o.working_course || 1,
                subtotal: o.subtotal ?? 0,
                discount_amount: o.discount_amount ?? 0,
                tax_amount: o.tax_amount ?? 0,
                total_amount: o.total_amount ?? 0,
                amount_paid: o.amount_paid ?? 0,
                amount_due: o.amount_due ?? 0,
                outstanding_subtotal: o.outstanding_subtotal ?? 0,
                outstanding_tax: o.outstanding_tax ?? 0,
                outstanding_total: o.outstanding_total ?? 0,
                sync_status: o.sync_status || "pending",
              };
              ordersById[o.id] = sanitized;
              orderIds.push(o.id);
            });
            
            set({ ordersById, orderIds });
          },
          
          setOpenedAt: (orderId, openedAt) => {
            set(state => ({
              ordersById: {
                ...state.ordersById,
                [orderId]: {
                  ...state.ordersById[orderId],
                  opened_at: openedAt,
                }
              }
            }));
          },
          
          setClosedAt: (orderId, closedAt) => {
            set(state => ({
              ordersById: {
                ...state.ordersById,
                [orderId]: {
                  ...state.ordersById[orderId],
                  closed_at: closedAt,
                }
              }
            }));
          },
          
          generateCartItemId: (menuItemId, customizations, isDraft = false) => {
            const compositeKey = generateItemCompositeKey(menuItemId, customizations);
            const timestamp = Date.now();
            const randomSuffix = Math.random().toString(36).substr(2, 9);
            
            if (isDraft) {
              return `draft_${compositeKey}_${timestamp}`;
            }
            return `${compositeKey}_${timestamp}_${randomSuffix}`;
          },
          
          // ================================================================
          // COURSING ACTIONS
          // ================================================================
          
          setWorkingCourse: (orderId, courseNumber) => {
            const order = get().ordersById[orderId];
            if (!order) return;
            
            // Validate course is open
            const courseInfo = order.courses[courseNumber];
            if (courseInfo && courseInfo.status !== 'open') {
              toastService.show({
                title: 'Cannot Select Course',
                message: `Course ${courseNumber} has already been fired.`,
                type: 'warning'
              });
              return;
            }
            
            // Update (ensure course exists)
            set(state => ({
              ordersById: {
                ...state.ordersById,
                [orderId]: {
                  ...state.ordersById[orderId],
                  working_course: courseNumber,
                  courses: {
                    ...state.ordersById[orderId].courses,
                    [courseNumber]: state.ordersById[orderId].courses[courseNumber] || {
                      course_number: courseNumber,
                      status: 'open' as const
                    }
                  }
                }
              }
            }));
            
            // Sync to backend
            const supabase = _supabaseClient;
            if (supabase && order.server_id) {
              supabase.rpc('set_working_course', {
                p_order_id: order.server_id,
                p_course_number: courseNumber
              }).catch(console.error);
            }
          },
          
          createNextCourse: (orderId) => {
            const order = get().ordersById[orderId];
            if (!order) return 1;
            
            const maxCourse = Math.max(...Object.keys(order.courses).map(Number), 0);
            const nextCourse = maxCourse + 1;
            
            set(state => ({
              ordersById: {
                ...state.ordersById,
                [orderId]: {
                  ...state.ordersById[orderId],
                  working_course: nextCourse,
                  courses: {
                    ...state.ordersById[orderId].courses,
                    [nextCourse]: {
                      course_number: nextCourse,
                      status: 'open' as const
                    }
                  }
                }
              }
            }));
            
            // Sync to backend
            const supabase = _supabaseClient;
            if (supabase && order.server_id) {
              supabase.rpc('create_next_course', {
                p_order_id: order.server_id
              }).catch(console.error);
            }
            
            return nextCourse;
          },
          
          fireCourse: async (orderId, courseNumber) => {
            const order = get().ordersById[orderId];
            if (!order) throw new Error('Order not found');
            
            // Validate: Course must be open
            const courseInfo = order.courses[courseNumber];
            if (courseInfo && courseInfo.status !== 'open') {
              throw new Error(`Course ${courseNumber} is already fired`);
            }
            
            // Validate: Course must have items
            const itemsInCourse = order.items.filter(i => i.course_number === courseNumber);
            if (itemsInCourse.length === 0) {
              toastService.show({
                title: 'Cannot Fire Course',
                message: `Course ${courseNumber} has no items`,
                type: 'warning'
              });
              throw new Error(`Course ${courseNumber} has no items to fire`);
            }
            
            const now = Date.now();
            
            // Optimistic update
            set(state => ({
              ordersById: {
                ...state.ordersById,
                [orderId]: {
                  ...state.ordersById[orderId],
                  courses: {
                    ...state.ordersById[orderId].courses,
                    [courseNumber]: {
                      course_number: courseNumber,
                      status: 'fired' as const,
                      fired_at: now
                    },
                    [courseNumber + 1]: state.ordersById[orderId].courses[courseNumber + 1] || {
                      course_number: courseNumber + 1,
                      status: 'open' as const
                    }
                  },
                  items: state.ordersById[orderId].items.map(i =>
                    i.course_number === courseNumber && i.kitchen_status === 'new'
                      ? { ...i, kitchen_status: 'sent' as KitchenStatus }
                      : i
                  ),
                  working_course: state.ordersById[orderId].working_course === courseNumber
                    ? courseNumber + 1
                    : state.ordersById[orderId].working_course,
                  order_status: 'preparing',
                  opened_at: state.ordersById[orderId].opened_at || new Date(now).toISOString(),
                }
              }
            }));
            
            // Sync to backend
            const supabase = _supabaseClient;
            if (supabase && order.server_id) {
              try {
                await supabase.rpc('fire_course', {
                  p_order_id: order.server_id,
                  p_course_number: courseNumber
                });
              } catch (error) {
                // Revert on error
                set(state => ({
                  ordersById: {
                    ...state.ordersById,
                    [orderId]: {
                      ...state.ordersById[orderId],
                      courses: {
                        ...state.ordersById[orderId].courses,
                        [courseNumber]: {
                          course_number: courseNumber,
                          status: 'open' as const,
                          fired_at: undefined
                        }
                      },
                      items: state.ordersById[orderId].items.map(i =>
                        i.course_number === courseNumber
                          ? { ...i, kitchen_status: 'new' as KitchenStatus }
                          : i
                      ),
                    }
                  }
                }));
                throw error;
              }
            }
            
            toastService.show({
              title: 'Course Fired',
              message: `Course ${courseNumber} sent to kitchen (${itemsInCourse.length} items)`,
              type: 'success'
            });
          },
          
          markCourseServed: (orderId, courseNumber) => {
            set(state => ({
              ordersById: {
                ...state.ordersById,
                [orderId]: {
                  ...state.ordersById[orderId],
                  courses: {
                    ...state.ordersById[orderId].courses,
                    [courseNumber]: {
                      ...state.ordersById[orderId].courses[courseNumber],
                      status: 'served' as const,
                      served_at: Date.now()
                    }
                  },
                  items: state.ordersById[orderId].items.map(i =>
                    i.course_number === courseNumber
                      ? { ...i, kitchen_status: 'served' as KitchenStatus }
                      : i
                  ),
                }
              }
            }));
            
            // Sync to backend
            const order = get().ordersById[orderId];
            const supabase = _supabaseClient;
            if (supabase && order?.server_id) {
              supabase.rpc('mark_course_served', {
                p_order_id: order.server_id,
                p_course_number: courseNumber
              }).catch(console.error);
            }
          },
          
          setItemCourse: (orderId, itemId, targetCourse) => {
            const order = get().ordersById[orderId];
            if (!order) return;
            
            const item = order.items.find(i => i.id === itemId);
            if (!item) return;
            
            // Validate source course is open
            const sourceCourseInfo = order.courses[item.course_number];
            if (sourceCourseInfo && sourceCourseInfo.status !== 'open') {
              toastService.show({
                title: 'Cannot Move Item',
                message: `Item is in fired course ${item.course_number}`,
                type: 'warning'
              });
              return;
            }
            
            // Validate target course is open
            const targetCourseInfo = order.courses[targetCourse];
            if (targetCourseInfo && targetCourseInfo.status !== 'open') {
              toastService.show({
                title: 'Cannot Move Item',
                message: `Course ${targetCourse} has been fired`,
                type: 'warning'
              });
              return;
            }
            
            // Update
            set(state => ({
              ordersById: {
                ...state.ordersById,
                [orderId]: {
                  ...state.ordersById[orderId],
                  items: state.ordersById[orderId].items.map(i =>
                    i.id === itemId ? { ...i, course_number: targetCourse } : i
                  ),
                  courses: {
                    ...state.ordersById[orderId].courses,
                    [targetCourse]: state.ordersById[orderId].courses[targetCourse] || {
                      course_number: targetCourse,
                      status: 'open' as const
                    }
                  }
                }
              }
            }));
            
            // Sync to backend
            const supabase = _supabaseClient;
            if (supabase && item.db_order_item_id) {
              supabase.rpc('set_item_course', {
                p_order_item_id: item.db_order_item_id,
                p_course_number: targetCourse
              }).catch(console.error);
            }
          },
          
          // ================================================================
          // COURSING GETTERS
          // ================================================================
          
          getItemsByCourse: (orderId, courseNumber) => {
            const order = get().ordersById[orderId];
            if (!order) return [];
            return order.items.filter(i => i.course_number === courseNumber);
          },
          
          isCourseOpen: (orderId, courseNumber) => {
            const order = get().ordersById[orderId];
            if (!order) return true;  // Default to open if course doesn't exist
            const courseInfo = order.courses[courseNumber];
            return !courseInfo || courseInfo.status === 'open';
          },
          
          canModifyItem: (orderId, itemId) => {
            const order = get().ordersById[orderId];
            if (!order) return false;
            const item = order.items.find(i => i.id === itemId);
            if (!item) return false;
            const courseInfo = order.courses[item.course_number];
            return !courseInfo || courseInfo.status === 'open';
          },
          
          getOpenCourses: (orderId) => {
            const order = get().ordersById[orderId];
            if (!order) return [1];
            return Object.values(order.courses)
              .filter(c => c.status === 'open')
              .map(c => c.course_number)
              .sort((a, b) => a - b);
          },
          
          getFiredCourses: (orderId) => {
            const order = get().ordersById[orderId];
            if (!order) return [];
            return Object.values(order.courses)
              .filter(c => c.status !== 'open')
              .map(c => c.course_number)
              .sort((a, b) => a - b);
          },
        };
      },
      {
        name: "order-store-v2",
        storage: createJSONStorage(() => AsyncStorage),
        partialize: (state) => ({
          ordersById: state.ordersById,
          orderIds: state.orderIds,
          activeOrderId: state.activeOrderId,
        }),
      }
    )
  )
);

// ============================================================================
// SELECTORS (Optimized for minimal re-renders)
// ============================================================================

// O(1) - Direct access to cached values
export const selectActiveOrderTotals = (state: OrderState) => ({
  subtotal: state.activeOrderSubtotal,
  tax: state.activeOrderTax,
  total: state.activeOrderTotal,
  discount: state.activeOrderDiscount,
  outstandingSubtotal: state.activeOrderOutstandingSubtotal,
  outstandingTax: state.activeOrderOutstandingTax,
  outstandingTotal: state.activeOrderOutstandingTotal,
});

// O(1) - Direct lookup
export const selectOrder = (orderId: string) => (state: OrderState) =>
  state.ordersById[orderId];

export const selectActiveOrder = (state: OrderState) =>
  state.activeOrderId ? state.ordersById[state.activeOrderId] : null;

export const selectActiveOrderItems = (state: OrderState) =>
  state.activeOrderId ? state.ordersById[state.activeOrderId]?.items || [] : [];

export const selectActiveOrderItemCount = (state: OrderState) => {
  const order = selectActiveOrder(state);
  return order?.items.reduce((sum, item) => sum + item.quantity, 0) ?? 0;
};

// O(n) but only when needed
export const selectOpenOrders = (state: OrderState) =>
  state.orderIds
    .map(id => state.ordersById[id])
    .filter(order => !["completed", "void"].includes(order.order_status));

export const selectOrdersForTable = (tableId: string) => (state: OrderState) =>
  state.orderIds
    .map(id => state.ordersById[id])
    .filter(order => order.service_location_id === tableId);

// For backward compatibility
export const selectOrders = (state: OrderState) =>
  state.orderIds.map(id => state.ordersById[id]);

// ============================================================================
// COURSING SELECTORS
// ============================================================================

export const selectWorkingCourse = (orderId: string) => (state: OrderState) =>
  state.ordersById[orderId]?.working_course ?? 1;

export const selectActiveCourses = (orderId: string) => (state: OrderState) => {
  const order = state.ordersById[orderId];
  if (!order) return { 1: { course_number: 1, status: 'open' as const } };
  return order.courses;
};

export const selectOpenCourses = (orderId: string) => (state: OrderState) => {
  const order = state.ordersById[orderId];
  if (!order) return [1];
  return Object.values(order.courses)
    .filter(c => c.status === 'open')
    .map(c => c.course_number)
    .sort((a, b) => a - b);
};

export const selectFiredCourses = (orderId: string) => (state: OrderState) => {
  const order = state.ordersById[orderId];
  if (!order) return [];
  return Object.values(order.courses)
    .filter(c => c.status !== 'open')
    .map(c => c.course_number)
    .sort((a, b) => a - b);
};

export const selectItemsByCourse = (orderId: string, courseNumber: number) => (state: OrderState) => {
  const order = state.ordersById[orderId];
  if (!order) return [];
  return order.items.filter(i => i.course_number === courseNumber);
};

export const selectIsCourseOpen = (orderId: string, courseNumber: number) => (state: OrderState) => {
  const order = state.ordersById[orderId];
  if (!order) return true;
  const courseInfo = order.courses[courseNumber];
  return !courseInfo || courseInfo.status === 'open';
};

export const selectCourseItemCount = (orderId: string, courseNumber: number) => (state: OrderState) => {
  const order = state.ordersById[orderId];
  if (!order) return 0;
  return order.items.filter(i => i.course_number === courseNumber).length;
};