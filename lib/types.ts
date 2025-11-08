import { ComponentType } from "react";

// --- INVENTORY TYPES ---
export type InventoryUnit = "bottle" | "pcs" | "lbs" | "bag" | "qt";

export interface Vendor {
  id: string;
  name: string;
  contactPerson: string;
  email: string;
  phone: string;
  description?: string;
}

export interface InventoryItem {
  id: string;
  name: string;
  category: string;
  stockQuantity: number;
  unit: InventoryUnit;
  reorderThreshold: number;
  cost: number; // Cost per unit
  vendorId: string | null;
  // Stock tracking mode: in/out toggles or explicit quantity tracking
  stockTrackingMode?: "in_stock" | "out_of_stock" | "quantity";
}

export interface POLineItem {
  inventoryItemId: string;
  quantity: number;
  cost: number; // Cost at the time of order
}

export interface ExternalExpenseLineItem {
  inventoryItemId: string; // Reference to the inventory item
  itemName: string; // Display name of the item
  quantity: number; // Quantity purchased
  unitPrice: number; // Price per unit
  totalAmount: number; // Total amount for this line item (quantity * unitPrice)
  notes?: string; // Optional notes for this specific item
}

export interface ExternalExpense {
  id: string;
  expenseNumber: string; // e.g., "EXP-0001"
  totalAmount: number; // Total amount for all items in this expense
  purchasedByEmployeeId: string; // Employee who made the purchase
  purchasedByEmployeeName: string; // Employee name for display
  purchasedAt: string; // When the purchase was made
  items: ExternalExpenseLineItem[]; // Array of items purchased
  notes?: string; // Optional notes about the entire expense
  // Optional reference to a purchase order if this expense is related to a specific PO
  relatedPOId?: string;
  relatedPONumber?: string;
  // Store information
  storeName?: string; // Name of the store where items were purchased
  storeLocation?: string; // Location of the store
}

export interface PurchaseOrder {
  id: string;
  poNumber: string; // e.g., "PO-0001"
  vendorId: string;
  // Deferred payment lifecycle
  // Draft: not submitted yet
  // Pending Delivery: submitted and waiting for goods
  // Awaiting Payment: goods received and logged; payment will be made on next delivery
  // Paid: invoice fully paid and logged
  // Cancelled: order cancelled
  status:
    | "Draft"
    | "Pending Delivery"
    | "Awaiting Payment"
    | "Paid"
    | "Cancelled";
  items: POLineItem[];
  // Immutable snapshot of what was originally requested at creation time
  originalItems?: POLineItem[];
  // What was actually received (set at delivery logging time)
  receivedItems?: POLineItem[];
  createdAt: string;
  // When delivery was logged
  deliveryLoggedAt?: string;
  // Optional photos (URIs) uploaded when receiving goods
  deliveryPhotos?: string[];
  // Notes entered when logging delivery (e.g., missing/damaged)
  discrepancyNotes?: string;
  // Employee attribution for accountability
  createdByEmployeeId?: string;
  createdByEmployeeName?: string;
  // Payment logging info when marking as Paid
  payment?: {
    method: "Card" | "Cash";
    amount: number;
    paidAt: string;
    cardLast4?: string;
    paidToEmployee?: string; // Employee name at vendor who received payment
  };
}
// --- END INVENTORY TYPES ---

// --- RECIPE TYPE ---
export interface RecipeItem {
  inventoryItemId: string;
  quantity: number;
}
// --- END RECIPE TYPE ---

export interface Order {
  id: string;
  customerName: string;
  status: "Ready" | "Preparing";
  type: "Dine In" | "Takeaway" | "Delivery";
  table: number;
  time: string;
}

export interface Discount {
  id: string;
  label: string;
  subLabel?: string;
  value: number; // e.g., 0.15 for 15%
  type: "percentage";
}

export interface ItemSize {
  id: string;
  name: string; // e.g., 'Regular', 'Large'
  priceModifier: number; // e.g., 0 for Regular, 2.00 for Large
}

export interface AddOn {
  id: string;
  name: string; // e.g., 'Extra Onions'
  price: number;
}

export interface ModifierOption {
  id: string;
  name: string;
  price: number;
  isAvailable?: boolean; // For items that are "86'd" (unavailable)
  isDefault?: boolean; // For default selected options
}

export interface ModifierCategory {
  id: string;
  name: string;
  type: "required" | "optional";
  selectionType: "single" | "multiple";
  maxSelections?: number; // For multiple selection with limits
  description?: string; // e.g., "Choose any", "Included up to 3; extras +$0.25 each"
  options: ModifierOption[];
}

