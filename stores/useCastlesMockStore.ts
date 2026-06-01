/**
 * Castles Mock Store
 *
 * Runtime-controllable mock-mode toggle so QA / on-site debugging can flip
 * the Castles transport into a mock scenario on a live preview build
 * (e.g., a Landi preview tablet) without needing a fresh native build or
 * a Metro reload. The transport factory consults this store first; if
 * `enabled` is false (default) it falls back to env-var, then to real
 * TCP/USB transports.
 *
 * Persisted to MMKV so QA can leave a tablet on a specific scenario
 * across reloads, then explicitly disable when done.
 *
 * Safe in production:
 * - Default state is `enabled: false`, so a merchant who never opens the
 *   USB Diagnostics screen sees zero behavioral change.
 * - The store is read at every connect attempt, not cached, so flipping
 *   the toggle takes effect on the next sale immediately.
 */

import { createLazyPersistStorage } from '@/lib/storage';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { CastlesMockScenario } from '@/services/terminals/castles-transport-mock';

interface CastlesMockState {
  enabled: boolean;
  scenario: CastlesMockScenario;
  setEnabled: (enabled: boolean) => void;
  setScenario: (scenario: CastlesMockScenario) => void;
}

export const useCastlesMockStore = create<CastlesMockState>()(
  persist(
    (set) => ({
      enabled: false,
      scenario: 'healthy',
      setEnabled: (enabled) => set({ enabled }),
      setScenario: (scenario) => set({ scenario }),
    }),
    {
      name: 'castles-mock-store-v1',
      storage: createLazyPersistStorage(),
    }
  )
);
