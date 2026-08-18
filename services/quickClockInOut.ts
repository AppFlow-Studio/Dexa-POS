/**
 * Quick Clock In / Out (PIN-driven, no account switch)
 *
 * Powers the "Clock In / Out" panel in the SessionDock dropdown. A staff member
 * enters their PIN and is clocked in/out on the backend WITHOUT switching the
 * active terminal account — the whole point of this flow vs. "Switch Account".
 *
 * Design constraints (why this does NOT reuse `useTimeClock.performAction`):
 *   - performAction mutates singleton *device* state (status / currentShiftId /
 *     currentStaffId / employeeName) which belongs to the ACTIVE terminal user.
 *     Clocking a *different* person in/out through it would corrupt the active
 *     user's shift context (breaks their break / clock-out / offline payloads).
 *   - So this path talks to the RPC directly and only reconciles the *per-employee*
 *     session for the resolved staff member. It never touches active device state
 *     and never sets activeEmployeeId.
 */

import NetInfo from "@react-native-community/netinfo";
import { v4 as uuidv4 } from "uuid";

import { useEmployeeStore } from "@/stores/useEmployeeStore";
import { useTimeclockStore } from "@/stores/useTimeclockStore";
import { TimeClockAction } from "@/types/time-clock";

export type QuickClockMode = "clock_in" | "clock_out";

export type QuickClockErrorCode =
  | "INVALID_INPUT"
  | "ALREADY_CLOCKED_IN"
  | "NOT_CLOCKED_IN"
  | "ALREADY_ON_BREAK"
  | "END_BREAK_FIRST"
  | "INVALID_PIN"
  | "UNKNOWN";

export type QuickClockResult =
  | {
      status: "success";
      mode: QuickClockMode;
      employeeName: string | null;
      employeeId: string | null;
      /** True when the clocked-out person was the active terminal user. */
      wasActiveUser: boolean;
    }
  | { status: "queued"; mode: QuickClockMode }
  | { status: "error"; code: QuickClockErrorCode; message: string };

export interface QuickClockParams {
  mode: QuickClockMode;
  pin: string;
  locationId: string;
  deviceId: string;
}

const PIN_LENGTH = 4;

/** Map a raw RPC error into a stable code + user-facing message. */
function classifyLogicError(
  mode: QuickClockMode,
  rawMessage: string,
): { code: QuickClockErrorCode; message: string } {
  const m = rawMessage || "";

  if (m.includes("ALREADY_CLOCKED_IN")) {
    return {
      code: "ALREADY_CLOCKED_IN",
      message: "That employee is already clocked in.",
    };
  }
  if (m.includes("NOT_CLOCKED_IN") || m.includes("NO_ACTIVE_SHIFT")) {
    return {
      code: "NOT_CLOCKED_IN",
      message: "That employee is not currently clocked in.",
    };
  }
  if (m.includes("END_BREAK_FIRST")) {
    return {
      code: "END_BREAK_FIRST",
      message: "End the break before clocking out.",
    };
  }
  if (m.includes("ALREADY_ON_BREAK")) {
    return {
      code: "ALREADY_ON_BREAK",
      message: "That employee is already on break.",
    };
  }
  if (
    m.includes("INVALID_PIN") ||
    m.toLowerCase().includes("pin") ||
    m.includes("PIN")
  ) {
    return { code: "INVALID_PIN", message: "The PIN you entered is incorrect." };
  }

  return {
    code: "UNKNOWN",
    message:
      mode === "clock_in"
        ? "Failed to clock in. Please try again."
        : "Failed to clock out. Please try again.",
  };
}

/** A network/transient failure should be queued, not surfaced as a hard error. */
function isTransient(error: any): boolean {
  const message = String(error?.message ?? "").toLowerCase();
  return (
    !error?.code ||
    message.includes("network") ||
    message.includes("fetch") ||
    message.includes("timeout")
  );
}

