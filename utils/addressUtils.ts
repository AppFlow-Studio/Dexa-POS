export interface ParsedAddress {
  street: string;
  city: string;
  state: string;
  zip: string;
}

export const formatAddress = (address: string | null | undefined): string => {
  if (!address) return "";
  try {
    const parsed = JSON.parse(address);
    if (parsed && typeof parsed === "object") {
      const parts = [
        parsed.street,
        parsed.city,
        parsed.state,
        parsed.zip,
      ].filter(Boolean);
      return parts.join(", ");
    }
    return address;
  } catch {
    return address;
  }
};

export const parseAddressString = (
  address: string | null | undefined,
): ParsedAddress | null => {
  if (!address) return null;
  try {
    const parsed = JSON.parse(address);
    if (parsed && typeof parsed === "object") {
      return {
        street: parsed.street || "",
        city: parsed.city || "",
        state: parsed.state || "",
        zip: parsed.zip || "",
      };
    }
    return null;
  } catch {
    return null;
  }
};
