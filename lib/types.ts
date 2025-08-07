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
