import type { DejavooSaleTransactionResponse } from '@/types/dejavoo-spin-api'
import type { OrderRefundItemRecord, ReversalRecord } from '@/types/refunds'
import { ComponentType } from 'react'
import { TABLE_SHAPES } from './table-shapes'

// Re-export refund types
export type { OrderRefundItemRecord, ReversalRecord }

// --- INVENTORY TYPES ---
export type InventoryUnit = 'bottle' | 'pcs' | 'lbs' | 'bag' | 'qt'

export type InventoryUnitType = 'unit' | 'weight' | 'volume'

export interface Vendor {
  id: string
  name: string
  contactName: string
  email: string | null
  phone: string | null
  address: string | null
  website: string | null
  description?: string
}

export interface InventoryItem {
  id: string
  name: string
  category: string
  description?: string | null
  image?: string | null
  stockQuantity: number
  unit: string // e.g. "kg", "pcs" (display unit)
  unitType: InventoryUnitType // "unit", "weight", "volume"
  reorderThreshold: number
  cost: number // Cost per unit
  vendorId: string | null
  locationId: string | null // null = Global
  isGlobal?: boolean // derived helper
  stockUpdateReason?: string // for stock updates
  // Stock tracking mode: in/out toggles or explicit quantity tracking
  stockTrackingMode?: 'in_stock' | 'out_of_stock' | 'quantity'
}

export interface POLineItem {
  inventoryItemId: string
  quantity: number
  cost: number // Cost at the time of order
}

export interface ExternalExpenseLineItem {
  inventoryItemId: string // Reference to the inventory item
  itemName: string // Display name of the item
  quantity: number // Quantity purchased
  unitPrice: number // Price per unit
  totalAmount: number // Total amount for this line item (quantity * unitPrice)
  notes?: string // Optional notes for this specific item
}

export interface ExternalExpense {
  id: string
  expenseNumber: string // e.g., "EXP-0001"
  totalAmount: number // Total amount for all items in this expense
  purchasedByEmployeeId: string // Employee who made the purchase
  purchasedByEmployeeName: string // Employee name for display
  purchasedAt: string // When the purchase was made
  items: ExternalExpenseLineItem[] // Array of items purchased
  notes?: string // Optional notes about the entire expense
  // Optional reference to a purchase order if this expense is related to a specific PO
  relatedPOId?: string
  relatedPONumber?: string
  // Store information
  storeName?: string // Name of the store where items were purchased
  storeLocation?: string // Location of the store
}

export interface PurchaseOrder {
  id: string
  poNumber: string // e.g., "PO-0001"
  vendorId: string
  // Deferred payment lifecycle
  // Draft: not submitted yet
  // Pending Delivery: submitted and waiting for goods
  // Awaiting Payment: goods received and logged; payment will be made on next delivery
  // Paid: invoice fully paid and logged
  // Cancelled: order cancelled
  status:
    | 'Draft'
    | 'Pending Delivery'
    | 'Awaiting Payment'
    | 'Paid'
    | 'Cancelled'
  items: POLineItem[]
  // Immutable snapshot of what was originally requested at creation time
  originalItems?: POLineItem[]
  // What was actually received (set at delivery logging time)
  receivedItems?: POLineItem[]
  createdAt: string
  // When delivery was logged
  deliveryLoggedAt?: string
  // Optional photos (URIs) uploaded when receiving goods
  deliveryPhotos?: string[]
  // Notes entered when logging delivery (e.g., missing/damaged)
  discrepancyNotes?: string
  // Employee attribution for accountability
  createdByEmployeeId?: string
  createdByEmployeeName?: string
  // Payment logging info when marking as Paid
  payment?: {
    method: 'Card' | 'Cash'
    amount: number
    paidAt: string
    cardLast4?: string
    paidToEmployee?: string // Employee name at vendor who received payment
  }
}
// --- END INVENTORY TYPES ---

// --- RECIPE TYPE ---
export interface RecipeItem {
  inventoryItemId: string
  quantity: number
}
// --- END RECIPE TYPE ---

export interface Order {
  id: string
  customerName: string
  status: 'Ready' | 'Preparing'
  type: 'Dine In' | 'Takeaway' | 'Delivery'
  table: number
  time: string
}

