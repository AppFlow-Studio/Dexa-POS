import { act, renderHook } from "@testing-library/react-native";
import { useCloseTable } from "@/handheld/screens/pay/useCloseTable";

// jest.mock calls below are hoisted above these imports.

const mockFinalize = jest.fn();
const mockClose = jest.fn(async () => true);
const mockMarkPaid = jest.fn(async () => {});

jest.mock("@/services/tables/finalizeDineInPaymentClear", () => ({
  finalizeDineInPaymentClear: (...args: unknown[]) => mockFinalize(...args),
}));
jest.mock("@/handheld/lib/tableClose", () => ({
  closeTable: (...args: unknown[]) => mockClose(...(args as [])),
  markTablePaid: (...args: unknown[]) => mockMarkPaid(...(args as [])),
}));
jest.mock("@/handheld/lib/sendCourse", () => ({ tableIdOf: () => "table-12" }));
jest.mock("@/lib/toastService", () => ({ toastService: { show: jest.fn() } }));
jest.mock("@/stores/useOrderStore", () => ({
  useOrderStore: { getState: () => ({ ordersById: { o1: { id: "o1", items: [] } } }) },
}));


async function runClose() {
  const { result } = renderHook(() => useCloseTable("o1"));
  await act(async () => {
    await result.current.close();
  });
}

describe("screen 9 close", () => {
  beforeEach(() => jest.clearAllMocks());

  it("auto-clear on: frees the table and never also runs CLEAR_TABLE", async () => {
    mockFinalize.mockReturnValue({ cleared: true });
    await runClose();
    expect(mockClose).not.toHaveBeenCalled();
  });

  it("auto-clear off: closes the register's manual way, after marking the table paid", async () => {
    mockFinalize.mockReturnValue({ cleared: false, reason: "setting-disabled" });
    await runClose();
    expect(mockMarkPaid).toHaveBeenCalledTimes(1);
    expect(mockClose).toHaveBeenCalledWith("table-12");
  });

  it("another check still owes: refuses, no manual close", async () => {
    mockFinalize.mockReturnValue({ cleared: false, reason: "siblings-due" });
    await runClose();
    expect(mockClose).not.toHaveBeenCalled();
  });
});

describe("isFullyPaid", () => {
  // The module is mocked above for the hook; the real guard is tested here.
  const { isFullyPaid: real } = jest.requireActual<typeof import("@/handheld/lib/tableClose")>("@/handheld/lib/tableClose");
  const order = (items: object[]) => ({ items }) as never;

  it("needs every unvoided line paid", () => {
    expect(real(order([{ quantity: 2, paidQuantity: 2 }, { quantity: 1, paidQuantity: 0, is_voided: true }]))).toBe(true);
    expect(real(order([{ quantity: 2, paidQuantity: 1 }]))).toBe(false);
    expect(real(order([]))).toBe(false);
    expect(real(null)).toBe(false);
  });
});