export interface ExtendedModifierGroup extends ModifierCategory {
  items: MenuItemType[]; // Array of menu items that use this modifier group
}

export interface MenuItemType {
  id: string;
  name: string;
  description?: string;
  price: number;
  cashPrice?: number;
  image?: string;
  meal: ("Lunch" | "Dinner" | "Brunch" | "Specials")[];
  category: string[]; // Changed to array to support multiple categories
  availableDiscount?: Discount;
  sizes?: ItemSize[];
  addOns?: AddOn[];
  modifierGroupIds?: string[];
  allergens?: string[];
  cardBgColor?: string;
  availability?: boolean; // New field for availability status
  customPricing?: CustomPricing[]; // New field for custom pricing
  recipe?: RecipeItem[];
  // Optional stock tracking directly on menu items (for items not built from recipes)
  stockQuantity?: number;
  reorderThreshold?: number;
  // Stock tracking mode: "in_stock", "out_of_stock", or "quantity"
  stockTrackingMode?: "in_stock" | "out_of_stock" | "quantity";
}

export interface CustomPricing {
  id: string;
  categoryId: string;
  categoryName: string;
  price: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  availability?: boolean;
  recipe?: RecipeItem[];
}

export interface Menu {
  id: string;
  name: string;
  description?: string;
  isActive: boolean;
  categories: string[]; // Array of category names
  schedules?: Schedule[];
  createdAt: string;
  updatedAt: string;
}

export interface Schedule {
  id: string;
  name: string;
  startTime: string;
  endTime: string;
  days: string[];
  isActive: boolean;
}

export type TableStatus =
  | "Available"
  | "In Use"
  | "Needs Cleaning"
  | "Not in Service";
export type TableShape = "circle" | "square";
export type TableCapacity = "Small" | "Medium" | "Large";

export interface TableOrder {
  id: string;
  customerName: string;
  total: number;
}

export interface TableType {
  id: string;
  name: string;
  status: TableStatus;
  capacity: number;
  // Instead of 'shape', we now reference the SVG component directly
  component: ComponentType<any>;
  order?: TableOrder | null;
  x: number;
  y: number;
  rotation: number;
  type: "table" | "static-object"; // 'static-object' for things like cashier, walls, plants etc.
  isPrimary?: boolean;
  mergedWith?: string[];
}

export interface Layout {
  id: string;
  name: string;
  tables: TableType[];
}

export type OnlineOrderStatus =
  | "New Orders"
  | "Confirmed/In-Process"
  | "Ready to Dispatch"
  | "Dispatched";
export type DeliveryPartner =
  | "Door Dash"
  | "grubhub"
  | "Uber-Eats"
  | "Food Panda";

export interface CartItem {
  id: string; // Unique ID for this cart instance (e.g., menuItemId + timestamp)
  menuItemId: string; // The original ID from the menu data
  name: string;
  quantity: number;
  // Tracks how many of the quantity have been fully paid. Defaults to 0.
  paidQuantity?: number;
  // Per-item preparation status tracking for table workflow
  item_status?: "Preparing" | "Ready" | "Served";
  // Kitchen send status - tracks whether item has been sent to kitchen
  kitchen_status?: "new" | "sent" | "ready" | "served";
  // Indicates if this item is a draft (not yet confirmed)
  isDraft?: boolean;
  originalPrice: number;
  price: number; // Final price after size/add-ons
  image?: string; // Image filename is a top-level property
  customizations: {
    size?: ItemSize;
    addOns?: AddOn[];
    modifiers?: {
      categoryId: string;
      categoryName: string;
      options: {
        id: string;
        name: string;
        price: number;
      }[];
    }[];
    notes?: string;
  };
  availableDiscount?: Discount;
  appliedDiscount?: Discount | null;
  refundedQuantity?: number;
}

export interface OnlineOrder {
  id: string; // e.g., #45654
  status: OnlineOrderStatus;
  deliveryPartner: DeliveryPartner;
  customerName: string;
  total: number;
  itemCount: number;
  timestamp: string; // e.g., '02/03/25, 05:36 PM'
  // Detailed info for the details page
  customerDetails: {
    id: string;
    phone: string;
    email: string;
  };
  paymentStatus: "Paid" | "Pending";
  items: CartItem[];
}

export type PaymentStatus =
  | "Paid"
  | "In Progress"
  | "Refunded"
  | "Partially Refunded"
  | "Unpaid";
export type OrderType = "Dine In" | "Takeaway" | "Delivery";

