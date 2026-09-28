import { KIOSK_ORDER_TYPE_ENTRANCE_MS } from "@/components/kiosk/shared/KioskOrderTypeScreen";
import type { KioskOrderType } from "@/stores/useKioskCartStore";
import { startTransition, useCallback, useEffect, useState } from "react";

/**
 * The session's first step (Dine In / Takeaway), with the menu built behind it.
 *
 * Choosing an order type used to be the moment the whole ordering screen
 * mounted: header, category rail and item grid, all in the frames after the
 * tap. On a low-end tablet that read as a freeze on the tile. The customer
 * spends a second or two reading this screen anyway, so the menu is built
 * then. Once the screen's entrance has played, `menuMounted` turns on inside a
 * transition (interruptible, so a tap still lands promptly), and the template
 * mounts its ordering screen underneath, hidden. The tap then only swaps which
 * layer shows.
 *
 * A tap that beats the prebuild finishes it in the same transition: the
 * order-type screen stays up, with the chosen tile marked, until the menu has
 * committed. There is never a blank frame in between.
 *
 * `ensureAccess` is the kiosk's start check (app/(main)/kiosk.tsx). It runs
 * while the customer reads this screen and is awaited here, so nobody reaches
 * the menu on a kiosk that failed it.
 */
export function useKioskOrderTypeStep({
  active,
  onChosen,
  ensureAccess,
}: {
  /** The order-type screen is the one showing. */
  active: boolean;
  /** Store the choice and move to the menu. */
  onChosen: (type: KioskOrderType) => void;
  ensureAccess?: () => Promise<boolean>;
}) {
  const [menuMounted, setMenuMounted] = useState(false);
  const [pendingType, setPendingType] = useState<KioskOrderType | null>(null);

  useEffect(() => {
    if (!active || menuMounted) return;
    const timer = setTimeout(
      () => startTransition(() => setMenuMounted(true)),
      KIOSK_ORDER_TYPE_ENTRANCE_MS,
    );
    return () => clearTimeout(timer);
  }, [active, menuMounted]);

  const choose = useCallback(
    async (type: KioskOrderType) => {
      setPendingType(type);
      // A failed check has already sent the kiosk back to attract.
      if (ensureAccess && !(await ensureAccess())) return;
      // One transition whether or not the prebuild has committed: if it has,
      // this is only the layer swap; if it hasn't, React finishes the menu
      // first and keeps the order-type screen up until it can show it.
      startTransition(() => {
        setMenuMounted(true);
        onChosen(type);
      });
    },
    [ensureAccess, onChosen],
  );

  return { menuMounted, pendingType, choose };
}
