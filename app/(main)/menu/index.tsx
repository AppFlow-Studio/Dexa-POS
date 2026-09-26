/**
 * Menu management.
 *
 * The screen is a shell: the tab strip, the offline notice, the shared sheets,
 * and the shown tab's panel (components/menu/management/). Only that panel is
 * mounted, and it subscribes to just the store slices it needs; the old single
 * component re-rendered all five tabs whenever anything changed. See
 * docs/features/menu-management/menu-management-rework.md.
 */
import { Image as ExpoImage } from "expo-image";
import { router } from "expo-router";
import React, {
  startTransition,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { View } from "react-native";

import CategoriesPanel from "@/components/menu/management/CategoriesPanel";
import {
  MenuManagementContext,
  type ItemOpenContext,
  type MenuManagementContextValue,
} from "@/components/menu/management/context";
import ItemsPanel from "@/components/menu/management/ItemsPanel";
import MenuManagementTabs from "@/components/menu/management/MenuManagementTabs";
import MenusPanel from "@/components/menu/management/MenusPanel";
import ModifiersPanel from "@/components/menu/management/ModifiersPanel";
import SchedulesPanel from "@/components/menu/management/SchedulesPanel";
import {
  MenuScaleProvider,
  Notice,
  useS,
} from "@/components/menu/management/ui";
import OutOfStockSheet, {
  type OutOfStockSheetRef,
} from "@/components/menu/OutOfStockSheet";
import PriceEditBottomSheet, {
  type PriceEditBottomSheetRef,
} from "@/components/menu/PriceEditBottomSheet";
import SnoozeBottomSheet, {
  type SnoozeBottomSheetRef,
  type SnoozeItem,
} from "@/components/menu/SnoozeBottomSheet";
import ConfirmationModal from "@/components/settings/reset-application/ConfirmationModal";
import { useMenuManagementActions } from "@/hooks/menu/useMenuManagementActions";
import {
  MENU_OFFLINE_REASON,
  useMenuWriteGate,
} from "@/hooks/menu/useMenuWriteGate";
import { WifiOff } from "@/lib/icons";
import { colors } from "@/lib/theme";
import { toastService } from "@/lib/toastService";
import type { MenuItemType } from "@/lib/types";
import {
  useMenuManagementUiStore,
  type MenuManagementTab,
} from "@/stores/useMenuManagementUiStore";

const PANELS: Record<MenuManagementTab, React.ComponentType> = {
  menus: MenusPanel,
  categories: CategoriesPanel,
  items: ItemsPanel,
  modifiers: ModifiersPanel,
  schedules: SchedulesPanel,
};

export default function MenuManagementScreen() {
  return (
    <MenuScaleProvider>
      <MenuManagementScreenBody />
    </MenuScaleProvider>
  );
}

function MenuManagementScreenBody() {
  const s = useS();
  const actions = useMenuManagementActions();
  const { canWrite } = useMenuWriteGate();
  const activeTab = useMenuManagementUiStore((st) => st.activeTab);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const priceEditRef = useRef<PriceEditBottomSheetRef>(null);
  const snoozeSheetRef = useRef<SnoozeBottomSheetRef>(null);
  const outOfStockRef = useRef<OutOfStockSheetRef>(null);
  const [itemToDelete, setItemToDelete] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // The tab strip highlights `activeTab` on the tap itself; the panel swap
  // follows as a transition, so mounting a heavy panel (the item grid) is
  // interruptible and never holds the tap's frame. Nothing under this may
  // suspend: a transition that suspends already-visible content never commits.
  const [shownTab, setShownTab] = useState(activeTab);
  useEffect(() => {
    if (activeTab === shownTab) return;
    startTransition(() => setShownTab(activeTab));
  }, [activeTab, shownTab]);

  // Only the shown tab is mounted. Keeping visited tabs alive meant every
  // hidden panel still re-rendered on each store update (a sync tick
  // re-rendered all five) and held its lists and bitmaps in memory: the wrong
  // trade on a 3 GB tablet. Coming back to a tab stays cheap without it: the
  // derived data is cached across mounts (useMenuManagementData), selection and
  // search live in useMenuManagementUiStore, the items grid restores its scroll
  // offset, and decoded images stay in expo-image's memory cache until the
  // screen itself unmounts.
  const Panel = PANELS[shownTab];

  // Release decoded item-image bitmaps when leaving menu management. base64
  // images render as data: URIs with no disk cache, so their native bitmaps
  // stay pinned in the memory cache until cleared. Clearing only the MEMORY
  // cache is safe: anything still needed re-decodes on the next view.
  useEffect(() => {
    return () => {
      void ExpoImage.clearMemoryCache().catch(() => {});
    };
  }, []);

  const { triggerSync, isEntityEditable } = actions;

  const refresh = useCallback(async () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    try {
      await triggerSync();
    } finally {
      setIsRefreshing(false);
    }
  }, [isRefreshing, triggerSync]);

  const openSnooze = useCallback((target: SnoozeItem) => {
    snoozeSheetRef.current?.open(target);
  }, []);

  const openOutOfStock = useCallback(() => {
    outOfStockRef.current?.open();
  }, []);

  const openItem = useCallback(
    (item: MenuItemType, context?: ItemOpenContext) => {
      // Items this store owns open the full editor (which shows its own
      // offline state). Shared items can only take per-location price and
      // availability, through the price sheet.
      if (isEntityEditable(item.location_id)) {
        router.push(`/menu/edit-item?itemId=${item.id}`);
        return;
      }
      if (!canWrite) {
        toastService.show({
          title: "You're offline",
          message: MENU_OFFLINE_REASON,
          type: "warning",
        });
        return;
      }
      priceEditRef.current?.open(
        {
          id: item.id,
          name: item.name,
          currentPrice: item.price,
          currentCashPrice: item.cashPrice,
          currentAvailability: item.availability,
          snoozedUntil: item.snoozedUntil,
        },
        {
          categoryId: context?.categoryId ?? null,
          menuId: context?.menuId ?? null,
        },
      );
    },
    [isEntityEditable, canWrite],
  );

  const confirmDelete = useCallback(async () => {
    if (!itemToDelete) return;
    if (!canWrite) {
      toastService.show({
        title: "You're offline",
        message: MENU_OFFLINE_REASON,
        type: "warning",
      });
      setItemToDelete(null);
      return;
    }
    setIsDeleting(true);
    try {
      await actions.deleteItem(itemToDelete.id);
    } finally {
      setIsDeleting(false);
      setItemToDelete(null);
    }
  }, [itemToDelete, canWrite, actions]);

  const contextValue = useMemo<MenuManagementContextValue>(
    () => ({ actions, canWrite, openSnooze, openItem, openOutOfStock }),
    [actions, canWrite, openSnooze, openItem, openOutOfStock],
  );

  return (
    <MenuManagementContext.Provider value={contextValue}>
      <View
        style={{
          flex: 1,
          backgroundColor: colors.screen,
          paddingHorizontal: s(16),
          paddingTop: s(8),
          paddingBottom: s(16),
          gap: s(12),
        }}
      >
        <MenuManagementTabs
          onRefresh={refresh}
          isRefreshing={isRefreshing}
          onOpenOutOfStock={openOutOfStock}
          canWrite={canWrite}
        />

        {!canWrite && (
          <Notice tone="danger" icon={WifiOff}>
            {MENU_OFFLINE_REASON} You can still browse, and hide menus on this
            device.
          </Notice>
        )}

        <View key={shownTab} style={{ flex: 1 }}>
          <Panel />
        </View>
      </View>

      <PriceEditBottomSheet
        ref={priceEditRef}
        // The sheet writes the override itself; the next sync carries the
        // new price into the store.
        onSave={() => {}}
        onDelete={(itemId, itemName) =>
          setItemToDelete({ id: itemId, name: itemName })
        }
        onSnooze={openSnooze}
      />
      <SnoozeBottomSheet ref={snoozeSheetRef} />
      <OutOfStockSheet ref={outOfStockRef} />
      <ConfirmationModal
        isOpen={itemToDelete !== null}
        onClose={() => setItemToDelete(null)}
        onConfirm={confirmDelete}
        loading={isDeleting}
        title="Delete item"
        description={`Are you sure you want to delete "${itemToDelete?.name ?? ""}"?`}
        confirmText="Delete"
        variant="destructive"
      />
    </MenuManagementContext.Provider>
  );
}
