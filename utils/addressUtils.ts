import type { Database } from "@/database.types";

export interface ParsedAddress {
  street: string;
  city: string;
  state: string;
  zip: string;
}

export interface DeliveryAddress extends ParsedAddress {
  unit: string | null;
  delivery_notes: string | null;
}

type SavedAddress =
  Database["public"]["Tables"]["customer_saved_addresses"]["Row"];

export const savedToDeliveryAddress = (
  address: SavedAddress,
): DeliveryAddress => ({
  street: address.address_line1 || "",
  unit: address.address_line2 ?? null,
  city: address.city || "",
  state: address.state || "",
  zip: address.postal_code || "",
  delivery_notes: address.delivery_notes ?? null,
});

export const toDeliveryAddress = (
  address: ParsedAddress | DeliveryAddress | SavedAddress,
): DeliveryAddress => {
  if ("address_line1" in address) return savedToDeliveryAddress(address);

  return {
    street: address.street || "",
    unit: "unit" in address ? address.unit ?? null : null,
    city: address.city || "",
    state: address.state || "",
    zip: address.zip || "",
    delivery_notes:
      "delivery_notes" in address ? address.delivery_notes ?? null : null,
  };
};

export const serializeDeliveryAddress = (
  address: ParsedAddress | DeliveryAddress | SavedAddress,
): string => JSON.stringify(toDeliveryAddress(address));

export const formatAddress = (
  address: string | object | null | undefined,
): string => {
  if (!address) return "";
  try {
    let parsed: unknown = address;
    // Unwrap string layers (handles double-encoded JSON from json/jsonb column)
    while (typeof parsed === "string") {
      try {
        parsed = JSON.parse(parsed);
      } catch {
        // Not valid JSON — treat as plain text address
        return parsed;
      }
    }
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const addr = parsed as Record<string, string>;
      const parts = [addr.street, addr.unit, addr.city, addr.state, addr.zip].filter(
        Boolean,
      );
      return parts.join(", ");
    }
    return typeof address === "string" ? address : "";
  } catch {
    return typeof address === "string" ? address : "";
  }
};

export const parseAddressString = (
  address: string | object | null | undefined,
): ParsedAddress | null => {
  if (!address) return null;
  try {
    let parsed: unknown = address;
    // Unwrap string layers (handles double-encoded JSON from json/jsonb column)
    while (typeof parsed === "string") {
      try {
        parsed = JSON.parse(parsed);
      } catch {
        return null;
      }
    }
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const addr = parsed as Record<string, string>;
      return {
        street: addr.street || "",
        city: addr.city || "",
        state: addr.state || "",
        zip: addr.zip || "",
      };
    }
    return null;
  } catch {
    return null;
  }
};
