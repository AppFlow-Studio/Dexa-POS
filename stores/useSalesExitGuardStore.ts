import {
  countUnsentItems,
  getSalesExitDecision,
  type SalesExitDecision,
} from "@/lib/salesExitGuard";
import { toastService } from "@/lib/toastService";
import { create } from "zustand";
import { useDineInStore } from "./useDineInStore";
import { useEmployeeStore } from "./useEmployeeStore";
import { useModifierSidebarStore } from "./useModifierSidebarStore";
import { useOrderStore } from "./useOrderStore";
import { useStoreSettingsStore } from "./useStoreSettingsStore";

/**
 * Shared-till exit guard for the Sales screen (order-processing).
 *
 * With "Require PIN per order" on, every exit from Sales (header Back, the
 * Tables shortcut, Android back) hands the till to the next person: the active
 * order and its PIN attribution are dropped, so re-entering Sales starts a
 * fresh order behind the PIN gate. If the order has unsent items the user is
 * asked first (Send & Leave / Leave Order Open / Stay). Leaving never deletes
 * or voids an order — one with items stays open in Previous Orders.
 *
 * Not persisted: a pending exit only makes sense while the screen is up.
 */

/** Guard decision for the order currently on screen. */
export function getActiveSalesExitDecision(): SalesExitDecision {
  const { activeOrderId, ordersById, currentStation } =
    useOrderStore.getState();
  return getSalesExitDecision({
    requirePinPerOrder: useStoreSettingsStore.getState().requirePinPerOrder,
    isKiosk: currentStation?.station_type === "self_service",
    order: activeOrderId ? ordersById[activeOrderId] : null,
  });
}

/**
 * Detach the till from the current order, as if New Order had been tapped:
 * the next visit to Sales mounts with no active order, resumes/creates a
 * draft, and the PIN gate asks who is ringing it. An item still open in the
 * modifier sidebar is discarded first (it acts on the active order), so the
 * order left behind never carries a half-built draft item.
 */
export function resetForNextOrder() {
  useModifierSidebarStore.getState().cancelAndRemoveDraft();
  useEmployeeStore.getState().clearOrderAttributionStaff();
  useDineInStore.getState().clearSelectedTable();
  useOrderStore.getState().setActiveOrder(null);
}

interface SalesExitGuardState {
  /** The exit waiting on the unsent-items prompt; null while the prompt is closed. */
  pendingExit: (() => void) | null;
  /** Send & Leave is in flight. */
  isSending: boolean;
  /** Route an exit from Sales through the guard. `navigate` performs the actual exit. */
  requestSalesExit: (navigate: () => void) => void;
  /** Prompt: close it and stay on the order. */
  stay: () => void;
  /** Prompt: leave the order open with its items unsent. */
  leaveOrderOpen: () => void;
  /** Prompt: fire the unsent items to the kitchen, then leave. Stays on failure. */
  sendAndLeave: () => Promise<void>;
}

export const useSalesExitGuardStore = create<SalesExitGuardState>(
  (set, get) => ({
    pendingExit: null,
    isSending: false,

    requestSalesExit: (navigate) => {
      if (get().pendingExit) return;
      const decision = getActiveSalesExitDecision();
      if (decision === "navigate") {
        navigate();
        return;
      }
      if (decision === "prompt") {
        set({ pendingExit: navigate });
        return;
      }
      resetForNextOrder();
      navigate();
    },

    stay: () => {
      if (get().isSending) return;
      set({ pendingExit: null });
    },

    leaveOrderOpen: () => {
      const { pendingExit, isSending } = get();
      if (!pendingExit || isSending) return;
      set({ pendingExit: null });
      resetForNextOrder();
      pendingExit();
    },

    sendAndLeave: async () => {
      const { pendingExit, isSending } = get();
      const orderId = useOrderStore.getState().activeOrderId;
      if (!pendingExit || isSending || !orderId) return;
      set({ isSending: true });
      // The send fires every new item, drafts included — drop the one still
      // open in the modifier sidebar so a half-built item never reaches the
      // kitchen.
      useModifierSidebarStore.getState().cancelAndRemoveDraft();

      let sent = false;
      try {
        const result = await useOrderStore
          .getState()
          .sendNewItemsToKitchenForOrder(orderId);
        // "queued" counts: offline sends deliver when the connection returns.
        // Anything still unsent (read-only order, rejected writes) is a failure.
        sent =
          result.status !== "rejected" &&
          countUnsentItems(useOrderStore.getState().ordersById[orderId]) === 0;
      } catch (err) {
        console.error("[SalesExitGuard] Send & Leave failed:", err);
      }

      set({ pendingExit: null, isSending: false });
      if (!sent) {
        toastService.show({
          title: "Couldn't send to kitchen",
          message:
            "The items are still on this order. Try again, or choose Leave Order Open.",
          type: "error",
        });
        return;
      }
      resetForNextOrder();
      pendingExit();
    },
  }),
);