export interface Discount {
  id: string
  label: string
  subLabel?: string
  value: number // e.g., 0.15 for 15% or fixed dollar amount
  type: 'percentage' | 'fixed'
}

// === ORDER DISCOUNT TYPES (backend-aligned) ===
export type DiscountType = 'percentage' | 'fixed_amount'
export type DiscountSource = 'preset' | 'open' | 'promo_code' | 'loyalty'

export interface OrderAppliedDiscount {
  local_id: string
  order_discount_id?: string // Backend order_discounts.id after sync
  discount_id: string | null
  discount_name?: string // Display name for the discount
  discount_type: DiscountType
  discount_value: number
  source: DiscountSource
  calculated_amount: number
  pre_discount_subtotal: number
  applied_by_staff_profiles_id: string | null
  approved_by_staff_profiles_id?: string | null
  applied_at: string
  applied_to_item_ids?: string[]
  sync_status?: 'pending' | 'synced' | 'failed'
  sync_error?: string | null
}

export interface ItemSize {
  id: string
  name: string // e.g., 'Regular', 'Large'
  priceModifier: number // e.g., 0 for Regular, 2.00 for Large
}

export interface AddOn {
  id: string
  name: string // e.g., 'Extra Onions'
  price: number
}

export interface ModifierOption {
  id: string
  name: string
  price: number
  isAvailable?: boolean // For items that are "86'd" (unavailable)
  isDefault?: boolean // For default selected options
  recipe?: RecipeItem[]
}

export interface ModifierCategory {
  id: string
  name: string
  type: 'required' | 'optional'
  selectionType: 'single' | 'multiple'
  maxSelections?: number // For multiple selection with limits
  description?: string // e.g., "Choose any", "Included up to 3; extras +$0.25 each"
  options: ModifierOption[]
  // Location ownership - null = global (merchant-wide), UUID = local to that location
  location_id?: string | null
  location_name?: string
  items?: MenuItemType[]
}

export interface ExtendedModifierGroup extends ModifierCategory {
  items: MenuItemType[] // Array of menu items that use this modifier group
}

// Price level data from backend - represents the 5-level pricing cascade
export interface PriceLevels {
  level_1_base: number
  level_2_location_item: number | null
  level_2_modifier: number | null
  level_2_modifier_type: string | null
  level_3_category: number | null
  level_4_location_category: number | null
  level_5_location_menu: number | null
}

// Source of the effective price - which level won the cascade
export type PriceSource =
  | 'base'
  | 'location_item'
  | 'category'
  | 'location_category'
  | 'location_menu'

export interface MenuItemType {
  id: string
  name: string
  description?: string
  price: number
  cashPrice?: number
  image?: string
  meal: ('Lunch' | 'Dinner' | 'Brunch' | 'Specials')[]
  category: string[] // Changed to array to support multiple categories
  availableDiscount?: Discount
  sizes?: ItemSize[]
  addOns?: AddOn[]
  modifierGroupIds?: string[]
  allergens?: string[]
  cardBgColor?: string
  placeholderIcon?: string
  availability?: boolean // New field for availability status
  customPricing?: CustomPricing[] // Legacy field - being replaced by priceLevels
  // Menu-specific price overrides (Level 5)
  // Map<MenuID, Price>
  menuPriceOverrides?: Record<string, number>
  // Category-specific price overrides (Level 4)
  // Map<CategoryID, Price>
  categoryPriceOverrides?: Record<string, number>
  recipe?: RecipeItem[]
  // Optional stock tracking directly on menu items (for items not built from recipes)
  stockQuantity?: number
  reorderThreshold?: number
  // Stock tracking mode: "in_stock", "out_of_stock", or "quantity"
  stockTrackingMode?: 'in_stock' | 'out_of_stock' | 'quantity'
  // NEW: Backend pricing metadata
  priceLevels?: PriceLevels
  priceSource?: PriceSource
  // Location ownership - null = global (merchant-wide), UUID = local to that location
  location_id?: string | null
  displayOrder?: number
}

export interface CustomPricing {
  id: string
  categoryId: string
  categoryName: string
  price: number
  isActive: boolean
  createdAt: string
  updatedAt: string
  availability?: boolean
  recipe?: RecipeItem[]
}

