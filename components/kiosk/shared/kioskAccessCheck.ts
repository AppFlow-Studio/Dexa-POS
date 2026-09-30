import { refreshSelectedStationOperationalState } from "@/services/posAccessService";

export type KioskAccessVerdict =
  | { ok: true }
  | { ok: false; title: string; message: string };

type Supabase = Parameters<typeof refreshSelectedStationOperationalState>[0];

/**
 * A pass this recent lets the next session start without asking again. Between
 * customers the answer (billing, station still active) almost never changes,
 * and checkout asks again before it creates an order and before it charges.
 */
const PASS_TTL_MS = 2 * 60_000;
let lastPassAt = 0;

/**
 * The kiosk's start check: is this station still allowed to take orders?
 *
 * It no longer holds up "Tap to start". app/(main)/kiosk.tsx starts it on the
 * tap and shows the order-type screen straight away; the template awaits the
 * verdict before revealing the menu (useKioskOrderTypeStep), so the round trip
 * overlaps the second or two the customer spends choosing. Resolves, never
 * rejects: a network failure is a failed check, as it was before.
 */
export async function checkKioskAccess(
  supabase: Supabase,
): Promise<KioskAccessVerdict> {
  if (Date.now() - lastPassAt < PASS_TTL_MS) return { ok: true };
  try {
    const access = await refreshSelectedStationOperationalState(supabase);
    if (!access.valid) {
      return {
        ok: false,
        title: access.failure.title,
        message: access.failure.message,
      };
    }
    lastPassAt = Date.now();
    return { ok: true };
  } catch {
    return {
      ok: false,
      title: "Kiosk unavailable",
      message: "Could not verify kiosk access. Please see a staff member.",
    };
  }
}
