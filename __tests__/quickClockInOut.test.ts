/**
 * Quick Clock In / Out (PIN-driven, no account switch).
 *
 * These pin the behaviour that makes this flow different from "Switch Account":
 *   - clocking a staff member in NEVER changes activeEmployeeId
 *   - backend edge cases (already clocked in / not clocked in) surface as errors
 *     WITHOUT mutating local session state
 *   - offline + transient failures queue the action for replay
 */

import NetInfo from "@react-native-community/netinfo";

import { performQuickClockInOut } from "@/services/quickClockInOut";
import { useEmployeeStore } from "@/stores/useEmployeeStore";
import { useTimeclockStore } from "@/stores/useTimeclockStore";

const COOK = {
  id: "emp-cook",
  profileId: "staff-cook",
  fullName: "Alex Cook",
  displayName: "Alex",
  role: "employee",
  pin: "1234",
  shiftStatus: "clocked_out",
} as any;

const MANAGER = {
  id: "emp-mgr",
  profileId: "staff-mgr",
  fullName: "Manager Mel",
  displayName: "Mel",
  role: "manager",
  pin: "9999",
  shiftStatus: "clocked_in",
} as any;

const PARAMS = { locationId: "loc-1", deviceId: "dev-1" };

function makeSupabase(
  rpcImpl: (name: string, args: any) => any,
): { rpc: jest.Mock } {
  return { rpc: jest.fn(rpcImpl) };
}

function seedClockedInSession(employeeId: string) {
  useTimeclockStore.setState({
    sessions: {
      [employeeId]: {
        employeeId,
        status: "clockedIn",
        clockInTime: new Date(),
        breakStartTime: null,
        breakEndTime: null,
      },
    },
  });
}

beforeEach(() => {
  (NetInfo.fetch as jest.Mock).mockResolvedValue({
    isConnected: true,
    isInternetReachable: true,
  });

  // Manager is the active terminal user; cook is clocked out.
  useTimeclockStore.setState({
    sessions: {},
    activeEmployeeId: "emp-mgr",
    offlineQueue: [],
  });
  useEmployeeStore.setState({
    employees: [{ ...COOK }, { ...MANAGER }],
    activeEmployeeId: "emp-mgr",
    loggedInEmployee: { ...MANAGER },
  });
});

describe("performQuickClockInOut — clock in", () => {
  it("clocks a non-active staff member in WITHOUT switching the active account", async () => {
    const supabase = makeSupabase(() => ({
      data: {
        staff_id: "staff-cook",
        employee_name: "Alex Cook",
        shift_id: "shift-1",
      },
      error: null,
    }));

    const result = await performQuickClockInOut(supabase, {
      ...PARAMS,
      mode: "clock_in",
      pin: "1234",
    });

    expect(result).toMatchObject({
      status: "success",
      mode: "clock_in",
      employeeName: "Alex Cook",
      employeeId: "emp-cook",
      wasActiveUser: false,
    });

    const tc = useTimeclockStore.getState();
    // Session created for the cook...
    expect(tc.sessions["emp-cook"]?.status).toBe("clockedIn");
    // ...but the active account is untouched.
    expect(tc.activeEmployeeId).toBe("emp-mgr");
    expect(
      useEmployeeStore.getState().employees.find((e) => e.id === "emp-cook")
        ?.shiftStatus,
    ).toBe("clocked_in");
  });

  it("returns ALREADY_CLOCKED_IN without mutating local sessions", async () => {
    const supabase = makeSupabase(() => ({
      data: null,
      error: { message: "ALREADY_CLOCKED_IN", code: "P0001" },
    }));

    const result = await performQuickClockInOut(supabase, {
      ...PARAMS,
      mode: "clock_in",
      pin: "1234",
    });

    expect(result).toEqual({
      status: "error",
      code: "ALREADY_CLOCKED_IN",
      message: expect.stringContaining("already clocked in"),
    });
    expect(useTimeclockStore.getState().sessions["emp-cook"]).toBeUndefined();
  });
});

