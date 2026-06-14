import { createLazyPersistStorage } from "@/lib/storage";
import {
  DEFAULT_KIOSK_CONFIG,
  normalizeKioskProfile,
  type KioskConfig,
  type KioskProfileRow,
} from "@/types/kiosk";
import { create } from "zustand";
import { persist } from "zustand/middleware";

type KioskLoadStatus = "idle" | "ready" | "error";

interface KioskProfileState {
  /** Resolved, normalized config currently driving the kiosk. Null until loaded. */
  config: KioskConfig | null;
  status: KioskLoadStatus;
  error: string | null;
  lastFetchedAt: number | null;

  /**
   * Apply a profile row resolved by useKioskProfile. The hook's query owns
   * *which* row to apply (station link → location active), so this trusts the
   * row it's given.
   */
  applyRow: (row: KioskProfileRow) => void;

  /** Build a default config for a location when no profile exists yet. */
  setDefaultFor: (merchantId: string, locationId: string) => void;

  setError: (message: string) => void;

  clear: () => void;
}

export const useKioskProfileStore = create<KioskProfileState>()(
  persist(
    (set) => ({
      config: null,
      status: "idle",
      error: null,
      lastFetchedAt: null,

      applyRow: (row) => {
        set({
          config: normalizeKioskProfile(row),
          status: "ready",
          error: null,
          lastFetchedAt: Date.now(),
        });
      },

      setDefaultFor: (merchantId, locationId) => {
        set({
          config: {
            id: "default",
            merchantId,
            locationId,
            ...DEFAULT_KIOSK_CONFIG,
          },
          status: "ready",
          error: null,
          lastFetchedAt: Date.now(),
        });
      },

      setError: (message) => set({ status: "error", error: message }),

      clear: () =>
        set({
          config: null,
          status: "idle",
          error: null,
          lastFetchedAt: null,
        }),
    }),
    {
      name: "kiosk-profile-storage",
      storage: createLazyPersistStorage(),
      version: 1,
      // Persist the resolved config so the kiosk can boot offline / instantly;
      // transient load state is recomputed on next fetch.
      partialize: (state) => ({
        config: state.config,
        lastFetchedAt: state.lastFetchedAt,
      }),
    },
  ),
);
