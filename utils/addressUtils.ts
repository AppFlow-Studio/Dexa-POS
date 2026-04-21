export interface ParsedAddress {
  street: string;
  city: string;
  state: string;
  zip: string;
}

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
      const parts = [addr.street, addr.city, addr.state, addr.zip].filter(
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
