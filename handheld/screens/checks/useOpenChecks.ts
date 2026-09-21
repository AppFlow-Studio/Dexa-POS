import { useEmployeeStore } from "@/stores/useEmployeeStore";
import { useOrderStore } from "@/stores/useOrderStore";
import { useMemo } from "react";
import { isOpenCheck, openedAtMs } from "../../lib/openChecks";

export type ChecksScope = "mine" | "all";

/**
 * Open checks from the shared order store, newest first, split into the
 * signed-in server's own checks ("Mine") and the whole location ("All" —
 * possible because a handheld station has view_scope = 'location').
 * `ordersById` is the one broad subscription here; rows subscribe narrowly.
 */
export function useOpenChecks(): { mine: string[]; all: string[] } {
  const ordersById = useOrderStore((s) => s.ordersById);
  const myProfileId = useEmployeeStore(
    (s) => s.loggedInEmployee?.profileId ?? null,
  );

  return useMemo(() => {
    const open = Object.values(ordersById).filter(isOpenCheck);
    open.sort((a, b) => openedAtMs(b) - openedAtMs(a));
    const all = open.map((o) => o.id);
    const mine = myProfileId
      ? open
          .filter((o) => o.created_by_staff_profile_id === myProfileId)
          .map((o) => o.id)
      : [];
    return { mine, all };
  }, [ordersById, myProfileId]);
}
