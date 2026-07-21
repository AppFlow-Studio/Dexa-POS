// stores/useLoyaltyStore.ts
// Minimal store that caches whether the merchant has active loyalty programs.
// TTL: 5 minutes — refreshed by CFDProvider on mount.
import { createLazyPersistStorage } from "@/lib/storage";
import { create } from "zustand";
import { persist } from "zustand/middleware";

interface LoyaltyStore {
  merchantHasLoyalty: boolean;
  checkedAt: number; // ms timestamp of last check
  setMerchantHasLoyalty: (val: boolean) => void;
}

export const useLoyaltyStore = create<LoyaltyStore>()(
  persist(
    (set) => ({
      merchantHasLoyalty: false,
      checkedAt: 0,
      setMerchantHasLoyalty: (val) =>
        set({ merchantHasLoyalty: val, checkedAt: Date.now() }),
    }),
    {
      name: "loyalty-store",
      storage: createLazyPersistStorage(),
      version: 1,
      migrate: (persistedState) => persistedState as any,
      partialize: (state) => ({
        merchantHasLoyalty: state.merchantHasLoyalty,
        checkedAt: state.checkedAt,
      }),
    },
  ),
);