/** Enqueue the action for the offline processor to replay by PIN. */
function queueAction(
  mode: QuickClockMode,
  pin: string,
  locationId: string,
  deviceId: string,
  staffProfileId?: string,
): void {
  const action: TimeClockAction = {
    id: uuidv4(),
    type: mode,
    pinCode: pin,
    locationId,
    timestamp: new Date().toISOString(),
    deviceId,
    // clock_out fallback lets the processor update staff_shifts directly if the
    // RPC keeps failing (see timeclockSyncProcessor).
    ...(mode === "clock_out" && staffProfileId ? { staffProfileId } : {}),
  };
  useTimeclockStore.getState().queueAction(action);
}

/**
 * Apply the local per-employee session change for a *successful* backend action.
 * Never touches active device state or activeEmployeeId (except clockOut's own
 * built-in "sign out the terminal if this was the active user" behaviour).
 */
function reconcileLocalSession(
  mode: QuickClockMode,
  employeeId: string,
): { wasActiveUser: boolean } {
  const tc = useTimeclockStore.getState();
  const wasActiveUser = tc.activeEmployeeId === employeeId;

  if (mode === "clock_in") {
    tc.clockInSession(employeeId);
    useEmployeeStore.getState().clockIn(employeeId);
  } else {
    // silent: the panel shows its own correctly-named toast.
    tc.clockOut(employeeId, { silent: true });
  }

  return { wasActiveUser };
}

/**
 * Perform a PIN-driven clock in/out that does NOT switch the active account.
 * Returns a discriminated result; the caller owns user-facing toasts/navigation.
 */
export async function performQuickClockInOut(
  supabase: any,
  { mode, pin, locationId, deviceId }: QuickClockParams,
): Promise<QuickClockResult> {
  if (!pin || pin.length !== PIN_LENGTH) {
    return {
      status: "error",
      code: "INVALID_INPUT",
      message: `PIN must be ${PIN_LENGTH} digits.`,
    };
  }
  if (!locationId || !deviceId) {
    return {
      status: "error",
      code: "INVALID_INPUT",
      message: "Store or device not configured.",
    };
  }

  const empStore = useEmployeeStore.getState();
  const localEmployee = empStore.findEmployeeByPin(pin);

  const netState = await NetInfo.fetch();
  const online = !!netState.isConnected && !!netState.isInternetReachable;

  if (!online) {
    // Offline: queue for replay. Optimistically reflect a clock-IN locally
    // (no toast, safe); leave clock-OUT to reconcile on sync to avoid a
    // misleading "clocked out" state before the backend confirms.
    if (mode === "clock_in" && localEmployee) {
      useTimeclockStore.getState().clockInSession(localEmployee.id);
      useEmployeeStore.getState().clockIn(localEmployee.id);
    }
    queueAction(mode, pin, locationId, deviceId, localEmployee?.profileId);
    return { status: "queued", mode };
  }

  try {
    const { data, error } = await supabase.rpc("handle_time_clock", {
      p_pin_code: pin,
      p_location_id: locationId,
      p_action_type: mode,
      p_device_id: deviceId,
    });

    if (error) throw error;

    // Resolve the staff member the backend acted on (fall back to local PIN).
    const staffId: string | undefined = data?.staff_id;
    const resolved =
      (staffId ? empStore.getEmployeeByStaffId(staffId) : undefined) ??
      localEmployee ??
      undefined;

    let wasActiveUser = false;
    if (resolved) {
      ({ wasActiveUser } = reconcileLocalSession(mode, resolved.id));
    }

    return {
      status: "success",
      mode,
      employeeName: data?.employee_name ?? resolved?.fullName ?? null,
      employeeId: resolved?.id ?? null,
      wasActiveUser,
    };
  } catch (error: any) {
    if (isTransient(error)) {
      if (mode === "clock_in" && localEmployee) {
        useTimeclockStore.getState().clockInSession(localEmployee.id);
        useEmployeeStore.getState().clockIn(localEmployee.id);
      }
      queueAction(mode, pin, locationId, deviceId, localEmployee?.profileId);
      return { status: "queued", mode };
    }

    const { code, message } = classifyLogicError(
      mode,
      error?.message ?? String(error),
    );
    return { status: "error", code, message };
  }
}
