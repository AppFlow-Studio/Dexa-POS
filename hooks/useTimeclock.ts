import { useSupabaseClient } from "@/hooks/useSupabaseClient";
import { toastService } from "@/lib/toastService";
import { useEmployeeStore } from "@/stores/useEmployeeStore";
import { useTimeclockStore } from "@/stores/useTimeclockStore";
import { TimeClockAction, TimeClockActionType } from "@/types/time-clock";
import NetInfo from "@react-native-community/netinfo";
import { useCallback, useEffect } from "react";
import { v4 as uuidv4 } from "uuid";

export interface UseTimeClockOptions {
  onSuccess?: (type: TimeClockActionType, employeeName?: string) => void;
  onError?: (type: TimeClockActionType, error: string) => void;
}

export const useTimeClock = (options?: UseTimeClockOptions) => {
  const store = useTimeclockStore();
  const supabase = useSupabaseClient();

  // 1. The Core Action Handler
  const performAction = useCallback(
    async (
      type: TimeClockActionType,
      pinCode: string,
      locationId: string,
      deviceId: string
    ) => {
      console.log("[useTimeClock] performAction called:", {
        type,
        locationId,
        deviceId,
      });
      const previousStatus = store.status;

      // A. Create the payload
      const actionPayload: TimeClockAction = {
        id: uuidv4(),
        type,
        pinCode,
        locationId,
        timestamp: new Date().toISOString(),
        deviceId,
      };

      // B. Optimistic Update (Immediate Feedback)
      let nextStatus = store.status;
      switch (type) {
        case "sign_in":
          nextStatus = "active";
          break;
        case "clock_in":
          nextStatus = "active";
          break;
        case "clock_out":
          nextStatus = "idle";
          break;
        case "break_start":
          nextStatus = "on_break";
          break;
        case "break_end":
          nextStatus = "active";
          break;
      }
      store.setStatus(nextStatus);
      console.log("[useTimeClock] Optimistic update, status:", nextStatus);

      // C. Network Check & Execution
      const netState = await NetInfo.fetch();
      console.log("[useTimeClock] Network:", {
        connected: netState.isConnected,
        reachable: netState.isInternetReachable,
      });

      if (netState.isConnected && netState.isInternetReachable) {
        try {
          // --- ONLINE PATH ---
          console.log("[useTimeClock] Calling RPC...", {
            type,
            locationId,
            deviceId,
            pinLength: pinCode?.length,
            pinFirstChar: pinCode?.charAt(0),
          });
          const { data, error } = await supabase.rpc("handle_time_clock", {
            p_pin_code: pinCode,
            p_location_id: locationId,
            p_action_type: type,
            p_device_id: deviceId,
          });
          console.log("[useTimeClock] RPC response:", { data, error });

          if (error) throw error;

          // Update real ID from server response if clocking in
          if (type === "clock_in" || (type === "sign_in" && data?.shift_id)) {
            store.setStatus(nextStatus, data.shift_id);

            // For sign_in, fetch the real clock_in_time from the shift
            if (type === "sign_in" && data.shift_id && data.staff_id) {
              (async () => {
                try {
                  const { data: shiftData } = await supabase
                    .from("staff_shifts")
                    .select("clock_in_time")
                    .eq("id", data.shift_id)
                    .single();
                  if (shiftData?.clock_in_time) {
                    const empId = useEmployeeStore.getState().employees.find(
                      e => e.profileId === data.staff_id
                    )?.id;
                    if (empId) {
                      useTimeclockStore.setState((state: any) => {
                        if (state.sessions[empId]) {
                          state.sessions[empId].clockInTime = new Date(shiftData.clock_in_time);
                        }
                      });
                    }
                  }
                } catch {} // Non-critical, best-effort
              })();
            }
          }

          // Store employee info from backend response
          if (data?.staff_id) {
            store.setEmployee(data.staff_id, data?.employee_name || null);
          }

          // Track break start time
          if (type === "break_start") {
            store.setBreakStartTime(new Date().toISOString());
          } else if (type === "break_end") {
            store.setBreakStartTime(null);
          } else if (type === "sign_in") {
            // New employee signing in — clear any stale break time from previous employee
            store.setBreakStartTime(null);
          } else if (type === "clock_out") {
            // Clear all state on clock out
            store.clearState();
          }

          // Update employee store to keep local state in sync
          if (data?.staff_id) {
            const employeeStore = useEmployeeStore.getState();
            if (type === "clock_in") {
              employeeStore.clockIn(data.staff_id);
            } else if (type === "clock_out") {
              employeeStore.clockOut(data.staff_id);
            }
          }

          // Show success toast and call success callback
          const employeeName = data?.employee_name;
          const successMessages: Record<
            TimeClockActionType,
            { title: string; message: string }
          > = {
            sign_in: {
              title: "Sign In Successful",
              message: employeeName
                ? `Welcome, ${employeeName}!`
                : "You have been signed in successfully.",
            },
            clock_in: {
              title: "Clock In Successful",
              message: employeeName
                ? `Welcome, ${employeeName}!`
                : "You have been clocked in successfully.",
            },
            clock_out: {
              title: "Clock Out Successful",
              message: employeeName
                ? `Goodbye, ${employeeName}!`
                : "You have been clocked out successfully.",
            },
            break_start: {
              title: "Break Started",
              message: "Your break has started. Enjoy your rest!",
            },
            break_end: {
              title: "Break Ended",
              message: "Welcome back! Your break has ended.",
            },
            declare_cash_tips: {
              title: "Tips Declared",
              message: "Cash tips have been recorded.",
            },
          };

          toastService.show({
            ...successMessages[type],
            type: "success",
          });

          options?.onSuccess?.(type, employeeName);

          // Return data for actions that need it
          return { success: true, ...data };
        } catch (error: any) {
          // Revert optimistic update on hard failure
          store.setStatus(previousStatus);

          const errorMessage = error.message || "Failed to update time clock";
          const isNetworkError =
            errorMessage?.includes("network") ||
            errorMessage?.includes("fetch") ||
            errorMessage?.includes("timeout") ||
            !error.code; // Supabase errors usually have codes

          if (isNetworkError) {
            // Network error: queue for later sync
            store.queueAction(actionPayload);
            toastService.show({
              title: "Offline Mode",
              message:
                "Your action will be synced when connection is restored.",
              type: "warning",
            });
            // Return queued status so caller knows it was accepted
            return { success: true, queued: true };
          } else {
            // Logic error (e.g., Wrong PIN, Already clocked in): show error
            let errorTitle = "Clock Error";
            let errorToastMessage = "";

            if (errorMessage.includes("ALREADY_CLOCKED_IN")) {
              errorTitle = "Already Clocked In";
              errorToastMessage = "You are already clocked in.";
            } else if (
              errorMessage.includes("NOT_CLOCKED_IN") ||
              errorMessage.includes("NO_ACTIVE_SHIFT")
            ) {
              errorTitle = "Not Clocked In";
              errorToastMessage = "You are not currently clocked in.";
            } else if (errorMessage.includes("ALREADY_ON_BREAK")) {
              errorTitle = "Already On Break";
              errorToastMessage = "You are already on break.";
            } else if (errorMessage.includes("NOT_ON_BREAK")) {
              errorTitle = "Not On Break";
              errorToastMessage = "You are not currently on break.";
            } else if (errorMessage.includes("END_BREAK_FIRST")) {
              errorTitle = "End Break First";
              errorToastMessage = "Please end your break before clocking out.";
            } else if (errorMessage.includes("MUST_BE_ACTIVE_TO_BREAK")) {
              errorTitle = "Must Be Clocked In";
              errorToastMessage = "You must be clocked in to start a break.";
            } else if (
              errorMessage.includes("INVALID_PIN") ||
              errorMessage.includes("PIN") ||
              errorMessage.includes("pin")
            ) {
              errorTitle = "Invalid PIN";
              errorToastMessage = "The PIN you entered is incorrect.";
            } else {
              const errorMessages: Record<TimeClockActionType, string> = {
                sign_in:
                  "Failed to sign in. Please check your PIN and try again.",
                clock_in:
                  "Failed to clock in. Please check your PIN and try again.",
                clock_out: "Failed to clock out. Please try again.",
                break_start: "Failed to start break. Please try again.",
                break_end: "Failed to end break. Please try again.",
                declare_cash_tips: "Failed to declare cash tips. Please try again.",
              };
              errorToastMessage = errorMessages[type];
            }

            toastService.show({
              title: errorTitle,
              message: errorToastMessage,
              type: errorTitle.includes("Invalid") ? "error" : "warning",
            });

            options?.onError?.(type, errorMessage);
            throw new Error(errorMessage);
          }
        }
      } else {
        // --- OFFLINE PATH ---
        console.log("Offline: Queueing time clock action");
        store.queueAction(actionPayload);
        toastService.show({
          title: "Offline Mode",
          message: "Your action will be synced when connection is restored.",
          type: "warning",
        });
        return { success: true, queued: true };
      }
    },
    [store, supabase, options]
  );

  // 2. Sync Processor (The "Queue Flusher")
  useEffect(() => {
    const processQueue = async () => {
      if (store.offlineQueue.length === 0 || store.isSyncing) return;

      const netState = await NetInfo.fetch();
      if (!netState.isConnected || !netState.isInternetReachable) return;

      store.setSyncing(true);

      // Process strictly in order (FIFO)
      const actionToProcess = store.offlineQueue[0];

      try {
        console.log(`Syncing action: ${actionToProcess.type}`);

        let error: any;
        if (actionToProcess.type === 'declare_cash_tips') {
          // Route cash tip declarations to the dedicated RPC
          const res = await supabase.rpc("declare_cash_tips_for_shift", {
            p_shift_id: actionToProcess.shiftId!,
            p_amount: actionToProcess.cashTipAmount!,
          });
          error = res.error;
        } else {
          const res = await supabase.rpc("handle_time_clock", {
            p_pin_code: actionToProcess.pinCode,
            p_location_id: actionToProcess.locationId,
            p_action_type: actionToProcess.type,
            p_device_id: actionToProcess.deviceId,
          });
          error = res.error;
        }

        if (error) {
          console.error("Sync failed for action", actionToProcess.id, error);
          const isLogicError =
            error.code && !error.message?.includes("network");
          if (isLogicError) {
            store.removeFromQueue(actionToProcess.id);
            toastService.show({
              title: "Sync Warning",
              message:
                "An offline action could not be processed. It has been removed.",
              type: "warning",
            });
          }
        } else {
          store.removeFromQueue(actionToProcess.id);
          if (store.offlineQueue.length === 1) {
            toastService.show({
              title: "Sync Complete",
              message: "All pending actions have been synced.",
              type: "success",
            });
          }
        }
      } catch (e) {
        console.error("Critical Sync Error", e);
      } finally {
        store.setSyncing(false);
      }
    };

    processQueue();

    const interval = setInterval(processQueue, 10000);
    return () => clearInterval(interval);
  }, [store.offlineQueue, store.isSyncing, supabase]);

  // Cash tip declaration — separate from performAction (no optimistic status change)
  const declareCashTips = useCallback(
    async (
      shiftId: string,
      amount: number,
      locationId: string,
      deviceId: string,
    ): Promise<{ success: boolean; queued?: boolean }> => {
      const netState = await NetInfo.fetch();

      if (netState.isConnected && netState.isInternetReachable) {
        try {
          const { error } = await supabase.rpc("declare_cash_tips_for_shift", {
            p_shift_id: shiftId,
            p_amount: amount,
          });
          if (error) throw error;
          return { success: true };
        } catch (e: any) {
          const isNetwork =
            !e.code ||
            e.message?.includes("network") ||
            e.message?.includes("fetch");
          if (isNetwork) {
            // Queue for retry
            store.queueAction({
              id: uuidv4(),
              type: "declare_cash_tips",
              pinCode: "",
              locationId,
              timestamp: new Date().toISOString(),
              deviceId,
              shiftId,
              cashTipAmount: amount,
            });
            return { success: true, queued: true };
          }
          throw e;
        }
      } else {
        // Offline — queue
        store.queueAction({
          id: uuidv4(),
          type: "declare_cash_tips",
          pinCode: "",
          locationId,
          timestamp: new Date().toISOString(),
          deviceId,
          shiftId,
          cashTipAmount: amount,
        });
        return { success: true, queued: true };
      }
    },
    [supabase, store],
  );

  return {
    status: store.status,
    shiftId: store.currentShiftId,
    isSyncing: store.isSyncing,
    pendingActions: store.offlineQueue.length,
    clockIn: (pin: string, loc: string, dev: string) =>
      performAction("clock_in", pin, loc, dev),
    clockOut: (pin: string, loc: string, dev: string) =>
      performAction("clock_out", pin, loc, dev),
    startBreak: (pin: string, loc: string, dev: string) =>
      performAction("break_start", pin, loc, dev),
    endBreak: (pin: string, loc: string, dev: string) =>
      performAction("break_end", pin, loc, dev),
    signIn: (pin: string, loc: string, dev: string) =>
      performAction("sign_in", pin, loc, dev),
    declareCashTips,
  };
};