export interface Menu {
  id: string
  name: string
  description?: string
  isActive: boolean
  displayOrder?: number
  categories: Category[] // Changed to array of full Category objects (Tree Structure)
  schedules?: Schedule[]
  createdAt: string
  updatedAt: string
  // Location ownership - null = global (merchant-wide), UUID = local to that location
  location_id?: string | null
}

export interface Category {
  id: string
  name: string
  isActive: boolean
  order: number
  displayOrder?: number
  createdAt: string
  schedules?: Schedule[]
  // Location ownership - null = global (merchant-wide), UUID = local to that location
  location_id?: string | null
  location_name?: string // Display name of the owning location
  items?: MenuItemType[] // Nested items for Tree Structure
}

export interface Schedule {
  id: string
  name: string
  startTime: string
  endTime: string
  days: string[]
  isActive: boolean
}

export type TableStatus =
  | 'Available'
  | 'In Use'
  | 'Needs Cleaning'
  | 'Not in Service'
export type TableShape = 'circle' | 'square'
export type TableCapacity = 'Small' | 'Medium' | 'Large'

export interface TableOrder {
  id: string
  customerName: string
  total: number
}

export interface TableType {
  id: string
  name: string
  status: TableStatus
  capacity: number
  // Instead of 'shape', we now reference the SVG component directly
  component: ComponentType<any>
  shapeId: keyof typeof TABLE_SHAPES

  order?: TableOrder | null
  x: number
  y: number
  rotation: number
  type: 'table' | 'static-object' // 'static-object' for things like cashier, walls, plants etc.
  isPrimary?: boolean
  mergedWith?: string[]
}

export interface Layout {
  id: string
  name: string
  tables: TableType[]
}

export type OnlineOrderStatus =
  | 'New Orders'
  | 'Confirmed/In-Process'
  | 'Ready to Dispatch'
  | 'Dispatched'
export type DeliveryPartner =
  | 'Door Dash'
  | 'grubhub'
  | 'Uber-Eats'
  | 'Food Panda'

export interface CartItem {
  id: string // Unique ID for this cart instance (e.g., menuItemId + timestamp)
  menuItemId: string // The original ID from the menu data
  db_order_item_id?: string // Backend order_item_id after sync (for update/void RPC calls)
  locationExclusiveItemId?: string // Optional location-exclusive item ID
  // Open item support
  is_open_item?: boolean
  open_item_name?: string
  open_item_price?: number
  name: string
  category_name?: string // Category for backend sync
  quantity: number
  // Payment tracking
  paidQuantity: number // How many units paid for
  paymentId?: string // Which payment covered this

  // Per-item preparation status tracking for table workflow
  // Per-item preparation status tracking for table workflow
  // Supports both legacy (PascalCase) and backend (lowercase) values
  item_status?:
    | 'Preparing'
    | 'Ready'
    | 'Served'
    | 'preparing'
    | 'ready'
    | 'served'
  // Kitchen send status - tracks whether item has been sent to kitchen
  kitchen_status?: 'new' | 'sent' | 'preparing' | 'ready' | 'served'
  // Indicates if this item is a draft (not yet confirmed)
  isDraft?: boolean
  originalPrice: number
  price: number // Final price after size/add-ons
  unitPrice: number // Base Price before modifiers and add-ons
  cashPrice: number
  image?: string // Image filename is a top-level property
  customizations: {
    size?: ItemSize
    addOns?: AddOn[]
    modifiers?: {
      categoryId: string
      categoryName: string
      options: {
        id: string
        name: string
        price: number
        isNo?: boolean
      }[]
    }[]
    notes?: string
  }
  availableDiscount?: Discount
  appliedDiscount?: Discount | null
  refundedQuantity?: number
  refundedAmount?: number
  // Tax fields for per-item tax calculation
  tax_category?: string | null // e.g., "standard", "alcohol"
  is_tax_exempt?: boolean
  // Voided item tracking
  is_voided?: boolean
  void_reason?: string
  // Sync status tracking for resilient backend sync
  sync_status?: 'pending' | 'syncing' | 'synced' | 'failed'
  sync_error?: string
  sync_retry_count?: number
  // NEW: Context for price level tracking - which category/menu was this item added from
  addedFromCategoryId?: string | null
  addedFromMenuId?: string | null

