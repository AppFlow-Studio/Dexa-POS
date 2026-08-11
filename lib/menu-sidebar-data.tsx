import type { LucideIcon } from "lucide-react-native";

export interface MenuSidebarItem {
  id: string;
  label: string;
  icon?: LucideIcon;
  href: string;
}

export const MENU_SIDEBAR_DATA: MenuSidebarItem[] = [
  {
    id: "menus",
    label: "Menus",
    href: "/menu",
  },
  {
    id: "categories",
    label: "Categories",
    href: "/menu",
  },
  {
    id: "items",
    label: "Items",
    href: "/menu",
  },
  {
    id: "modifiers",
    label: "Modifiers",
    href: "/menu",
  },
  {
    id: "schedules",
    label: "Schedules",
    href: "/menu",
  },
];
