import {
  formatAddress,
  savedToDeliveryAddress,
  serializeDeliveryAddress,
} from "@/utils/addressUtils";
import type { Database } from "@/database.types";

type SavedAddress =
  Database["public"]["Tables"]["customer_saved_addresses"]["Row"];

const savedAddress = (overrides: Partial<SavedAddress> = {}): SavedAddress => ({
  id: "address-1",
  customer_id: "customer-1",
  address_line1: "123 Main St",
  address_line2: "Apt 4B",
  city: "Dallas",
  state: "TX",
  postal_code: "75201",
  delivery_notes: "Ring the bell",
  label: "Home",
  is_default: true,
  created_at: "2026-05-31T00:00:00.000Z",
  updated_at: "2026-05-31T00:00:00.000Z",
  ...overrides,
});

describe("savedToDeliveryAddress", () => {
  it("maps every saved-address field to the delivery json shape", () => {
    expect(savedToDeliveryAddress(savedAddress())).toEqual({
      street: "123 Main St",
      unit: "Apt 4B",
      city: "Dallas",
      state: "TX",
      zip: "75201",
      delivery_notes: "Ring the bell",
    });
  });

  it("preserves an explicit null unit", () => {
    expect(
      savedToDeliveryAddress(savedAddress({ address_line2: null })).unit,
    ).toBeNull();
  });

  it("preserves explicit null delivery notes", () => {
    expect(
      savedToDeliveryAddress(savedAddress({ delivery_notes: null }))
        .delivery_notes,
    ).toBeNull();
  });

  it("maps the selected row regardless of whether it is the default", () => {
    expect(
      savedToDeliveryAddress(
        savedAddress({
          address_line1: "500 Elm St",
          is_default: false,
          label: "Office",
        }),
      ).street,
    ).toBe("500 Elm St");
  });
});

describe("serializeDeliveryAddress", () => {
  it("translates a saved-address row before writing delivery json", () => {
    expect(JSON.parse(serializeDeliveryAddress(savedAddress()))).toEqual({
      street: "123 Main St",
      unit: "Apt 4B",
      city: "Dallas",
      state: "TX",
      zip: "75201",
      delivery_notes: "Ring the bell",
    });
  });

  it("writes explicit null keys for fields absent from a manual selection", () => {
    expect(
      JSON.parse(
        serializeDeliveryAddress({
          street: "123 Main St",
          city: "Dallas",
          state: "TX",
          zip: "75201",
        }),
      ),
    ).toEqual({
      street: "123 Main St",
      unit: null,
      city: "Dallas",
      state: "TX",
      zip: "75201",
      delivery_notes: null,
    });
  });
});

describe("formatAddress", () => {
  it("includes the unit in the visible delivery address", () => {
    expect(
      formatAddress(
        serializeDeliveryAddress(savedToDeliveryAddress(savedAddress())),
      ),
    ).toBe("123 Main St, Apt 4B, Dallas, TX, 75201");
  });
});
