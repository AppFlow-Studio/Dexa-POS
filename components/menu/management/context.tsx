/**
 * What every menu management panel needs from the screen: the write actions,
 * the offline write gate, and the shared sheets (86, price, out-of-stock,
 * delete). The sheets are mounted once by the screen; panels open them through
 * these callbacks instead of each owning a ref.
 */
import { createContext, useContext } from "react";

import type { SnoozeItem } from "@/components/menu/SnoozeBottomSheet";
import type { MenuManagementActions } from "@/hooks/menu/useMenuManagementActions";
import type { MenuItemType } from "@/lib/types";

export interface ItemOpenContext {
  categoryId?: string | null;
  menuId?: string | null;
}

export interface MenuManagementContextValue {
  actions: MenuManagementActions;
  /** False while offline: every server write is disabled. */
  canWrite: boolean;
  openSnooze: (target: SnoozeItem) => void;
  /**
   * Tap on an item: the full editor when this store owns it, otherwise the
   * per-location price & availability sheet (global items).
   */
  openItem: (item: MenuItemType, context?: ItemOpenContext) => void;
  openOutOfStock: () => void;
}

export const MenuManagementContext =
  createContext<MenuManagementContextValue | null>(null);

export function useMenuManagement(): MenuManagementContextValue {
  const value = useContext(MenuManagementContext);
  if (!value) {
    throw new Error("useMenuManagement must be used inside the menu screen");
  }
  return value;
}
