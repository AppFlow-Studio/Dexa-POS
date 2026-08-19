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

function buildDefaultConfig(
  merchantId: string,
  locationId: string,
): KioskConfig {
  return { id: "default", merchantId, locationId, ...DEFAULT_KIOSK_CONFIG };
}

interface KioskProfileState {
  /** Resolved, normalized config currently driving the kiosk UI. Null until loaded. */
  config: KioskConfig | null;
  /**
   * A newer config fetched by the poll while a customer was mid-session. Held
   * back so the kiosk never re-themes/re-templates under an active order; gets
   * committed to `config` the moment the kiosk returns to idle.
   */
  pendingConfig: KioskConfig | null;
  /** True when the kiosk is on the attract/idle screen (no active session). */
  isIdle: boolean;
  status: KioskLoadStatus;
  error: string | null;
  lastFetchedAt: number | null;

  /**
   * Apply a profile row resolved by useKioskProfile. Commits immediately when
   * idle; otherwise stashes as pending until the kiosk goes idle.
   */
  applyRow: (row: KioskProfileRow) => void;

  /** Build a default config for a location when no profile exists yet. */
  setDefaultFor: (merchantId: string, locationId: string) => void;

  /**
   * Toggle idle state. Transitioning into idle flushes any pending config so
   * the next customer sees the latest published settings.
   */
  setIdle: (idle: boolean) => void;

  setError: (message: string) => void;

  clear: () => void;
}

export const useKioskProfileStore = create<KioskProfileState>()(
  persist(
    (set, get) => ({
      config: null,
      pendingConfig: null,
      isIdle: true,
      status: "idle",
      error: null,
      lastFetchedAt: null,

      applyRow: (row) => {
        const next = normalizeKioskProfile(row);
        const { config, isIdle } = get();

        // No change → just refresh timestamps/status.
        if (config && configsEqual(config, next)) {
          set({
            status: "ready",
            error: null,
            pendingConfig: null,
            lastFetchedAt: Date.now(),
          });
          return;
        }

        if (isIdle || !config) {
          set({
            config: next,
            pendingConfig: null,
            status: "ready",
            error: null,
            lastFetchedAt: Date.now(),
          });
        } else {
          // Mid-session: hold the change back until idle.
          set({
            pendingConfig: next,
            status: "ready",
            error: null,
            lastFetchedAt: Date.now(),
          });
        }
      },

      setDefaultFor: (merchantId, locationId) => {
        const next = buildDefaultConfig(merchantId, locationId);
        const { config, isIdle } = get();
        if (isIdle || !config) {
          set({
            config: next,
            pendingConfig: null,
            status: "ready",
            error: null,
            lastFetchedAt: Date.now(),
          });
        } else {
          set({
            pendingConfig: next,
            status: "ready",
            error: null,
            lastFetchedAt: Date.now(),
          });
        }
      },

      setIdle: (idle) => {
        const { pendingConfig } = get();
        if (idle && pendingConfig) {
          // Flush the held-back config now that nobody is mid-order.
          set({ isIdle: true, config: pendingConfig, pendingConfig: null });
        } else {
          set({ isIdle: idle });
        }
      },

      setError: (message) => set({ status: "error", error: message }),

      clear: () =>
        set({
          config: null,
          pendingConfig: null,
          isIdle: true,
          status: "idle",
          error: null,
          lastFetchedAt: null,
        }),
    }),
    {
      name: "kiosk-profile-storage",
      storage: createLazyPersistStorage(),
      version: 1,
      // Persist the resolved config so the kiosk can boot instantly/offline.
      // pendingConfig and isIdle are transient session state.
      partialize: (state) => ({
        config: state.config,
        lastFetchedAt: state.lastFetchedAt,
      }),
    },
  ),
);

/** Shallow value compare of two configs (ignores nothing meaningful — all
 * fields are primitives or arrays of primitives). Avoids needless re-themes
 * when the poll returns an identical row. */
function configsEqual(a: KioskConfig, b: KioskConfig): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
