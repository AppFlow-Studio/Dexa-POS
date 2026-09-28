import {
  buildRefundDetails,
  dayHeading,
  orderNumber,
  orderState,
  resolveDateRange,
  summarizePayments,
  type OrderRow,
  type PaymentRow,
} from "@/components/kiosk/shared/kioskOrders";
import { useStoreSettingsStore } from "@/stores/useStoreSettingsStore";

const payment = (p: Partial<PaymentRow>): PaymentRow => ({
  id: "p",
  amount: 0,
  refunded_amount: 0,
  status: "captured",
  is_voided: false,
  tip_amount: 0,
  payment_method: "card",
  ...p,
});

const order = (payments: PaymentRow[], status = "completed"): OrderRow => ({
  id: "o1",
  order_number: "1001",
  display_number: "1001",
  created_at: "2026-09-27T16:00:00Z",
  status,
  order_type: "takeout",
  customer_name: null,
  total_amount: 20,
  order_payments: payments,
});

describe("kiosk orders — payments", () => {
  it("only counts collected, non-voided payments", () => {
    const s = summarizePayments([
      payment({ id: "a", amount: 20, refunded_amount: 5 }),
      payment({ id: "b", amount: 10, is_voided: true }),
      payment({ id: "c", amount: 7, status: "declined" }),
    ]);
    expect(s).toEqual({ paid: 20, refunded: 5, refundable: 15 });
  });

  it("adds a # to order numbers only when they don't already have one", () => {
    expect(orderNumber({ ...order([]), display_number: "#S10-0001" })).toBe("#S10-0001");
    expect(orderNumber({ ...order([]), display_number: "1001" })).toBe("#1001");
  });

  it("labels paid / partly refunded / refunded / voided", () => {
    expect(orderState(order([payment({ amount: 20 })])).label).toBe("Paid");
    expect(
      orderState(order([payment({ amount: 20, refunded_amount: 5, status: "partially_refunded" })])).label,
    ).toBe("Partly refunded");
    expect(
      orderState(order([payment({ amount: 20, refunded_amount: 20, status: "refunded" })])).label,
    ).toBe("Refunded");
    expect(orderState(order([payment({ amount: 20 })], "voided")).label).toBe("Voided");
  });

  it("full refund takes each payment's remaining balance, tip included", () => {
    const details = buildRefundDetails(
      [
        payment({ id: "a", amount: 22, tip_amount: 2 }),
        payment({ id: "b", amount: 10, refunded_amount: 4, status: "partially_refunded" }),
        payment({ id: "v", amount: 50, is_voided: true }),
      ],
      28,
      true,
    );
    expect(details).toHaveLength(2);
    expect(details[0]).toMatchObject({
      dbPaymentId: "a",
      totalRefund: 22,
      tipAmountToRefund: 2,
      orderAmountToRefund: 20,
    });
    expect(details[1]).toMatchObject({ dbPaymentId: "b", totalRefund: 6 });
  });

  it("custom amount fills the oldest payment first, then the next", () => {
    const details = buildRefundDetails(
      [
        payment({ id: "a", amount: 10.1 }),
        payment({ id: "b", amount: 20 }),
      ],
      15.3,
      false,
    );
    expect(details.map((d) => [d.dbPaymentId, d.totalRefund])).toEqual([
      ["a", 10.1],
      ["b", 5.2],
    ]);
    expect(details.every((d) => d.tipAmountToRefund === 0)).toBe(true);
  });
});

describe("kiosk orders — dates in the store's timezone", () => {
  beforeAll(() => {
    jest.useFakeTimers();
    // 22:30 on Sep 27 in New York, already Sep 28 in UTC.
    jest.setSystemTime(new Date("2026-09-28T02:30:00Z"));
    useStoreSettingsStore.setState({
      selectedStore: { id: "loc-1", timezone: "America/New_York" },
    } as any);
  });
  afterAll(() => {
    jest.useRealTimers();
  });

  it("Today is the store's day, not UTC's", () => {
    const r = resolveDateRange({ preset: "today" });
    expect(r.startDay).toBe("2026-09-27");
    expect(r.from).toBe("2026-09-27T04:00:00.000Z");
    expect(r.to).toBe("2026-09-28T04:00:00.000Z");
    expect(r.multiDay).toBe(false);
  });

  it("Last 7 days spans today and the six before it", () => {
    const r = resolveDateRange({ preset: "last7" });
    expect(r.startDay).toBe("2026-09-21");
    expect(r.endDay).toBe("2026-09-27");
    expect(r.multiDay).toBe(true);
  });

  it("a custom single day covers that whole store day", () => {
    const r = resolveDateRange({ preset: "custom", start: "2026-09-12" });
    expect(r.from).toBe("2026-09-12T04:00:00.000Z");
    expect(r.to).toBe("2026-09-13T04:00:00.000Z");
  });

  it("names today and yesterday in day headings", () => {
    expect(dayHeading("2026-09-27")).toBe("Today");
    expect(dayHeading("2026-09-26")).toBe("Yesterday");
    expect(dayHeading("2026-09-22")).toBe("Tuesday, Sep 22");
  });
});
