import { registerResumeTask } from "@/lib/lifecycle/appLifecycleCoordinator";
import {
  isAutoSettleSupportedType,
  tickAutoSettlement,
  type AutoSettleConfig,
  type AutoSettleProbes,
} from "@/services/autoSettlementScheduler";
import { getRawIsOnline } from "@/services/offlineSyncService";
import { getSharedCastlesService } from "@/services/terminals/castles-service";
import { getSharedCodePayService } from "@/services/terminals/codepay-service";
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
  // Busy = the ACTIVE station terminal's command mutex is held. Read the live
  // terminal type so the probe follows a station/terminal switch and picks the
  // matching service (CodePay Intent mutex vs Castles LAN/USB mutex).
  isTerminalBusy: () => {
    try {
      const type =
        useStoreSettingsStore.getState().selectedStation?.payment_terminal
          ?.terminal_type;
      return type === "codepay"
        ? getSharedCodePayService().isLocked()
        : getSharedCastlesService().isLocked();
    } catch {
      return false;
    }
  },
  isSaleActive: () => {
    const s = usePaymentStore.getState();
    return s.isTransactionProcessing || s.lockedOrderId != null;
  },
};

/**
 * Unattended daily batch-out for the station's Castles or CodePay terminal.
 * Mirrors useBusinessDayRollover: a mount seed (boot catch-up), a `frame`-bucket
 * resume task (overnight foreground catch-up), and a 60s interval backstop for
 * tablets that never background.
 *
 * The tick early-outs purely (no DB/terminal I/O) unless a fire is actually due,
 * so the 60s cadence is cheap. All firing/skip logic + safety gates live in
 * services/autoSettlementScheduler.ts. Wire the `enabled` gate to a supported
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
      if (!terminal?.id || !isAutoSettleSupportedType(terminal.terminal_type))
        return;
      if (!(terminal.auto_settle ?? false)) return;

      const isCodepay = terminal.terminal_type === "codepay";
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
        // CodePay settles via an on-terminal Intent — no host/port; it needs the
        // merchant app_id (stored on register_id / app_id) as the Intent extra.
        appId: isCodepay
          ? terminal.app_id ?? terminal.register_id ?? undefined
          : undefined,
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
