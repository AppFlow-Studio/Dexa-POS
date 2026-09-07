import { act, renderHook } from "@testing-library/react-native";
import { useKioskCheckout } from "@/components/kiosk/shared/useKioskCheckout";
import { releaseKioskCheckout, resolveKioskReview } from "@/components/kiosk/shared/checkoutGuard";
import { buildValorTerminalResponse } from "@/services/terminals/valor-response-mapper";

const mockStorage = new Map<string, unknown>();
jest.mock("@/lib/storage", () => ({
  getSyncJSON: (key: string) => mockStorage.get(key) ?? null,
  setSyncJSON: (key: string, value: unknown) => mockStorage.set(key, value),
}));
const mockTerminal: any = { id: "valor-1", terminal_type: "valor", connection_type: "local_socket", ip_address: "192.0.2.1", port: 5000, cancel_port: 5001, epi: "sandbox-epi" };
const mockSettings: any = { selectedStation: { id: "station-1", can_process_payments: true, can_create_orders: true, payment_terminal: mockTerminal }, selectedStore: { id: "location-1", merchant_id: "merchant-1" } };
jest.mock("@/stores/useStoreSettingsStore", () => ({ useStoreSettingsStore: { getState: () => mockSettings } }));
jest.mock("@/stores/useProcessorPreferenceStore", () => ({ useProcessorPreferenceStore: { getState: () => ({ atomEnabled: false }) } }));
const mockConnect = jest.fn();
const mockSale = jest.fn();
const mockCancel = jest.fn();
jest.mock("@/services/terminals/valor-service", () => ({ getSharedValorService: () => ({ connect: mockConnect, processSale: mockSale, cancelInFlight: mockCancel }) }));
jest.mock("@/services/terminals/valor-txn-counter", () => ({ getOrCreateValorCounter: () => ({ isInitialized: true, next: () => "000123" }) }));
jest.mock("@/services/terminals/castles-service", () => ({ getSharedCastlesService: jest.fn() }));
jest.mock("@/services/terminals/castles-txn-counter", () => ({ getOrCreateCounter: jest.fn() }));
jest.mock("@/services/terminals/atom-service", () => ({ getSharedAtomService: jest.fn() }));
jest.mock("@/native/AtomBridge", () => ({ atomBringPosToForeground: jest.fn() }));
jest.mock("@/services/terminals/atomLoopbackDetector", () => ({}));
jest.mock("@/stores/useAtomTerminalStore", () => ({ useAtomTerminalStore: { getState: () => ({}) } }));
jest.mock("@/lib/payments/dejavoo-spin-api", () => ({ DejavooSpinAPI: jest.fn() }));
const mockJournalWrite = jest.fn((_params: any) => "journal-1");
const mockJournalUpdate = jest.fn();
const mockJournalComplete = jest.fn();
jest.mock("@/services/paymentJournal", () => ({ writePaymentJournal: (params: any) => mockJournalWrite(params), updatePaymentJournal: (...args: unknown[]) => mockJournalUpdate(...args), completePaymentJournal: (...args: unknown[]) => mockJournalComplete(...args), failPaymentJournal: jest.fn() }));
const mockPay = jest.fn();
jest.mock("@/services/paymentService", () => ({ payFullCard: (...args: unknown[]) => mockPay(...args) }));
const mockAccess = jest.fn();
jest.mock("@/services/posAccessService", () => ({ refreshSelectedStationOperationalState: (...args: unknown[]) => mockAccess(...args) }));
const mockHeader = jest.fn();
const mockSupabase = { from: jest.fn(() => ({ select: () => ({ eq: () => ({ single: mockHeader }) }) })) };
jest.mock("@/hooks/useSupabaseClient", () => ({ useSupabaseClient: () => mockSupabase }));
const mockCart = { lines: [{ lineId: "line-1", menuItemId: "item-1", name: "Test", quantity: 1, unitPrice: 25, cashUnitPrice: 25, modifiers: [] }] };
jest.mock("@/stores/useKioskCartStore", () => ({ useKioskCartStore: { getState: () => mockCart }, lineUnitPrice: () => 25, lineCashUnitPrice: () => 25 }));
const mockOrderStore: any = {
  ordersById: {}, activeOrderId: "order-1",
  startNewOrder: jest.fn(), patchOrder: jest.fn(), setActiveOrder: jest.fn(),
  ensureActiveOrderCreated: jest.fn(), addItemToActiveOrder: jest.fn(),
  waitForPendingSyncs: jest.fn(), recalculateOrder: jest.fn(),
  voidOrder: jest.fn(), sendNewItemsToKitchenForOrder: jest.fn(),
};
jest.mock("@/stores/useOrderStore", () => ({ useOrderStore: { getState: () => mockOrderStore } }));
jest.mock("@/lib/order-calculator", () => ({ calculateOrderTotals: () => ({ total_amount: 25, subtotal: 25, tax_amount: 0 }) }));
jest.mock("@/services/messaging/sendReceiptService", () => ({ sendReceipt: jest.fn() }));
jest.mock("@/services/printing/PrinterService", () => ({ PrinterService: { printReceipt: jest.fn() } }));
jest.mock("@/services/printing/PrintRouter", () => ({ getReceiptPrinter: jest.fn() }));
jest.mock("@/stores/useKioskProfileStore", () => ({ useKioskProfileStore: { getState: () => ({}) } }));

