import { ComponentType } from "react";

export interface Order {
  id: string;
  customerName: string;
  status: "Ready" | "Preparing";
  type: "Dine In" | "Take Away" | "Delivery";
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

export interface MenuItemType {
  id: string;
  name: string;
  description?: string;
  price: number;
  cashPrice?: number;
  image?: string;
  meal: ("Lunch" | "Dinner" | "Brunch" | "Specials")[];
  category: "Appetizers" | "Main Course" | "Sides" | "Drinks" | "Dessert";
  availableDiscount?: Discount;
  sizes?: ItemSize[];
  addOns?: AddOn[];
}

export type TableStatus = "Available" | "In Use" | "Needs Cleaning";
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
  item_status?: "Preparing" | "Ready";
  originalPrice: number;
  price: number; // Final price after size/add-ons
  image?: string; // Image filename is a top-level property
  customizations: {
    size?: ItemSize;
    addOns?: AddOn[];
    notes?: string;
  };
  availableDiscount?: Discount;
  appliedDiscount?: Discount | null;
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

export type PaymentStatus = "Paid" | "In Progress" | "Refunded";
export type OrderType = "Dine In" | "Takeout" | "Delivery";

export interface PreviousOrder {
  serialNo: string;
  orderDate: string; // e.g., "Oct 16, 2024"
  orderTime: string; // e.g., "09:31 AM"
  orderId: string;
  paymentStatus: PaymentStatus;
  server: string;
  itemCount: number;
  type: OrderType;
  total: number;
  items: CartItem[]; // The detailed list of items for the notes modal
}

export type InventoryItemStatus =
  | "Active"
  | "Draft"
  | "Inactive"
  | "Out of Stock";

export interface InventoryItem {
  id: string; // e.g., '#2020E11'
  serialNo: string;
  name: string;
  image?: string; // Filename from assets
  description: string;
  stock: number;
  unit: "PCs" | "KGs" | "Liters";
  lastUpdate: string; // e.g., '02/03/2025 10:30 AM'
  status: InventoryItemStatus;
  // Additional details for the forms
  category: string;
  modifier: string;
  availability: boolean;
}

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
  // If it's `null`, it's not a dine-in order.
  service_location_id: string | null;

  // The current lifecycle stage of the order.
  order_status:
  | "Open"
  | "Closed"
  | "Cancelled"
  | "Preparing"
  | "Ready"
  | "Building"
  | "Voided";

  // The editable state of the check itself (separate from fulfillment status)
  check_status: "Opened" | "Closed";

  // The type of fulfillment for this order.
  order_type?: "Dine In" | "Take-Away" | "Delivery";

  // Payment status for the order
  paid_status: "Paid" | "Pending" | "Unpaid";

  // The actual items in the order. This is the "cart".
  items: CartItem[];

  // Timestamps for tracking order lifecycle
  opened_at: string; // ISO String format is recommended
  closed_at?: string; // Optional, set when the order is closed

  // Final calculated values, set upon closing the order
  total_amount?: number;
  total_tax?: number;

  // Additional optional details
  customer_name?: string;
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
