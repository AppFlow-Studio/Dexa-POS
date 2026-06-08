import { formatUsPhone, normalizeUsPhoneDigits } from "@/lib/phone";

describe("formatUsPhone", () => {
  it("returns empty for blank input", () => {
    expect(formatUsPhone("")).toBe("");
  });

  it("opens with paren after first digit", () => {
    expect(formatUsPhone("5")).toBe("(5");
  });

  it("formats area-code-only", () => {
    expect(formatUsPhone("555")).toBe("(555");
  });

  it("transitions to exchange after 3rd digit", () => {
    expect(formatUsPhone("5551")).toBe("(555) 1");
  });

  it("formats full exchange", () => {
    expect(formatUsPhone("555123")).toBe("(555) 123");
  });

  it("inserts dash for subscriber digits", () => {
    expect(formatUsPhone("5551234")).toBe("(555) 123-4");
  });

  it("formats full 10-digit number", () => {
    expect(formatUsPhone("5551234567")).toBe("(555) 123-4567");
  });

  it("strips US country code prefix", () => {
    expect(formatUsPhone("15551234567")).toBe("(555) 123-4567");
  });

  it("ignores characters that are not digits", () => {
    expect(formatUsPhone("(555) abc 1234567")).toBe("(555) 123-4567");
  });

  it("caps at 10 digits", () => {
    expect(formatUsPhone("55512345678901")).toBe("(555) 123-4567");
  });
});

describe("normalizeUsPhoneDigits", () => {
  it("returns empty for null/undefined", () => {
    expect(normalizeUsPhoneDigits(undefined)).toBe("");
    expect(normalizeUsPhoneDigits(null)).toBe("");
  });

  it("strips all formatting", () => {
    expect(normalizeUsPhoneDigits("(555) 123-4567")).toBe("5551234567");
  });

  it("drops leading 1 when 11 digits", () => {
    expect(normalizeUsPhoneDigits("1-555-123-4567")).toBe("5551234567");
  });

  it("caps at 10 digits when no country code", () => {
    expect(normalizeUsPhoneDigits("55512345678901")).toBe("5551234567");
  });
});