function approval(tipCents = 0) {
  return { success: true, stan: "42", terminalResponse: buildValorTerminalResponse({ STATE: "0", TXN_ID: "valor-txn-1", TRAN_NO: "20", STAN_NO: "42", CODE: "APP123", RRN: "123456789012", MASKED_PAN: "4111 **** **** 1111", CARD_BRAND: "VISA", TIP_AMOUNT: String(tipCents) }, "valor-1") };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => { resolve = r; });
  return { promise, resolve };
}
beforeEach(() => {
  mockStorage.clear();
  releaseKioskCheckout("station-1", false);
  mockSettings.selectedStation.can_process_payments = true;
  mockSettings.selectedStation.payment_terminal = mockTerminal;
  mockTerminal.epi = "sandbox-epi";
  mockTerminal.connection_type = "local_socket";
  mockTerminal.port = 5000;
  mockTerminal.last_connection_status = null;
  mockAccess.mockResolvedValue({ valid: true });
  mockHeader.mockResolvedValue({ data: { card_total: 25 }, error: null });
  mockOrderStore.ordersById = { "order-1": { id: "order-1", items: [{ id: "line-1", db_order_item_id: "db-item-1" }] } };
  mockOrderStore.startNewOrder.mockReturnValue({ id: "order-1" });
  mockOrderStore.ensureActiveOrderCreated.mockResolvedValue("order-1");
  mockOrderStore.recalculateOrder.mockReturnValue({ total_amount: 25 });
  mockOrderStore.sendNewItemsToKitchenForOrder.mockResolvedValue({ status: "sent" });
  mockConnect.mockResolvedValue(undefined);
  mockSale.mockImplementation(async (args) => { args.onStan?.("42"); return approval(args.tipAmount); });
  mockCancel.mockResolvedValue({ sent: true, cleared: true });
  mockPay.mockResolvedValue({ kind: "success", data: { success: true, order_fully_paid: true, payment_id: "payment-1" } });
});