describe("performQuickClockInOut — clock out", () => {
  it("clocks out a non-active staff member and leaves the active account signed in", async () => {
    seedClockedInSession("emp-cook");
    const supabase = makeSupabase(() => ({
      data: { staff_id: "staff-cook", employee_name: "Alex Cook" },
      error: null,
    }));

    const result = await performQuickClockInOut(supabase, {
      ...PARAMS,
      mode: "clock_out",
      pin: "1234",
    });

    expect(result).toMatchObject({
      status: "success",
      mode: "clock_out",
      wasActiveUser: false,
    });

    const tc = useTimeclockStore.getState();
    expect(tc.sessions["emp-cook"]).toBeUndefined();
    expect(tc.activeEmployeeId).toBe("emp-mgr");
  });

  it("flags wasActiveUser when the active user clocks themselves out", async () => {
    seedClockedInSession("emp-mgr");
    const supabase = makeSupabase(() => ({
      data: { staff_id: "staff-mgr", employee_name: "Manager Mel" },
      error: null,
    }));

    const result = await performQuickClockInOut(supabase, {
      ...PARAMS,
      mode: "clock_out",
      pin: "9999",
    });

    expect(result).toMatchObject({ status: "success", wasActiveUser: true });

    const tc = useTimeclockStore.getState();
    expect(tc.sessions["emp-mgr"]).toBeUndefined();
    // store.clockOut nulls the active user on self clock-out.
    expect(tc.activeEmployeeId).toBeNull();
  });

  it("returns NOT_CLOCKED_IN when the backend reports no active shift", async () => {
    const supabase = makeSupabase(() => ({
      data: null,
      error: { message: "NO_ACTIVE_SHIFT", code: "P0001" },
    }));

    const result = await performQuickClockInOut(supabase, {
      ...PARAMS,
      mode: "clock_out",
      pin: "1234",
    });

    expect(result).toEqual({
      status: "error",
      code: "NOT_CLOCKED_IN",
      message: expect.stringContaining("not currently clocked in"),
    });
  });
});

describe("performQuickClockInOut — validation & offline", () => {
  it("rejects a short PIN before hitting the network", async () => {
    const supabase = makeSupabase(() => ({ data: null, error: null }));

    const result = await performQuickClockInOut(supabase, {
      ...PARAMS,
      mode: "clock_in",
      pin: "12",
    });

    expect(result).toMatchObject({ status: "error", code: "INVALID_INPUT" });
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it("queues the action (and optimistically clocks in) when offline", async () => {
    (NetInfo.fetch as jest.Mock).mockResolvedValueOnce({
      isConnected: false,
      isInternetReachable: false,
    });
    const supabase = makeSupabase(() => ({ data: null, error: null }));

    const result = await performQuickClockInOut(supabase, {
      ...PARAMS,
      mode: "clock_in",
      pin: "1234",
    });

    expect(result).toEqual({ status: "queued", mode: "clock_in" });
    expect(supabase.rpc).not.toHaveBeenCalled();

    const tc = useTimeclockStore.getState();
    expect(tc.offlineQueue).toHaveLength(1);
    expect(tc.offlineQueue[0]).toMatchObject({
      type: "clock_in",
      pinCode: "1234",
      locationId: "loc-1",
      deviceId: "dev-1",
    });
    // optimistic session, still no account switch
    expect(tc.sessions["emp-cook"]?.status).toBe("clockedIn");
    expect(tc.activeEmployeeId).toBe("emp-mgr");
  });

  it("queues on a transient network error thrown by the RPC", async () => {
    const supabase = makeSupabase(() => {
      throw new Error("network request failed");
    });

    const result = await performQuickClockInOut(supabase, {
      ...PARAMS,
      mode: "clock_in",
      pin: "1234",
    });

    expect(result).toEqual({ status: "queued", mode: "clock_in" });
    expect(useTimeclockStore.getState().offlineQueue).toHaveLength(1);
  });
});
