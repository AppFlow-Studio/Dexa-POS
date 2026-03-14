import { useLoading } from "@/contexts/LoadingContext";
import { useToast } from "@/contexts/ToastContext";
import { isLocalOnlyStatus } from "@/lib/tableStateMachine";
import { OrderProfile } from "@/lib/types";
import { useFloorPlanStore } from "@/stores/useFloorPlanStore";
import { useOrderStore } from "@/stores/useOrderStore";
import { usePaymentStore } from "@/stores/usePaymentStore";
import { useStoreSettingsStore } from "@/stores/useStoreSettingsStore";
import { useTableSessionStore } from "@/stores/useTableSessionStore";
import { TableStatus } from "@/types/db-floor-plan-types";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";

export type SessionPhase =
  | "initializing" // Waiting for data
  | "loading_session" // Syncing order from DB
  | "creating_session" // Auto-creating for available table
  | "ready" // Session + order available
  | "payment_syncing" // Payment sheet closed, syncing
  | "navigating_away"; // Suppress all side-effects

interface UseTableSessionResult {
  phase: SessionPhase;
  orderId: string | undefined;
  activeOrder: OrderProfile | undefined;
  tableStatus: TableStatus;
  isReady: boolean;
  markNavigatingAway: () => void;
  markPaymentSyncing: () => void;
  markPaymentSyncDone: () => void;
}

/** Read phase ref without TS narrowing */
function getPhase(ref: React.MutableRefObject<SessionPhase>): SessionPhase {
  return ref.current;
}

