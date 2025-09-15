import {
  BarChart3,
  ChefHat,
  History,
  Home,
  LucideIcon,
  Settings,
  ShoppingBag,
  UtensilsCrossed,
  Warehouse,
} from "lucide-react-native";
// Import the Href type from Expo Router
import { Href } from "expo-router";

// A single, recursive type for all sidebar items
export interface SidebarNavigationItem {
  id: string;
  label: string;
  icon?: LucideIcon;
  href?: Href; // href is optional and strongly typed
  subItems?: SidebarNavigationItem[];
}

export const SIDEBAR_DATA: SidebarNavigationItem[] = [
  { id: "home", label: "Home", icon: Home, href: "/home" as Href },
  {
    id: "tables",
    label: "Tables",
    icon: UtensilsCrossed,
    href: "/tables" as Href,
  },
  // {
  //   id: "customers",
  //   label: "Customers List",
  //   icon: Users,
  //   href: "/customers-list" as Href,
  // },
  {
    id: "online_orders",
    label: "Online Orders",
    icon: ShoppingBag,
    href: "/online-orders" as Href,
  },
  {
    id: "previous_orders",
    label: "Previous Orders",
    icon: History,
    href: "/previous-orders" as Href,
  },
  {
    id: "analytics",
    label: "Analytics",
    icon: BarChart3,
    href: "/analytics" as Href,
  },
  {
    id: "menu",
    label: "Menu",
    icon: ChefHat,
    subItems: [
      { id: "lunch", label: "Lunch", href: "/menu/lunch" as Href },
      { id: "dinner", label: "Dinner", href: "/menu/dinner" as Href },
    ],
  },
  {
    id: "inventory",
    label: "Inventory",
    icon: Warehouse,
    href: "/inventory" as Href,
  },
  {
    id: "settings",
    label: "Settings",
    icon: Settings,
    // Note: This parent item has no href, it only opens the accordion
    subItems: [
      {
        id: "basic",
        label: "Basic", // This is just a header, no href
        subItems: [
          {
            id: "my_profile",
            label: "My Profile",
            href: "/settings/basic/my-profile" as Href,
          },
          {
            id: "store_info",
            label: "Store Info",
            href: "/settings/basic/store-info" as Href,
          },
          {
            id: "category",
            label: "Category",
            href: "/settings/basic/category" as Href,
          },
          {
            id: "modifiers",
            label: "Modifiers",
            href: "/settings/basic/modifiers" as Href,
          },
          {
            id: "taxes",
            label: "Taxes",
            href: "/settings/basic/taxes" as Href,
          },
        ],
      },
      {
        id: "hardware_connection",
        label: "Hardware Connection",
        subItems: [
          {
            id: "printer",
            label: "Printer",
            href: "/settings/hardware-connection/printer" as Href,
          },
          {
            id: "printer_rules",
            label: "Printer Rules",
            href: "/settings/hardware-connection/printer-rules" as Href,
          },
          {
            id: "payment_terminal",
            label: "Payment Terminal (Card Reader)",
            href: "/settings/hardware-connection/payment-terminal" as Href,
          },
          {
            id: "customer_display",
            label: "Customer Display",
            href: "/settings/hardware-connection/customer-display" as Href,
          },
        ],
      },
      {
        id: "store_operation",
        label: "Store Operation", // Just a header
        subItems: [
          {
            id: "sync_status",
            label: "Sync and Offline Mode Status",
            href: "/settings/store-operation/sync-status" as Href,
          },
          {
            id: "receipt_rules",
            label: "Receipt and Tipping Rules",
            href: "/settings/store-operation/receipt-rules" as Href,
          },
          {
            id: "end_of_day",
            label: "End of Day Report",
            href: "/settings/store-operation/end-of-day" as Href,
          },
        ],
      },
      {
        id: "appearance_and_security",
        label: "Appearance and Security",
        subItems: [
          {
            id: "security_and_login",
            label: "Security and Login",
            href: "/settings/appearance-and-security/security-and-login" as Href,
          },
        ],
      },
      {
        id: "system_and_support",
        label: "System and Support",
        subItems: [
          {
            id: "device_and_support",
            label: "Device & Support",
            href: "/settings/system-and-support/device-and-support" as Href,
          },
          {
            id: "reset_application",
            label: "Reset Application",
            href: "/settings/system-and-support/reset-application" as Href,
          },
        ],
      },
    ],
  },
];