  // Pre-calculated (synced from backend or calculated locally)
  subtotal: number // price * quantity (or discounted subtotal if discount applied)
  cashSubtotal: number // cashPrice * quantity (or discounted if discount applied)
  taxRate: number // Tax rate % captured at add time
  taxAmount: number // subtotal * taxRate
  cashTaxAmount: number // cashSubtotal * taxRate

  // Distributed discount from order-level/check discounts (synced from backend)
  discount_amount?: number // Card pricing discount distributed to this item
  discount_cash_amount?: number // Cash pricing discount distributed to this item

  // Actual Base Prices With no Modifiers
  baseCardPrice: number
  baseCashPrice: number

  // Course management (for multi-course dining)
  courseNumber?: number // Which course this item belongs to (1, 2, 3, etc.)

  // Seat management (for per-seat ordering)
  seatNumber?: number | null // Which seat (1..N), null = shared/unassigned
}

export interface OnlineOrder {
  id: string // e.g., #45654
  status: OnlineOrderStatus
  deliveryPartner: DeliveryPartner
  customerName: string
  total: number
  itemCount: number
  timestamp: string // e.g., '02/03/25, 05:36 PM'
  // Detailed info for the details page
  customerDetails: {
    id: string
    phone: string
    email: string
  }
  paymentStatus: 'Paid' | 'Pending'
  items: CartItem[]
}

export type PaymentStatus =
  | 'Paid'
  | 'In Progress'
  | 'Refunded'
  | 'Partially Refunded'
  | 'Unpaid'
export type OrderType = 'Dine In' | 'Takeaway' | 'Delivery'

export interface PreviousOrder {
  serialNo: string
  orderDate: string // e.g., "Oct 16, 2024"
  orderTime: string // e.g., "09:31 AM"
  timestamp: string // ISO timestamp for filtering/sorting (e.g., "2026-01-13T23:56:00.000Z")
  orderId: string
  display_number: string
  paymentStatus: PaymentStatus
  customer: string
  server: string
  opened_at: string
  closed_at: string
  sent_to_kitchen_at: string
  last_activity_at: string
  itemCount: number
  amount_paid: number
  amount_due: number
  cash_amount_due: number
  type: OrderType
  total: number
  tax?: number // Tax amount for bill display
  items: CartItem[] // The detailed list of items for the notes modal
  notes?: string // Order-level notes (customer requests, special instructions)
  payments?: OrderProfile['payments'] // Add payments array
  // Refund tracking fields
  refunded?: boolean
  voided?: boolean
  refundedAmount?: number
  originalTotal?: number
  service_location_id?: string
  service_location_name?: string
  // Station tracking for view_scope awareness
  station_id?: string | null
  station_name?: string | null
  // Check management
  checkStatus?: 'Opened' | 'Closed'
  db_order_id?: string // For RPC calls
  order_source?: string | null
  delivery_platform?: string | null
  reversals?: ReversalRecord[]
  order_refund_items?: OrderRefundItemRecord[]
  // Staff attribution (for fraud detection — who created this order)
  created_by_staff_profile_id?: string | null
}

export type InventoryItemStatus =
  | 'Active'
  | 'Draft'
  | 'Inactive'
  | 'Out of Stock'

export interface UserProfile {
  id: string
  employeeId: string
  fullName: string
  dob: string
  gender: 'Male' | 'Female' | 'Other'
  country: string
  address: string
  email: string
  phone: string
  pin: string
  profileImageUrl?: string // e.g., 'tom_hardy.png'
}

export interface Shift {
  id: string
  periodId: string
  date: string // ISO format: "YYYY-MM-DD"
  role: Role
  startTime: string // ISO 8601 format: "YYYY-MM-DDTHH:mm:ss.sssZ"
  endTime: string // ISO 8601 format: "YYYY-MM-DDTHH:mm:ss.sssZ"
  location?: string
  status?:
    | 'confirmed'
    | 'pending-drop'
    | 'pending-swap'
    | 'dropped'
    | 'on-shift'
    | 'open'
  breakMinutes?: number
  actualClockIn?: string // "HH:mm"
  actualClockOut?: string // "HH:mm"
  isToday?: boolean
  managerNote?: string
  restRiskHours?: number
  expectedPace?: 'Calm' | 'Moderate' | 'Busy'
  staffingLevel?: 'Fully staffed' | 'May need help'
  isOvertimeRisk?: boolean
  // Properties from manager's view
  employeeId: string | null
  requiredCount?: number
  locked?: boolean
}