export function useTableSession(
  tableId: string,
  source?: string,
): UseTableSessionResult {
  const router = useRouter();
  const { show } = useToast();
  const { showLoading, hideLoading } = useLoading();

  const [phase, setPhase] = useState<SessionPhase>(() => {
    const t = useFloorPlanStore.getState().getTableById(tableId);
    if (!t) return "initializing";

    const session = useTableSessionStore.getState().sessions[tableId];

    // No session → available table, auto-create will run, start ready
    if (!session || session.status === "available") return "ready";

    // Session has an order — check if we already have it locally
    if (session.order_id) {
      const orderState = useOrderStore.getState();
      const found = orderState.getOrder(session.order_id);
      if (found) return "ready"; // order in store, render immediately
    }

    // Session exists but order not yet loaded
    return "initializing";
  });
  const phaseRef = useRef<SessionPhase>(phase);
  const hasAutoCreatedRef = useRef(false);
  const lastSetOrderIdRef = useRef<string | null>(null);

  const updatePhase = useCallback((newPhase: SessionPhase) => {
    phaseRef.current = newPhase;
    setPhase(newPhase);
  }, []);

  // Store selectors
  const getTableById = useFloorPlanStore((s) => s.getTableById);
  const table = getTableById(tableId);
  const session = useTableSessionStore((s) => s.sessions[tableId]);
  const tableStatus = (session?.status || "available") as TableStatus;
  const sessionOrderId = session?.order_id;

  const setActiveOrder = useOrderStore((s) => s.setActiveOrder);
  const syncOrderFromDatabase = useOrderStore((s) => s.syncOrderFromDatabase);
  const activeOrderId = useOrderStore((s) => s.activeOrderId);

  const setActiveTableId = usePaymentStore((s) => s.setActiveTableId);
  const clearActiveTableId = usePaymentStore((s) => s.clearActiveTableId);

  // Reactive order subscription
  const activeOrder = useOrderStore((state) => {
    if (sessionOrderId) {
      return state.getOrder(sessionOrderId);
    }
    if (state.activeOrderId) {
      return state.ordersById[state.activeOrderId];
    }
    return undefined;
  });

  // Set active table ID for payment store
  useEffect(() => {
    if (tableId) {
      setActiveTableId(tableId);
    }
    return () => {
      clearActiveTableId();
    };
  }, [tableId]);

  // Set active order when we have one (no cleanup on re-run)
  useEffect(() => {
    if (activeOrder?.id && activeOrder.id !== lastSetOrderIdRef.current) {
      lastSetOrderIdRef.current = activeOrder.id;
      setActiveOrder(activeOrder.id);
    }
  }, [activeOrder?.id, setActiveOrder]);

  // Clear active order only on unmount / table change
  useEffect(() => {
    return () => {
      lastSetOrderIdRef.current = null;
      setActiveOrder(null);
    };
  }, [tableId, setActiveOrder]);

  // Navigation guard: table cleaned remotely
  useEffect(() => {
    if (tableStatus === "cleaning") {
      updatePhase("navigating_away");
      router.replace("/tables");
      return;
    }
    if (
      tableStatus === "available" &&
      hasAutoCreatedRef.current &&
      !session
    ) {
      console.log("[useTableSession] Table cleared, navigating away");
      updatePhase("navigating_away");
      router.replace("/tables");
    }
  }, [tableStatus, session]);

  // Mark initialization complete when data is ready
  useEffect(() => {
    if (
      getPhase(phaseRef) === "initializing" &&
      table &&
      (activeOrder || tableStatus === "available")
    ) {
      updatePhase("ready");
    }
  }, [table, activeOrder, tableStatus]);

  // --- Auto-Session & Order Sync Logic ---
  useEffect(() => {
    const currentPhase = getPhase(phaseRef);
    if (currentPhase === "navigating_away") return;
    if (
      currentPhase === "payment_syncing" ||
      currentPhase === "loading_session" ||
      currentPhase === "creating_session"
    )
      return;

    const handleAutoCreateSession = async () => {
      try {
        // Skip if already ready with a valid order for this table
        if (getPhase(phaseRef) === "ready") {
          const orderState = useOrderStore.getState();
          const currentOid = orderState.activeOrderId;
          if (currentOid) {
            const currentOrd = orderState.ordersById[currentOid];
            if (currentOrd?.service_location_id === tableId) {
              return; // Already have the right order — don't re-enter loading states
            }
          }
        }

        // Check session store for existing session
        const currentSession =
          useTableSessionStore.getState().getSession(tableId);
        const hasExistingSession =
          currentSession?.status &&
          currentSession.status !== "available";

        if (!hasExistingSession) {
          // Check if caller already created an order for this table (seatGuests in-flight)
          const activeOid = useOrderStore.getState().activeOrderId;
          const activeOrd = activeOid ? useOrderStore.getState().ordersById[activeOid] : undefined;
          if (activeOrd && activeOrd.service_location_id === tableId) {
            hasAutoCreatedRef.current = true;
            updatePhase("ready");
            return;
          }

          // Only fetch from DB when there's truly no local session at all (cold open / stale cache).
          // Skip when navigating from the floor plan — session is already in the store.
          const freshSession = useTableSessionStore.getState().getSession(tableId);
          if (!freshSession) {
            await useFloorPlanStore.getState().loadFloorPlanStatusIfStale(1000);
          }
        }

        // Re-fetch after potential status update
        const updatedSession =
          useTableSessionStore.getState().getSession(tableId);
        const updatedTableStatus =
          updatedSession?.status || "available";

        console.log("[useTableSession] Auto-session check:", {
          tableId,
          status: updatedTableStatus,
          sessionId: updatedSession?.id,
          sessionOrderId: updatedSession?.order_id,
        });

        if (!tableId) return;

        // Case 1: Session exists with an order
        if (updatedSession?.order_id) {
          const sOrderId = updatedSession.order_id;

          // Skip if already matched by db_order_id
          if (activeOrder?.db_order_id === sOrderId) return;

          // Skip if getOrder resolves to the already-active order
          // (handles local ID → DB UUID transition where the underlying order is the same)
          const orderState = useOrderStore.getState();
          const resolved = orderState.getOrder(sOrderId);
          if (resolved && resolved.id === orderState.activeOrderId) return;

          // Guard: If active order belongs to this table but hasn't received
          // its db_order_id yet, hydrateOrderFromSeat is still in-flight —
          // skip sync to prevent creating a duplicate order
          const activeOid = orderState.activeOrderId;
          const activeOrd = activeOid ? orderState.ordersById[activeOid] : undefined;
          if (activeOrd?.service_location_id === tableId && !activeOrd?.db_order_id) {
            return;
          }

          const foundOrder = resolved;

          if (foundOrder) {
            if (activeOrderId !== foundOrder.id) {
              setActiveOrder(foundOrder.id);
            }
            updatePhase("ready");
          } else {
            if (
              getPhase(phaseRef) === "navigating_away" ||
              updatedTableStatus === "cleaning" ||
              updatedTableStatus === "available"
            )
              return;

            // Before blocking on a DB fetch, check if the background sync
            // (started from the long-press handler) already loaded the order.
            const alreadyInStore = useOrderStore.getState().getOrder(sOrderId);
            if (alreadyInStore) {
              setActiveOrder(alreadyInStore.id);
              updatePhase("ready");
              return;
            }

            updatePhase("loading_session");
            console.log(
              "[useTableSession] Syncing order from database:",
              sOrderId,
            );

            try {
              const localOrderId = await syncOrderFromDatabase(sOrderId);
              if (getPhase(phaseRef) === "navigating_away") return;

              if (localOrderId) {
                setActiveOrder(localOrderId);
                updatePhase("ready");
              }
            } catch (error) {
              console.error(
                "[useTableSession] Failed to sync order:",
                error,
              );
              show({
                title: "Error Loading Order",
                message:
                  "Failed to restore table session. Please try again.",
                type: "error",
              });
              updatePhase("ready");
            }
          }
          return;
        }

        // Case 2: No Session - Auto-create only once
        if (
          !updatedSession &&
          updatedTableStatus === "available" &&
          !hasAutoCreatedRef.current
        ) {
          hasAutoCreatedRef.current = true;

          if (getPhase(phaseRef) === "navigating_away") return;

          updatePhase("creating_session");
          showLoading("Creating session...");

          try {
            // O(1): Check if the active order is already for this table
            const orderState2 = useOrderStore.getState();
            const activeOid2 = orderState2.activeOrderId;
            const activeOrd2 = activeOid2 ? orderState2.ordersById[activeOid2] : undefined;
            const existingLocalOrder = activeOrd2?.service_location_id === tableId ? activeOrd2 : undefined;
            const partySize = existingLocalOrder?.guest_count || 1;

            const { sessionId, orderId } = await useTableSessionStore
              .getState()
              .seatGuests({
                tableIds: [tableId],
                partySize,
                createOrder: true,
              });

            console.log(
              "[useTableSession] Created session:",
              sessionId,
              "Order:",
              orderId,
            );

            if (orderId && getPhase(phaseRef) !== "navigating_away") {
              const orderExists =
                useOrderStore.getState().ordersById[orderId];

              if (!orderExists) {
                try {
                  await syncOrderFromDatabase(orderId);
                } catch (syncError) {
                  console.error(
                    "[useTableSession] Failed to sync new order:",
                    syncError,
                  );
                  const locationId =
                    useStoreSettingsStore.getState().selectedStore?.id;
                  if (locationId) {
                    await useOrderStore
                      .getState()
                      .initializeOrders(locationId);
                  }
                }
              }

              setActiveOrder(orderId);
            } else if (
              !orderId &&
              getPhase(phaseRef) !== "navigating_away"
            ) {
              setActiveOrder(null);
            }

            updatePhase("ready");
          } catch (err) {
            console.error("[useTableSession] Failed to auto-seat:", err);
            updatePhase("ready");
          } finally {
            hideLoading();
          }
        }
      } catch (err) {
        console.error("[useTableSession] Unexpected error:", err);
      }
    };

    handleAutoCreateSession();
  }, [tableId, tableStatus, session?.order_id]);

  // Recovery: re-sync if order vanishes while phase is "ready"
  useEffect(() => {
    if (
      phase === "ready" &&
      sessionOrderId &&
      !activeOrder &&
      getPhase(phaseRef) !== "navigating_away"
    ) {
      const timer = setTimeout(async () => {
        if (getPhase(phaseRef) !== "ready" || !sessionOrderId) return;

        // Double-check the order is truly missing (not just a render lag)
        const found = useOrderStore.getState().getOrder(sessionOrderId);
        if (found) {
          setActiveOrder(found.id);
          return;
        }

        updatePhase("loading_session");
        try {
          const localId = await syncOrderFromDatabase(sessionOrderId);
          if (localId && getPhase(phaseRef) !== "navigating_away") {
            setActiveOrder(localId);
          }
        } catch (e) {
          console.error("[useTableSession] Recovery sync failed:", e);
        }
        updatePhase("ready");
      }, 300);

      return () => clearTimeout(timer);
    }
  }, [phase, sessionOrderId, activeOrder?.id]);

  // Phase transition callbacks
  const markNavigatingAway = useCallback(() => {
    updatePhase("navigating_away");
  }, []);

  const markPaymentSyncing = useCallback(() => {
    updatePhase("payment_syncing");
    // Transition table to local-only "paying" status via dispatchAction
    const currentSession = useTableSessionStore.getState().getSession(tableId);
    if (currentSession && !isLocalOnlyStatus(currentSession.status)) {
      useTableSessionStore.getState().dispatchAction({
        type: "BEGIN_PAYING",
        tableId,
      });
    }
  }, [tableId]);

  const markPaymentSyncDone = useCallback(() => {
    updatePhase("ready");
    const currentSession = useTableSessionStore.getState().getSession(tableId);
    if (!currentSession) return;

    const currentOrder = useOrderStore.getState().getOrder(
      currentSession.order_id || "",
    );

    if (currentOrder?.paid_status === "Paid") {
      // Dispatch FULL_PAYMENT regardless of current status — a realtime update
      // may have already overwritten "paying" back to "check_presented".
      // The state machine validates the transition internally.
      useTableSessionStore.getState().dispatchAction({
        type: "FULL_PAYMENT",
        tableId,
      });
    } else if (currentSession.status === "paying") {
      // Not fully paid — revert local-only "paying" back to check_presented
      useTableSessionStore.getState().dispatchAction({
        type: "CANCEL_INTERMEDIATE",
        tableId,
      });
    }
  }, [tableId]);

  return {
    phase,
    orderId: activeOrder?.id,
    activeOrder,
    tableStatus,
    isReady: phase === "ready",
    markNavigatingAway,
    markPaymentSyncing,
    markPaymentSyncDone,
  };
}
