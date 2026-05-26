import * as Crypto from "expo-crypto";
import { compare } from "bcryptjs";

export type KioskPinCheckResult = "match" | "no_match" | "unsupported_hash";

export async function verifyKioskAdminPin(
  pin: string,
  storedHash: string | null | undefined,
): Promise<KioskPinCheckResult> {
  const trimmedPin = pin.trim();
  if (!trimmedPin || !storedHash) return "no_match";

  if (storedHash.startsWith("sha256:")) {
    const digest = await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      trimmedPin,
    );
    return `sha256:${digest}` === storedHash ? "match" : "no_match";
  }

  if (storedHash.startsWith("plain:")) {
    return storedHash.slice("plain:".length) === trimmedPin ? "match" : "no_match";
  }

  if (storedHash.startsWith("$2a$") || storedHash.startsWith("$2b$") || storedHash.startsWith("$2y$")) {
    return (await compare(trimmedPin, storedHash)) ? "match" : "no_match";
  }

  if (__DEV__) {
    return storedHash === trimmedPin ? "match" : "no_match";
  }

  return "no_match";
}