export interface SchedulePeriod {
  id: string
  name: string
  startDate: string // ISO date
  endDate: string // ISO date
  status: 'draft' | 'active' | 'completed' | 'draft-edit'
  shifts: Shift[] // Nested shifts
  createdAt: string
  updatedAt: string
  createdBy: string
  isScheduled?: boolean
  type: 'period' // Explicit discriminator
  originalScheduleId?: string
}

export interface WeeklySchedule {
  id: string
  name: string // e.g., "Week of Nov 10-16, 2025"
  startDate: string // ISO date
  endDate: string // ISO date (always 7 days after startDate)
  status: 'draft' | 'active' | 'completed' | 'draft-edit' // Assuming similar statuses
  shifts: Shift[] // Nested shifts
  createdAt: string
  updatedAt: string
  createdBy: string
  type: 'weekly' // Explicit discriminator
  originalScheduleId?: string
}

export interface ConflictInfo {
  hasConflict: boolean
  conflictingPeriods: SchedulePeriod[]
}

export interface PTORequest {
  id: string
  employeeId: string
  startDate: string // ISO format: "YYYY-MM-DD"
  endDate: string // ISO format: "YYYY-MM-DD"
  hours: number
  status: 'approved' | 'denied' | 'pending'
  note?: string
  submittedAt: string // ISO string
  reviewedAt?: string // ISO string
  approverId?: string
  denialReason?: string
  revertedShifts?: Shift[]
}

export interface ShiftRequest {
  id: string
  ownerId: string // The employee who initiated the request.
  type: 'drop' | 'swap'
  status:
    | 'pending'
    | 'approved'
    | 'denied'
    | 'picked-up'
    | 'completed'
    | 'pending-peer'
    | 'pending-manager'
    | 'canceled'
  submittedAt: string // ISO string
  shift: Shift // Kept for drop requests
  note?: string
  reason?: string
  approverId?: string
  denialReason?: string
  revertedShift?: Shift
  // For drop requests
  pickedUpBy?: string
  pickedUpAt?: string
  // For swap requests (new fields)
  myShiftId?: string // The ID of the shift being offered by the initiator.
  peerId?: string // The employee ID of the peer being requested to swap with.
  peerShiftId?: string // The ID of the shift being offered in return by the peer.
  revertedMyShift?: Shift
  revertedPeerShift?: Shift
}

export interface ShiftStatus {
  status: 'Clocked In' | 'Clocked Out'
  duration: string
  clockInTime: string
}

export interface ShiftHistoryEntry {
  id: string
  employeeId: string
  date: string
  clockIn: string
  breakInitiated: string
  breakEnded: string
  clockOut: string
  duration: string
  role: string
}

export interface PTOAccrualEntry {
  date: string
  hoursWorked: number
  ptoEarned: number
  accrualRateUsed: number
  shiftId: string
  employeeId: string
}

export interface CompletedShift {
  shiftId: string
  employeeId: string
  date: string
  hoursWorked: number
}

export interface PrinterDevice {
  id: string
  name: string
  isEnabled: boolean
  status: 'Connected' | 'Disconnected'
  connectionType?: 'Wi-Fi' | 'Bluetooth'
  ipAddress?: string
}

export interface PrinterRule {
  id: string // A unique ID for the rule, e.g., a timestamp or UUID
  isEnabled: boolean
  category: string // e.g., 'Food', 'Drinks'
  printerId: string // The ID of the printer to route to
}

export interface PaymentTerminal {
  id: string // e.g., 'TRM00123'
  name: string // e.g., 'Terminal A-123'
  isEnabled: boolean
  status: 'Connected' | 'Disconnected'
  batteryLevel: number // e.g., 85
}

export interface TrackedOrderItem {
  name: string
  quantity: number
}

