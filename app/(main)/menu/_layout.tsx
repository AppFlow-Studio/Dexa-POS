import { usePosSync } from "@/hooks/pos/usePosSync";
import { useStandaloneSync } from "@/hooks/pos/useStandaloneSync";
import { applyRecipes } from "@/stores/applyRecipes";
import {
  fingerprintLibrary,
  menuLibraryCache,
} from "@/stores/menuLibraryCache";
import { useMenuManagementSearchStore } from "@/stores/useMenuManagementSearchStore";
import { useMenuStore } from "@/stores/useMenuStore";
import { useStoreSettingsStore } from "@/stores/useStoreSettingsStore";
import { Slot } from "expo-router";
import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { View } from "react-native";
import MenuSidebar from "../../../components/menu/MenuSidebar";

// Sidebar Tab Types
type SidebarTab = "menus" | "categories" | "items" | "modifiers" | "schedules";

interface MenuLayoutContextType {
  activeTab: SidebarTab;
  setActiveTab: (tab: SidebarTab) => void;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
}

const MenuLayoutContext = createContext<MenuLayoutContextType | undefined>(
  undefined
);

export const useMenuLayout = () => {
  const context = useContext(MenuLayoutContext);
  if (!context) {
    throw new Error("useMenuLayout must be used within a MenuLayout");
  }
  return context;
};

export default function MenuLayout() {
  const [activeTab, setActiveTab] = useState<SidebarTab>("menus");
  const { setActiveTab: setStoreActiveTab } = useMenuManagementSearchStore();
  const selectedStore = useStoreSettingsStore((s) => s.selectedStore);
  const merchantId = selectedStore?.merchant_id ?? null;
  const locationId = selectedStore?.id ?? null;

  // Library/inactive entities are only needed by menu management, so they load
  // here rather than on the POS boot path (six requests the order-entry screen
  // never reads). Mirrors the lazy inventory load in inventory/_layout.tsx.
  const { data: standaloneData } = useStandaloneSync(merchantId, locationId);

  // Read-only observer of the boot sync: `staleTime: Infinity` means mounting
  // this never triggers a refetch, it just hands us the live payload.
  const { data: posSyncData } = usePosSync(locationId);

  // What is currently merged into the menu store. Tracks BOTH the library
  // fingerprint and the pos_sync payload identity, because `setMenuData`
  // rebuilds the collections from the menu tree and drops the library — after
  // that the library has to go back in even if it hasn't changed.
  const appliedRef = useRef<{
    fingerprint: string;
    posSync: unknown;
  } | null>(null);

  // 1. Paint from disk. Synchronous MMKV read, so the management screens have
  //    their full item list on the first frame instead of waiting on the
  //    network — which is what made the header count climb as the payload
  //    trickled in, and what made the whole section unusable offline.
  useEffect(() => {
    if (!merchantId || !locationId) return;
    if (appliedRef.current) return; // live data already applied — don't regress it

    const cached = menuLibraryCache.get(merchantId, locationId);
    if (!cached) return;

    useMenuStore.getState().mergeStandaloneData(cached.data);
    applyRecipes(posSyncData);
    appliedRef.current = {
      fingerprint: cached.fingerprint,
      posSync: posSyncData,
    };
    console.log("[MenuLayout] library hydrated from cache", {
      items: cached.data.items?.length ?? 0,
      categories: cached.data.categories?.length ?? 0,
    });
    // posSyncData intentionally omitted: this is a one-shot cold-paint, and
    // effect 2 owns every subsequent reconcile.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [merchantId, locationId]);

  // 2. Reconcile against the network. Skips the rebuild outright when the
  //    payload is byte-identical to what's already applied — re-running
  //    mergeStandaloneData over an unchanged library rebuilds every collection
  //    in the menu store and re-renders the entire screen for nothing.
  useEffect(() => {
    if (!standaloneData || !merchantId || !locationId) return;

    const fingerprint = fingerprintLibrary(standaloneData);
    const prev = appliedRef.current;
    const menuTreeRebuilt = prev ? prev.posSync !== posSyncData : true;

    if (prev && prev.fingerprint === fingerprint && !menuTreeRebuilt) {
      return;
    }

    useMenuStore.getState().mergeStandaloneData(standaloneData);
    // mergeStandaloneData rebuilds the item collections, so recipes attached by
    // the boot sync have to be re-applied on top.
    applyRecipes(posSyncData);
    appliedRef.current = { fingerprint, posSync: posSyncData };

    menuLibraryCache.set(merchantId, locationId, standaloneData, fingerprint);
  }, [standaloneData, posSyncData, merchantId, locationId]);

  const handleTabChange = (tab: SidebarTab) => {
    setActiveTab(tab);
    setStoreActiveTab(tab);
  };

  return (
    <MenuLayoutContext.Provider
      value={{
        activeTab,
        setActiveTab,
        searchQuery: "",
        setSearchQuery: () => {},
      }}
    >
      <View className="flex-1 bg-panel">
        <View className="flex-row h-full">
          <MenuSidebar activeTab={activeTab} onTabChange={handleTabChange} />
          <View className="flex-1">
            <Slot />
          </View>
        </View>
      </View>
    </MenuLayoutContext.Provider>
  );
}