describe("kiosk checkout through the shared Valor adapter", () => {
  it.each([0, 2])("charges the authoritative total with tip %s and persists before one kitchen send", async (tip) => {
    const { result } = renderHook(() => useKioskCheckout());
    await act(async () => { await result.current.payOrder(tip); });
    expect(mockSale).toHaveBeenCalledWith(expect.objectContaining({ amount: 2500, tipAmount: tip * 100, referenceId: "000123" }));
    const [orderId, amount, key, persistedTip, response, terminalId] = mockPay.mock.calls[0];
    expect([orderId, amount, persistedTip, terminalId]).toEqual(["order-1", 25, tip, "valor-1"]);
    expect(key).toBe(mockJournalWrite.mock.calls[0][0].idempotencyKey);
    expect(response).toMatchObject({ transaction_id: "valor-txn-1", authorization_code: "APP123", rrn: "123456789012", card_last_four: "1111", card_type: "VISA", valor_transaction: { stanNo: "42", tranNo: "20", terminalId: "valor-1" } });
    expect(response.raw_valor_response).toMatchObject({ MASKED_PAN: "4111 **** **** 1111", TIP_AMOUNT: String(tip * 100) });
    expect(mockJournalComplete).toHaveBeenCalledWith("journal-1", "payment-1");
    expect(mockOrderStore.sendNewItemsToKitchenForOrder).toHaveBeenCalledTimes(1);
    expect(mockPay.mock.invocationCallOrder[0]).toBeLessThan(mockOrderStore.sendNewItemsToKitchenForOrder.mock.invocationCallOrder[0]);
    expect(result.current.status).toBe("success");
    await act(async () => { await result.current.payOrder(tip); });
    expect(mockSale).toHaveBeenCalledTimes(1);
  });

  it("routes USB through the same station adapter", async () => {
    mockTerminal.connection_type = "usb";
    const { result } = renderHook(() => useKioskCheckout());
    await act(async () => { await result.current.payOrder(0); });
    expect(mockConnect).toHaveBeenCalledWith(expect.objectContaining({ connectionType: "usb", host: undefined, terminalId: "valor-1", epi: "sandbox-epi" }));
  });

  it("uses the refreshed station terminal through the real shared resolver", async () => {
    mockAccess.mockImplementationOnce(async () => {
      mockSettings.selectedStation.payment_terminal = { ...mockTerminal, id: "valor-2", ip_address: "192.0.2.2" };
      return { valid: true };
    });
    const { result } = renderHook(() => useKioskCheckout());
    await act(async () => { await result.current.payOrder(0); });
    expect(mockConnect).toHaveBeenCalledWith(expect.objectContaining({ terminalId: "valor-2", host: "192.0.2.2" }));
    expect(mockPay.mock.calls[0][5]).toBe("valor-2");
  });

  it("rechecks payment capability after order synchronization", async () => {
    mockAccess.mockResolvedValueOnce({ valid: true }).mockImplementationOnce(async () => {
      mockSettings.selectedStation.can_process_payments = false;
      return { valid: true };
    });
    const { result } = renderHook(() => useKioskCheckout());
    await act(async () => { await result.current.payOrder(0); });
    expect(mockSale).not.toHaveBeenCalled();
    expect(mockPay).not.toHaveBeenCalled();
    expect(result.current.status).toBe("error");
  });

  it("double tap creates one order and one payment", async () => {
    const gate = deferred<string>();
    mockOrderStore.ensureActiveOrderCreated.mockReturnValueOnce(gate.promise);
    const { result } = renderHook(() => useKioskCheckout());
    await act(async () => {
      const first = result.current.payOrder(0);
      await result.current.payOrder(0);
      gate.resolve("order-1");
      await first;
    });
    expect(mockOrderStore.startNewOrder).toHaveBeenCalledTimes(1);
    expect(mockSale).toHaveBeenCalledTimes(1);
    expect(mockPay).toHaveBeenCalledTimes(1);
  });

  it("clean decline voids only the unpaid order", async () => {
    mockSale.mockResolvedValue({ success: false, error: "Declined" });
    const { result } = renderHook(() => useKioskCheckout());
    await act(async () => { await result.current.payOrder(0); });
    expect(mockOrderStore.voidOrder).toHaveBeenCalledWith("order-1");
    expect(mockPay).not.toHaveBeenCalled();
    expect(mockOrderStore.sendNewItemsToKitchenForOrder).not.toHaveBeenCalled();
  });

  it.each([false, true])("cancel followed by approval=%s uses the settled sale outcome", async (approved) => {
    const gate = deferred<any>();
    mockSale.mockReturnValueOnce(gate.promise);
    const { result } = renderHook(() => useKioskCheckout());
    let payment!: Promise<unknown>;
    await act(async () => { payment = result.current.payOrder(0); });
    expect(mockSale).toHaveBeenCalledTimes(1);
    await act(async () => { await result.current.cancelCharge(); });
    expect(mockCancel).toHaveBeenCalledWith("000123");
    await act(async () => { gate.resolve(approved ? approval() : { success: false, error: "Cancelled" }); await payment; });
    expect(result.current.status).toBe(approved ? "success" : "cancelled");
    expect(mockPay).toHaveBeenCalledTimes(approved ? 1 : 0);
    expect(mockOrderStore.voidOrder).toHaveBeenCalledTimes(approved ? 0 : 1);
    await act(async () => { await result.current.cancelCharge(); });
    expect(mockCancel).toHaveBeenCalledTimes(1);
  });

  it.each([
    { success: false, indeterminate: true, stan: "42" },
    { success: true, partial: true, approvedAmount: 500, stan: "42" },
  ])("holds uncertain/partial payments across remounts", async (outcome) => {
    mockSale.mockResolvedValue(outcome);
    const first = renderHook(() => useKioskCheckout());
    await act(async () => { await first.result.current.payOrder(0); first.result.current.reset(); });
    expect(first.result.current.status).toBe("assistance");
    first.unmount();
    const second = renderHook(() => useKioskCheckout());
    await act(async () => { await second.result.current.payOrder(0); });
    expect(mockSale).toHaveBeenCalledTimes(1);
    expect(mockPay).not.toHaveBeenCalled();
    expect(mockOrderStore.voidOrder).not.toHaveBeenCalled();
    expect(second.result.current.status).toBe("assistance");
    expect(resolveKioskReview("station-1")).toBe(true);
  });

  it.each(["error", "verifying", "throw", "incomplete"])("payment persistence %s after approval cannot charge again", async (kind) => {
    if (kind === "throw") mockPay.mockRejectedValue(new Error("Connection lost"));
    else if (kind === "incomplete") mockPay.mockResolvedValue({ kind: "success", data: { success: true, order_fully_paid: false } });
    else mockPay.mockResolvedValue({ kind });
    const { result } = renderHook(() => useKioskCheckout());
    await act(async () => { await result.current.payOrder(0); });
    await act(async () => { await result.current.payOrder(0); });
    expect(result.current.status).toBe("assistance");
    expect(mockSale).toHaveBeenCalledTimes(1);
    expect(mockOrderStore.voidOrder).not.toHaveBeenCalled();
    expect(mockOrderStore.sendNewItemsToKitchenForOrder).not.toHaveBeenCalled();
  });

  it.each(["queued", "rejected", "skipped"])("kitchen %s does not report success or charge again", async (status) => {
    mockOrderStore.sendNewItemsToKitchenForOrder.mockResolvedValue({ status });
    const { result } = renderHook(() => useKioskCheckout());
    await act(async () => { await result.current.payOrder(0); await result.current.payOrder(0); });
    expect(result.current.status).toBe("assistance");
    expect(mockSale).toHaveBeenCalledTimes(1);
    expect(mockOrderStore.sendNewItemsToKitchenForOrder).toHaveBeenCalledTimes(1);
  });

  it.each([0, 1])("suspended access check %s prevents charging", async (check) => {
    if (check) mockAccess.mockResolvedValueOnce({ valid: true });
    mockAccess.mockResolvedValueOnce({ valid: false, failure: { message: "Billing Suspended" } });
    const { result } = renderHook(() => useKioskCheckout());
    await act(async () => { await result.current.payOrder(0); });
    expect(mockSale).not.toHaveBeenCalled();
    expect(mockPay).not.toHaveBeenCalled();
    if (!check) expect(mockOrderStore.startNewOrder).not.toHaveBeenCalled();
  });

  it("does not charge a stale or invalid authoritative total", async () => {
    mockHeader.mockResolvedValue({ data: { card_total: 26 } });
    const { result } = renderHook(() => useKioskCheckout());
    await act(async () => { await result.current.payOrder(0); });
    expect(mockSale).not.toHaveBeenCalled();
    expect(mockOrderStore.voidOrder).toHaveBeenCalled();
  });

  it.each(["epi", "port", "identity"])("rejects invalid Valor %s configuration before sale", async (field) => {
    if (field === "epi") mockTerminal.epi = "";
    if (field === "port") mockTerminal.port = -1;
    if (field === "identity") mockTerminal.last_connection_status = "IdentityMismatch";
    const { result } = renderHook(() => useKioskCheckout());
    await act(async () => { await result.current.payOrder(0); });
    expect(mockSale).not.toHaveBeenCalled();
    expect(mockPay).not.toHaveBeenCalled();
  });
});