export interface TrackedOrder {
  id: string
  customerName: string
  status: string // e.g., 'On kitchen Hand'
  type: 'Dine In' | 'Takeout' | 'Delivery'
  table: number
  timestamp: string // e.g., '09:00 AM'
  items: TrackedOrderItem[]
  totalItems: number
}

export type PaymentType = 'Card' | 'Cash' | 'Split'

/**
 * Item coverage detail for a payment.
 * Tracks which items and quantities were covered by this payment.
 */
export interface OrderPaymentItemCoverage {
  itemId: string // db_order_item_id
  itemName: string // For UI display
  quantity: number // Units paid
  unitPrice: number // Price per unit used
  subtotal: number // quantity * unitPrice
}

export interface OrderPaymentTransactionDetails {
  terminalType?: string
  authorizationCode?: string
  cardType?: string
  last4?: string
  transactionId?: string
  amountTendered?: number
  changeGiven?: number
  isCashPriced?: boolean
  splitLabel?: string
  isCashPayment?: boolean
  isCash?: boolean
  rrn?: string
  batchNumber?: string
  invoiceNumber?: string
  entryMode?: string
  referenceId?: string
  // Full Dejavoo response details (sanitized, no First4/BIN/IPosToken)
  dejavooTransaction?: DejavooSaleTransactionResponse
  // Full Castles response JSONB (from buildCastlesTerminalResponse)
  castlesTransaction?: Record<string, unknown>
  [key: string]: unknown
}

export type SplitPaymentPath =
  | 'split-by-item'
  | 'split-evenly'
  | 'split-custom-amount'
  | 'pay-for-items'

export const SPLIT_PATH_LABELS: Record<SplitPaymentPath, string> = {
  'split-by-item': 'Split by Item',
  'split-evenly': 'Split Evenly',
  'split-custom-amount': 'Custom Amount',
  'pay-for-items': 'Pay for Items'
}

/**
 * Payment record for UI consumption with enhanced item coverage tracking.
 * Used in OrderProfile.payments array.
 */
export interface OrderProfilePayment {
  // Core identifiers
  id: string
  db_payment_id?: string // Backend ID for void operations
  localId?: string // Local ID for offline/sync tracking

  // Payment basics
  amount: number
  method: PaymentType
  tip_amount: number
  total_collected: number // amount + tip_amount

  // Card details (when applicable)
  cardBrand?: string
  last4?: string

  // Cash details (when applicable)
  amountTendered?: number
  changeGiven?: number
  isCashPriced?: boolean
  cashSavings?: number // original_amount - amount (discount received)

  // Portions (for detailed breakdown)
  subtotal_portion?: number
  tax_portion?: number
  discount_portion?: number

  // Split payment info
  splitInfo?: {
    portionIndex: number
    totalPortions: number
    isLastPortion: boolean
  }

  // Item coverage with quantity tracking
  itemsCovered: OrderPaymentItemCoverage[]

  // Status and timestamps
  status: 'pending' | 'authorized' | 'captured' | 'voided' | 'refunded'
  timestamp: string

  // Pre-auth fields (populated when status === 'authorized')
  isPreAuth?: boolean
  preAuthAmount?: number
  preAuthRrn?: string
  preAuthStan?: string // Castles only
  preAuthAuthCode?: string
  preAuthReferenceId?: string
  preAuthTerminalType?: 'dejavoo' | 'castles'

  // Void tracking
  isVoided: boolean
  voidReason?: string
  voidedAt?: string
  refundedAmount?: number
  refundedAt?: string
  reference_id?: string

  // Return/refund tracking fields
  isReturned?: boolean
  returnedAt?: string
  returnedBy?: string
  returnAmount?: number
  returnRrn?: string
  returnAuthCode?: string
  returnReferenceId?: string
  returnNumber?: string
  returnReason?: string

  // Tip adjustment tracking
  original_tip_amount?: number
  tip_adjusted_at?: string
  tip_adjusted_by?: string

  // Settlement tracking
  is_settled?: boolean
  settled_at?: string
  settled_batch_number?: string

  // Sync status (for offline-first reliability)
  sync_status?: 'synced' | 'pending' | 'failed'
  sync_error?: string
  sync_attempt_count?: number
  transactionDetails?: OrderPaymentTransactionDetails
}

