/**
 * Refund Fraud Guard Store
 *
 * Tracks self-refund events per employee within a sliding time window.
 * Detects velocity patterns (same cashier creating and refunding cash orders)
 * and escalates through alert → block thresholds.
 *
 * Thresholds are read from location config (Settings → Fraud Detection).
 * Persisted via MMKV so events survive app restarts within the window.
 */

import { createLazyPersistStorage } from "@/lib/storage";
import { useLocationConfigStore } from "@/stores/useLocationConfigStore";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { immer } from "zustand/middleware/immer";

// ============================================================================
// HELPERS — read live config
// ============================================================================

function getFraudConfig() {
  return useLocationConfigStore.getState().config.fraudDetection;
}

// ============================================================================
// TYPES
// ============================================================================

export interface SelfRefundEvent {
  employeeProfileId: string;
  orderId: string;
  amount: number;
  timestamp: number; // epoch ms
  approvedByManagerId?: string;
  approvedByManagerName?: string;
}

export interface VelocityResult {
  /** Count of self-refunds in the current window (before this one). */
  selfRefundCount: number;
  /** True when count >= alertThreshold. */
  shouldAlert: boolean;
  /** True when count >= blockThreshold. */
  shouldBlock: boolean;
}

interface RefundFraudGuardState {
  events: SelfRefundEvent[];

  checkVelocity: (employeeProfileId: string) => VelocityResult;
  recordSelfRefund: (event: Omit<SelfRefundEvent, "timestamp">) => void;
  getEventsForEmployee: (employeeProfileId: string) => SelfRefundEvent[];
  /** Whether the feature is enabled in location config. */
  isEnabled: () => boolean;
}

// ============================================================================
// HELPERS
// ============================================================================

function pruneStale(events: SelfRefundEvent[]): SelfRefundEvent[] {
  const windowMs = getFraudConfig().windowMinutes * 60_000;
  const cutoff = Date.now() - windowMs;
  return events.filter((e) => e.timestamp > cutoff);
}

// ============================================================================
// STORE
// ============================================================================

export const useRefundFraudGuardStore = create<RefundFraudGuardState>()(
  persist(
    immer((set, get) => ({
      events: [],

      isEnabled: (): boolean => {
        return getFraudConfig().refundToSelfEnabled;
      },

      checkVelocity: (employeeProfileId: string): VelocityResult => {
        const config = getFraudConfig();

        // Prune stale events first
        const pruned = pruneStale(get().events);
        if (pruned.length !== get().events.length) {
          set((state) => {
            state.events = pruned;
          });
        }

        const count = pruned.filter(
          (e) => e.employeeProfileId === employeeProfileId,
        ).length;

        return {
          selfRefundCount: count,
          shouldAlert: count >= config.alertThreshold,
          shouldBlock: count >= config.blockThreshold,
        };
      },

      recordSelfRefund: (event) => {
        set((state) => {
          // Prune stale before adding
          state.events = pruneStale(state.events);
          state.events.push({ ...event, timestamp: Date.now() });
        });
      },

      getEventsForEmployee: (employeeProfileId: string): SelfRefundEvent[] => {
        return pruneStale(get().events).filter(
          (e) => e.employeeProfileId === employeeProfileId,
        );
      },
    })),
    {
      name: "dexa-pos-refund-fraud-guard",
      storage: createLazyPersistStorage(),
      version: 1,
      migrate: (persistedState) => persistedState as any,
      partialize: (state) => ({
        events: state.events,
      }),
    },
  ),
);
