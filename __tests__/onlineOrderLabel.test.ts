import { platformShortCode, resolveOrderLabel } from "@/lib/onlineOrderLabel";

describe("platformShortCode", () => {
  it("returns the last-5 alphanumerics of a dashed UUID, uppercased (Uber bag code)", () => {
    expect(platformShortCode("3cf378ae-ec3e-47f1-9876-1f4beb6c424d")).toBe(
      "C424D",
    );
  });

  it("strips non-alphanumerics before taking the last 5", () => {
    expect(platformShortCode("DD-8FK2Q")).toBe("8FK2Q");
  });

  it("uppercases and returns short inputs whole", () => {
    expect(platformShortCode("abc")).toBe("ABC");
  });

  it("returns null for empty, null, or symbol-only input", () => {
    expect(platformShortCode(null)).toBeNull();
    expect(platformShortCode(undefined)).toBeNull();
    expect(platformShortCode("   ")).toBeNull();
    expect(platformShortCode("----")).toBeNull();
  });
});

describe("resolveOrderLabel", () => {
  it("shows the last-5 short code for a usable platform order number", () => {
    expect(
      resolveOrderLabel({
        id: "50adb5f3-e62f-4618-b669-96fa377cdfce",
        display_number: "#0008",
        order_number: "ORD-20260712-0008",
        platform_order_number: "DD-8FK2Q",
      }),
    ).toBe("8FK2Q");
  });

  it("uses the last-5 short code even when platform_order_number is a bare UUID (Uber case)", () => {
    // Uber/OrderOut echo the marketplace order id as a UUID; its tail is the bag code.
    expect(
      resolveOrderLabel({
        id: "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa",
        display_number: "#0007",
        platform_order_number: "78379131-6ea2-4abc-b4de-4fc67b15496e",
      }),
    ).toBe("5496E");
  });

  it("falls back to the Dexa number when platform_order_number is this order's own id", () => {
    // Prod regression: integration echoed the order's internal UUID.
    expect(
      resolveOrderLabel({
        id: "78379131-6ea2-4abc-b4de-4fc67b15496e",
        display_number: "#0042",
        platform_order_number: "78379131-6ea2-4abc-b4de-4fc67b15496e",
      }),
    ).toBe("#0042");
  });

  it("rejects the synthetic first-party dexa- id (online_store orders)", () => {
    expect(
      resolveOrderLabel({
        id: "a8e1fbcf-2b8a-42e9-9b8c-246c4a77fdd4",
        display_number: "#0012",
        order_number: "ORD-20260725-0012",
        platform_order_number:
          "dexa-77339e79-52b509bb-bc18-4480-b70d-d2c3ea3d54e7",
      }),
    ).toBe("#0012");
  });

  it("rejects platform_order_number equal to db_order_id", () => {
    expect(
      resolveOrderLabel({
        id: "local-1",
        db_order_id: "78379131-6ea2-4abc-b4de-4fc67b15496e",
        display_number: "#0003",
        platform_order_number: "78379131-6ea2-4abc-b4de-4fc67b15496e",
      }),
    ).toBe("#0003");
  });

  it("uses the Dexa display number when there is no platform number", () => {
    expect(
      resolveOrderLabel({
        id: "local-1",
        display_number: "#0005",
        platform_order_number: null,
      }),
    ).toBe("#0005");
  });

  it("prepends # when the Dexa number is missing the prefix", () => {
    expect(
      resolveOrderLabel({
        id: "local-1",
        order_number: "ORD-20260725-0001",
      }),
    ).toBe("#ORD-20260725-0001");
  });
});