export interface OrderProfile {
  id: string // The unique ID for this order (e.g., "order_1755...")
  customer_id?: string // The ID of the customer associated with this order ( For analytics Tracking trigger)
  // Backend sync fields (populated after first backend sync)
  db_order_id?: string // UUID from Supabase
  order_number?: string // Backend order number "ORD-YYYYMMDD-XXXX"
  display_number?: string // "#0042"
  sync_status?: 'pending' | 'synced' | 'failed' // Backend sync status

  // Link to the physical location. Crucially, this is `string | null`.
  // If it's `null', it's not a dine-in order.
  service_location_id: string | null
  // Table name cached at order creation time (for display without floor plan dependency)
  service_location_name?: string

  // Session tracking - bidirectional relationship with table sessions
  session_id?: string // Backend session UUID (for dine-in orders)
  local_session_id?: string // Local session ID (for offline reconciliation)

  // The current lifecycle stage of the order.
  // Supports both legacy (PascalCase) and new backend (lowercase) values
  // Supports only backend values now
  order_status:
    | 'draft'
    | 'pending'
    | 'sent_to_kitchen'
    | 'preparing'
    | 'ready'
    | 'completed'
    | 'cancelled'
    | 'refunded'
    | 'void'

  // The editable state of the check itself (separate from fulfillment status)
  check_status: 'Opened' | 'Closed'

  // The type of fulfillment for this order.
  // Supports both legacy and backend values
  order_type?:
    | 'Dine In'
    | 'Takeaway'
    | 'Delivery'
    | 'dine_in'
    | 'takeout'
    | 'delivery'

  // Payment status for the order
  paid_status: 'Paid' | 'Partial' | 'Pending' | 'Unpaid' | 'Refunded'

  // The actual items in the order. This is the "cart".
  items: CartItem[]

  // Timestamps for tracking order lifecycle
  opened_at: string | null // ISO String format is recommended
  closed_at?: string // Optional, set when the order is closed
  sent_to_kitchen_at?: string // When order was sent to kitchen
  last_activity_at?: string // Track last activity for draft cleanup

  // Final calculated values, set upon closing the order
  total_amount?: number
  total_cash_amount?: number
  total_tax?: number
  total_discount?: number

  // Payment tracking - synced from backend
  amount_paid?: number // Total amount paid so far
  amount_due?: number // Remaining amount due (CARD price - source of truth)
  cash_amount_due?: number // Cash price equivalent (for showing cash discount option)

  // Additional optional details
  guest_count?: number
  customer_name?: string
  customer_phone?: string
  customer_email?: string
  delivery_address?: string
  server_name?: string
  checkDiscount?: Discount | null
  applied_discounts?: OrderAppliedDiscount[]
  paymentMethod?: PaymentType // Example usage
  payments?: OrderProfilePayment[] // Payment records with full details
  split_payment_path?: SplitPaymentPath | null // Locks split method after first partial split payment
  notes?: string // Order-level notes (customer requests, special instructions)
  reversals?: ReversalRecord[]
  order_refund_items?: OrderRefundItemRecord[]

  // === STATION TRACKING ===
  station_id?: string | null // Station that created this order
  _sourceStationId?: string | null // Original creating station ID (for display)
  _sourceStationName?: string | null // Original creating station name (for display)

  // === STAFF ATTRIBUTION ===
  created_by_staff_profile_id?: string | null // staff_profiles.id of the employee who created this order

  // === ORDER SOURCE ===
  order_source?: string | null // "pos" | "online" | null
  delivery_platform?: string | null // "uber_eats" | "grubhub" | "doordash" | "food_panda" | null

  // === SYNC VERSION (for optimistic concurrency) ===
  sync_version?: number // Backend sync version for conflict detection

  // === BROADCAST METADATA (transient, not persisted to MMKV) ===
  _broadcastItemCount?: number // Non-voided item count from v2 broadcasts
}

export type CheckStatus = 'Pending' | 'Cleared' | 'Voided'

export interface Check {
  serialNo: string
  checkNo: string
  payee: string
  amount: number
  dateIssued: string // e.g., 'Oct 16, 2024'
  timeIssued: string // e.g., '09:31 AM'
  status: CheckStatus
  // Details for the modal
  items: { name: string; price: number }[]
  subtotal: number
  tax: number
  tips: number
  total: number
}

