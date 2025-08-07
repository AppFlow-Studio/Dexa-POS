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
