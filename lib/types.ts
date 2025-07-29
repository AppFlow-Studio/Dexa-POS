export interface Order {
  id: string;
  customerName: string;
  status: "Ready" | "Preparing";
  type: "Dine In" | "Take Away" | "Delivery";
  table: number;
  time: string;
}

export interface MenuItemType {
  id: string;
  name: string;
  price: number;
  cashPrice?: number;
  image?: string;
  // We can add category/meal types later for filtering
}
