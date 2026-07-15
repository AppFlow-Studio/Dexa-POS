/**
 * Valor Mock Store
 *
 * Runtime-controllable mock-mode toggle so QA / on-site debugging can flip the
 * Valor transport into a scripted scenario on a live preview build without a
 * fresh native build or Metro reload. The transport factory consults this
 * store first; if `enabled` is false (default) it falls back to the env var,
 * then to the real TCP/USB transports.
 *
 * Safe in production: default `enabled: false`, read at every connect attempt
 * (not cached), so a merchant who never opens Diagnostics sees zero change.
 * Mirrors useCastlesMockStore.
 */

import { createLazyPersistStorage } from "@/lib/storage";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { ValorMockScenario } from "@/services/terminals/valor-transport-mock";

interface ValorMockState {
  enabled: boolean;
  scenario: ValorMockScenario;
  setEnabled: (enabled: boolean) => void;
  setScenario: (scenario: ValorMockScenario) => void;
}

export const useValorMockStore = create<ValorMockState>()(
  persist(
    (set) => ({
      enabled: false,
      scenario: "healthy",
      setEnabled: (enabled) => set({ enabled }),
      setScenario: (scenario) => set({ scenario }),
    }),
    {
      name: "valor-mock-store-v1",
      storage: createLazyPersistStorage(),
    },
  ),
);