export type DrawerStatus = 'Closed' | 'Open' | 'Cleared'

export interface DrawerSummary {
  id: string // Unique ID for the drawer session
  status: DrawerStatus
  cashier: string
  drawerName: string
  startingCash: number
  expectedCash: number
  actualCash: number | null // Can be null if not yet counted
  difference: number | null // Can be null if not yet counted
  dateIssued: string // e.g., 'Oct 16, 2024'
  timeIssued: string // e.g., '09:31 AM'
}

export type EmployeeClockStatus = 'Clocked In' | 'Clocked Out'

export interface EmployeeShift {
  id: string // Unique ID for the employee
  name: string
  jobTitle: 'Manager' | 'Cashier' | 'Chef'
  clockInStatus: EmployeeClockStatus
  clockOutStatus: EmployeeClockStatus | 'N/A'
  clockInTime: string | 'N/A'
  clockOutTime: string | 'N/A'
  totalHours: string | 'N/A'
  // Additional details for the profile modal
  profile: {
    id: string
    dob: string
    role: string
    gender: string
    country: string
    address: string
  }
}

export interface Address {
  street: string
  city: string
  state: string
  zip: string
}

export interface DayHours {
  day:
    | 'Monday'
    | 'Tuesday'
    | 'Wednesday'
    | 'Thursday'
    | 'Friday'
    | 'Saturday'
    | 'Sunday'
  open: string // "HH:mm" format
  close: string // "HH:mm" format
  enabled: boolean
}

export interface SpecialHours {
  id: string
  date: string // "YYYY-MM-DD"
  description: string
  open: string
  close: string
}

export interface Notification {
  id: string
  type:
    | 'swap_request'
    | 'drop_request'
    | 'manager_note'
    | 'pto_update'
    | 'shift_reminder'
    | 'shift_updated'
    | 'shift_assigned'
    | 'schedule_published'
    | 'drop_request_approved'
    | 'drop_request_denied'
    | 'pto_request_approved'
    | 'pto_request_denied'
    | 'swap_request_received'
    | 'swap_request_peer_accepted'
    | 'swap_request_peer_denied'
    | 'swap_approved'
    | 'swap_denied'
    | 'refund_fraud_alert'
  message: string
  isRead: boolean
  timestamp: string // ISO string
  relatedShiftId?: string
  relatedRequestId?: string // New field for request-related notifications
  employeeId: string
  payload?: Record<string, any> // Optional payload for additional data
}

export type Role =
  | 'Cashier'
  | 'Barista'
  | 'Line Cook'
  | 'Prep'
  | 'Supervisor'
  | 'Manager'

// Role codes from Supabase location_members for employee authentication
export type MerchantRole =
  | 'merchant.cashier'
  | 'merchant.manager'
  | 'merchant.admin'
  | 'merchant.owner'

// --- SCHEDULE TEMPLATE TYPES ---

export interface TemplateShift {
  tempId: string
  employeeId: string | null
  dayOfWeek: number // 0 = Sunday, 6 = Saturday
  role: Role
  startTime: string // ISO string with a placeholder date, e.g., "1970-01-01T09:00:00.000Z"
  endTime: string // ISO string with a placeholder date, e.g., "1970-01-01T17:00:00.000Z"
  notes?: string
  breakMinutes?: number
  expectedPace?: 'Calm' | 'Moderate' | 'Busy'
  staffingLevel?: 'Fully staffed' | 'May need help'
}

export const PREDEFINED_TAGS = [
  'weekday',
  'weekend',
  'holiday',
  'peak',
  'slow',
  'morning',
  'evening'
] as const

export interface ScheduleTemplate {
  id: string
  name: string
  description: string
  tags: string[]
  shifts: TemplateShift[]
  lastUsed: Date
  isActiveForScheduling?: boolean
}

export interface WaitlistEntry {
  id: string
  name: string
  partySize: number
  arrivalTime: Date
  quotedTime: number // minutes
  notes?: string
  phone?: string
}

export type ApplyMode = 'merge' | 'replace-all' | 'fill-gaps'