export interface PreviousOrder {
  serialNo: string;
  orderDate: string; // e.g., "Oct 16, 2024"
  orderTime: string; // e.g., "09:31 AM"
  orderId: string;
  paymentStatus: PaymentStatus;
  customer: string;
  server: string;
  itemCount: number;
  type: OrderType;
  total: number;
  items: CartItem[]; // The detailed list of items for the notes modal
  // Refund tracking fields
  refunded?: boolean;
  refundedAmount?: number;
  originalTotal?: number;
}

export type InventoryItemStatus =
  | "Active"
  | "Draft"
  | "Inactive"
  | "Out of Stock";

export interface UserProfile {
  id: string;
  employeeId: string;
  fullName: string;
  dob: string;
  gender: "Male" | "Female" | "Other";
  country: string;
  address: string;
  email: string;
  phone: string;
  pin: string;
  profileImageUrl?: string; // e.g., 'tom_hardy.png'
}

export interface Shift {
  id: string;
  periodId: string;
  date: string; // ISO format: "YYYY-MM-DD"
  role: Role;
  startTime: string; // ISO 8601 format: "YYYY-MM-DDTHH:mm:ss.sssZ"
  endTime: string; // ISO 8601 format: "YYYY-MM-DDTHH:mm:ss.sssZ"
  location?: string;
  status?:
    | "confirmed"
    | "pending-drop"
    | "pending-swap"
    | "dropped"
    | "on-shift"
    | "open";
  breakMinutes?: number;
  actualClockIn?: string; // "HH:mm"
  actualClockOut?: string; // "HH:mm"
  isToday?: boolean;
  managerNote?: string;
  restRiskHours?: number;
  expectedPace?: "Calm" | "Moderate" | "Busy";
  staffingLevel?: "Fully staffed" | "May need help";
  isOvertimeRisk?: boolean;
  // Properties from manager's view
  employeeId: string | null;
  requiredCount?: number;
  locked?: boolean;
}

export interface SchedulePeriod {
  id: string;
  name: string;
  startDate: string; // ISO date
  endDate: string; // ISO date
  status: "draft" | "active" | "completed" | "draft-edit";
  shifts: Shift[]; // Nested shifts
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  isScheduled?: boolean;
  originalScheduleId?: string;
}

export interface WeeklySchedule {
  id: string;
  name: string; // e.g., "Week of Nov 10-16, 2025"
  startDate: string; // ISO date
  endDate: string; // ISO date (always 7 days after startDate)
  status: "draft" | "active" | "completed" | "draft-edit"; // Assuming similar statuses
  shifts: Shift[]; // Nested shifts
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  type: "weekly"; // Explicit discriminator
  originalScheduleId?: string;
}

export interface ConflictInfo {
  hasConflict: boolean;
  conflictingPeriods: SchedulePeriod[];
}

export interface PTORequest {
  id: string;
  employeeId: string;
  startDate: string; // ISO format: "YYYY-MM-DD"
  endDate: string; // ISO format: "YYYY-MM-DD"
  hours: number;
  status: "approved" | "denied" | "pending";
  note?: string;
  submittedAt: string; // ISO string
  reviewedAt?: string; // ISO string
  approverId?: string;
  denialReason?: string;
}

export interface ShiftRequest {
  id: string;
  ownerId: string; // The employee who initiated the request.
  type: "drop" | "swap";
  status: "pending" | "approved" | "denied" | "picked-up" | "completed" | "pending-peer" | "pending-manager" | "canceled";
  submittedAt: string; // ISO string
  shift: Shift; // Kept for drop requests
  note?: string;
  reason?: string;
  approverId?: string;
  denialReason?: string;
  // For drop requests
  pickedUpBy?: string;
  pickedUpAt?: string;
  // For swap requests (new fields)
  myShiftId?: string; // The ID of the shift being offered by the initiator.
  peerId?: string; // The employee ID of the peer being requested to swap with.
  peerShiftId?: string; // The ID of the shift being offered in return by the peer.
}

export interface ShiftStatus {
  status: "Clocked In" | "Clocked Out";
  duration: string;
  clockInTime: string;
}

export interface ShiftHistoryEntry {
  id: string;
  date: string;
  clockIn: string;
  breakInitiated: string;
  breakEnded: string;
  clockOut: string;
  duration: string;
  role: string;
}

export interface PrinterDevice {
  id: string;
  name: string;
  isEnabled: boolean;
  status: "Connected" | "Disconnected";
  connectionType?: "Wi-Fi" | "Bluetooth";
  ipAddress?: string;
}

export interface PrinterRule {
  id: string; // A unique ID for the rule, e.g., a timestamp or UUID
  isEnabled: boolean;
  category: string; // e.g., 'Food', 'Drinks'
  printerId: string; // The ID of the printer to route to
}

