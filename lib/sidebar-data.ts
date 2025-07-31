import {
  BarChart3,
  ChefHat,
  History,
  Home,
  LucideIcon,
  Settings,
  ShoppingBag,
  Users,
  UtensilsCrossed,
  Warehouse,
} from "lucide-react-native";

export interface SubItem {
  id: string;
  label: string;
}

export interface SidebarItem {
  id: string;
  label: string;
  icon: LucideIcon;
  subItems?: SubItem[];
}

export const SIDEBAR_DATA: SidebarItem[] = [
  { id: "home", label: "Home", icon: Home },
  { id: "tables", label: "Tables", icon: UtensilsCrossed },
  { id: "customers", label: "Customers List", icon: Users },
  { id: "online_orders", label: "Online Orders", icon: ShoppingBag },
  { id: "previous_orders", label: "Previous Orders", icon: History },
  { id: "analytics", label: "Analytics", icon: BarChart3 },
  // --- Divider ---
  {
    id: "menu",
    label: "Menu",
    icon: ChefHat,
    subItems: [
      { id: "lunch", label: "Lunch" },
      { id: "dinner", label: "Dinner" },
      { id: "brunch", label: "Brunch" },
      { id: "specials", label: "Specials" },
    ],
  },
  { id: "inventory", label: "Inventory", icon: Warehouse },
  {
    id: "settings",
    label: "Settings",
    icon: Settings,
    subItems: [
      { id: "basic", label: "Basic" },
      { id: "store_info", label: "Store Info" },
      { id: "my_profile", label: "My Profile" },
      { id: "category", label: "Category" },
      { id: "modifiers", label: "Modifiers" },
      { id: "taxes", label: "Taxes" },
    ],
  },
];
