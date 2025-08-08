import { CartItem } from "@/stores/useCartStore";

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
  shape: TableShape;
  order?: TableOrder | null;
  // Use x/y coordinates for precise positioning
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
