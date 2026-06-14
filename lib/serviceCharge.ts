import type { TableSession } from "@/types/db-floor-plan-types";

export const isServiceChargeEnabled =
  process.env.EXPO_PUBLIC_SERVICE_CHARGE_ENABLED !== "0";

export function resolvePartySize(
  session: TableSession | null | undefined,
): number | null {
  if (!session) return null;
  return session.party_size ?? null;
}
