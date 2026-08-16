import { registerResumeTask } from "@/lib/lifecycle/appLifecycleCoordinator";
import { isAutoSettleEnabled } from "@/lib/network/featureFlags";
import {
  tickAutoSettlement,
  type AutoSettleConfig,
  type AutoSettleProbes,
} from "@/services/autoSettlementScheduler";
import { getRawIsOnline } from "@/services/offlineSyncService";
import { getSharedCastlesService } from "@/services/terminals/castles-service";
import { usePaymentStore } from "@/stores/usePaymentStore";
import { useStoreSettingsStore } from "@/stores/useStoreSettingsStore";
import { CASTLES_DEFAULT_PORT } from "@/types/castles";
import type { SupabaseClient } from "@supabase/supabase-js";
import { useEffect } from "react";

const AUTO_SETTLE_POLL_INTERVAL_MS = 60_000;

/**
 * Runtime probes — read live singletons/stores (never a closure) so the pure
 * decision core stays testable and the kill switch is a sub-minute abort.
 */
const probes: AutoSettleProbes = {
  isOnline: () => getRawIsOnline(),
  isTerminalBusy: () => {
    try {
      return getSharedCastlesService().isLocked();
    } catch {
      return false;
    }
  },
  isSaleActive: () => {
    const s = usePaymentStore.getState();
    return s.isTransactionProcessing || s.lockedOrderId != null;
  },
  // Fleet-wide client kill switch, re-read every tick — flipping it OFF stops
  // firing within one poll interval without a re-render or DB write.
  killSwitchOn: () => isAutoSettleEnabled(),
};

/**
 * Unattended daily Castles batch-out. Mirrors useBusinessDayRollover: a mount
 * seed (boot catch-up), a `frame`-bucket resume task (overnight foreground
 * catch-up), and a 60s interval backstop for tablets that never background.
 *
 * The tick early-outs purely (no DB/terminal I/O) unless a fire is actually due,
 * so the 60s cadence is cheap. All firing/skip logic + safety gates live in
 * services/autoSettlementScheduler.ts. Wire the `enabled` gate to a Castles
 * terminal this station owns with server `auto_settle` on (see PosSyncProvider).
 */
export function useAutoSettlementScheduler(params: {
  enabled: boolean;
  supabase: SupabaseClient | null;
}) {
  const { enabled, supabase } = params;

  useEffect(() => {
    if (!enabled || !supabase) return;

    const runTick = () => {
      // Read live (not closure) so a station switch / config edit is picked up
      // and ownership is re-checked at fire time.
      const store = useStoreSettingsStore.getState();
      const selectedStore = store.selectedStore;
      const terminal = store.selectedStation?.payment_terminal;
      if (
        !selectedStore?.id ||
        !selectedStore.merchant_id ||
        !selectedStore.timezone
      )
        return;
      if (!terminal?.id || terminal.terminal_type !== "castles") return;
      if (!(terminal.auto_settle ?? false)) return;

      const isUsb = terminal.connection_type === "usb";
      const cfg: AutoSettleConfig = {
        terminalId: terminal.id,
        merchantId: selectedStore.merchant_id,
        locationId: selectedStore.id,
        timezone: selectedStore.timezone,
        autoSettle: terminal.auto_settle ?? false,
        settleTime: terminal.settle_time ?? null,
        terminalType: terminal.terminal_type,
        terminalHost: isUsb ? undefined : terminal.ip_address,
        terminalPort: terminal.port ?? CASTLES_DEFAULT_PORT,
        connectionType: isUsb ? "usb" : "local_socket",
        epi: terminal.epi,
        cancelPort: terminal.cancel_port,
      };
      void tickAutoSettlement({ supabase, cfg, probes });
    };

    // Seed on mount → catch-up fires on boot if a prior day was missed.
    runTick();

    const unregisterResume = registerResumeTask({
      id: "settlement.auto-batch",
      bucket: "frame",
      requiresNetwork: true,
      run: runTick,
    });
    const interval = setInterval(runTick, AUTO_SETTLE_POLL_INTERVAL_MS);

    return () => {
      unregisterResume();
      clearInterval(interval);
    };
  }, [enabled, supabase]);
}