export interface PaymentTerminal {
  id: string; // e.g., 'TRM00123'
  name: string; // e.g., 'Terminal A-123'
  isEnabled: boolean;
  status: "Connected" | "Disconnected";
  batteryLevel: number; // e.g., 85
}

export interface OfflineOrder {
  serialNo: string;
  orderDate: string;
  orderTime: string;
  orderId: string;
  server: string;
  total: number;
}

export interface TrackedOrderItem {
  name: string;
  quantity: number;
}

export interface TrackedOrder {
  id: string;
  customerName: string;
  status: string; // e.g., 'On kitchen Hand'
  type: "Dine In" | "Takeout" | "Delivery";
  table: number;
  timestamp: string; // e.g., '09:00 AM'
  items: TrackedOrderItem[];
  totalItems: number;
}

export type PaymentType = "Card" | "Cash" | "Split";

export interface OrderProfile {
  id: string; // The unique ID for this order (e.g., "order_1755...")

  // Link to the physical location. Crucially, this is `string | null`.
  // If it's `null', it's not a dine-in order.
  service_location_id: string | null;

  // The current lifecycle stage of the order.
  order_status:
    | "Open"
    | "Closed"
    | "Cancelled"
    | "Preparing"
    | "Ready"
    | "Served"
    | "Building"
    | "Voided";

  // The editable state of the check itself (separate from fulfillment status)
  check_status: "Opened" | "Closed";

  // The type of fulfillment for this order.
  order_type?: "Dine In" | "Takeaway" | "Delivery";

  // Payment status for the order
  paid_status: "Paid" | "Pending" | "Unpaid";

  // The actual items in the order. This is the "cart".
  items: CartItem[];

  // Timestamps for tracking order lifecycle
  opened_at: string | null; // ISO String format is recommended
  closed_at?: string; // Optional, set when the order is closed

  // Final calculated values, set upon closing the order
  total_amount?: number;
  total_tax?: number;
  total_discount?: number;

  // Additional optional details
  guest_count?: number;
  customer_name?: string;
  customer_phone?: string;
  delivery_address?: string;
  server_name?: string;
  checkDiscount?: Discount | null;
  paymentMethod?: PaymentType; // Example usage
  payments?: { amount: number; method: PaymentType }[]; // Example usage
}

export type CheckStatus = "Pending" | "Cleared" | "Voided";

export interface Check {
  serialNo: string;
  checkNo: string;
  payee: string;
  amount: number;
  dateIssued: string; // e.g., 'Oct 16, 2024'
  timeIssued: string; // e.g., '09:31 AM'
  status: CheckStatus;
  // Details for the modal
  items: { name: string; price: number }[];
  subtotal: number;
  tax: number;
  tips: number;
  total: number;
}

export type DrawerStatus = "Closed" | "Open" | "Cleared";

export interface DrawerSummary {
  id: string; // Unique ID for the drawer session
  status: DrawerStatus;
  cashier: string;
  drawerName: string;
  startingCash: number;
  expectedCash: number;
  actualCash: number | null; // Can be null if not yet counted
  difference: number | null; // Can be null if not yet counted
  dateIssued: string; // e.g., 'Oct 16, 2024'
  timeIssued: string; // e.g., '09:31 AM'
}

export type EmployeeClockStatus = "Clocked In" | "Clocked Out";

export interface EmployeeShift {
  id: string; // Unique ID for the employee
  name: string;
  jobTitle: "Manager" | "Cashier" | "Chef";
  clockInStatus: EmployeeClockStatus;
  clockOutStatus: EmployeeClockStatus | "N/A";
  clockInTime: string | "N/A";
  clockOutTime: string | "N/A";
  totalHours: string | "N/A";
  // Additional details for the profile modal
  profile: {
    id: string;
    dob: string;
    role: string;
    gender: string;
    country: string;
    address: string;
  };
}

export interface Address {
  street: string;
  city: string;
  state: string;
  zip: string;
}

export interface DayHours {
  day:
    | "Monday"
    | "Tuesday"
    | "Wednesday"
    | "Thursday"
    | "Friday"
    | "Saturday"
    | "Sunday";
  open: string; // "HH:mm" format
  close: string; // "HH:mm" format
  enabled: boolean;
}

export interface SpecialHours {
  id: string;
  date: string; // "YYYY-MM-DD"
  description: string;
  open: string;
  close: string;
}

export interface Notification {
  id: string;
  type:
    | "swap_request"
    | "drop_request"
    | "manager_note"
    | "pto_update"
    | "shift_reminder";
  message: string;
  isRead: boolean;
  timestamp: string; // ISO string
  relatedShiftId?: string;
  employeeId: string;
}

export type Role = "Cashier" | "Barista" | "Line Cook" | "Prep" | "Supervisor";
