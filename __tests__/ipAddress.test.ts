import { sanitizeIpAddress } from "@/lib/network/ipAddress";

describe("sanitizeIpAddress", () => {
  it("accepts normal LAN IPv4 addresses", () => {
    expect(sanitizeIpAddress("192.168.1.60")).toBe("192.168.1.60");
    expect(sanitizeIpAddress("10.0.2.16")).toBe("10.0.2.16");
    expect(sanitizeIpAddress("192.168.46.181")).toBe("192.168.46.181");
    expect(sanitizeIpAddress("8.8.8.8")).toBe("8.8.8.8");
  });

  it("trims surrounding whitespace", () => {
    expect(sanitizeIpAddress("  192.168.1.10  ")).toBe("192.168.1.10");
  });

  it("normalizes leading zeros in octets", () => {
    expect(sanitizeIpAddress("192.168.001.001")).toBe("192.168.1.1");
  });

  // The core bug this fix exists for: Android emits 0.0.0.0 before Wi-Fi/DHCP
  // settle, and the old format-only regex let it through.
  it("rejects 0.0.0.0 (unspecified)", () => {
    expect(sanitizeIpAddress("0.0.0.0")).toBeNull();
  });

  it("rejects out-of-range octets", () => {
    expect(sanitizeIpAddress("999.1.1.1")).toBeNull();
    expect(sanitizeIpAddress("256.256.256.256")).toBeNull();
    expect(sanitizeIpAddress("192.168.1.300")).toBeNull();
  });

  it("rejects loopback and link-local IPv4", () => {
    expect(sanitizeIpAddress("127.0.0.1")).toBeNull();
    expect(sanitizeIpAddress("127.1.2.3")).toBeNull();
    expect(sanitizeIpAddress("169.254.10.20")).toBeNull(); // no DHCP lease
  });

  it("rejects empty / nullish input", () => {
    expect(sanitizeIpAddress(null)).toBeNull();
    expect(sanitizeIpAddress(undefined)).toBeNull();
    expect(sanitizeIpAddress("")).toBeNull();
    expect(sanitizeIpAddress("   ")).toBeNull();
  });

  it("rejects malformed strings", () => {
    expect(sanitizeIpAddress("not-an-ip")).toBeNull();
    expect(sanitizeIpAddress("192.168.1")).toBeNull();
    expect(sanitizeIpAddress("192.168.1.1.1")).toBeNull();
  });

  it("handles IPv6: accepts routable full-form, rejects loopback/unspecified/link-local", () => {
    expect(sanitizeIpAddress("2001:0db8:0000:0000:0000:0000:0000:0001")).toBe(
      "2001:0db8:0000:0000:0000:0000:0000:0001",
    );
    expect(sanitizeIpAddress("::")).toBeNull();
    expect(sanitizeIpAddress("::1")).toBeNull();
    expect(sanitizeIpAddress("0:0:0:0:0:0:0:0")).toBeNull();
    expect(sanitizeIpAddress("0:0:0:0:0:0:0:1")).toBeNull();
    expect(sanitizeIpAddress("fe80:0:0:0:0:0:0:1")).toBeNull(); // link-local
  });
});
