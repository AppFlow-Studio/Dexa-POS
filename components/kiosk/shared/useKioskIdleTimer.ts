import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Shared idle/inactivity timer for kiosk ordering flows.
 *
 * In BOTH states we always show an "Are you still there?" confirmation before
 * returning to the attract screen — the customer is never kicked out silently.
 * Only the inactivity threshold differs by how much there is to lose:
 *  - No active cart/order: warn after `idleTimeoutSeconds` of inactivity.
 *  - Active cart/order: warn sooner, after `cartResetTimeoutSeconds`.
 *
 * Once the warning shows, the customer has a `cartResetTimeoutSeconds` grace
 * window (a live countdown) to tap "Yes, I'm still here". If they don't
 * respond, the kiosk resets to attract.
 *
 * Call `registerActivity()` on any touch to keep the session alive / dismiss
 * the warning.
 */
export function useKioskIdleTimer({
  idleTimeoutSeconds,
  cartResetTimeoutSeconds,
  hasActiveCart,
  onReset,
}: {
  idleTimeoutSeconds: number;
  cartResetTimeoutSeconds: number;
  hasActiveCart: boolean;
  onReset: () => void;
}) {
  const [showWarning, setShowWarning] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(cartResetTimeoutSeconds);
  const lastActivityRef = useRef(Date.now());

  const registerActivity = useCallback(() => {
    lastActivityRef.current = Date.now();
    setShowWarning(false);
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      const elapsedSeconds = (Date.now() - lastActivityRef.current) / 1000;

      // Threshold to warn depends on whether there's an order to protect: an
      // active cart warns sooner. The grace/countdown window before the reset
      // is `cartResetTimeoutSeconds` in either case.
      const warnAfter = hasActiveCart
        ? cartResetTimeoutSeconds
        : idleTimeoutSeconds;
      const resetAfter = warnAfter + cartResetTimeoutSeconds;

      if (elapsedSeconds >= resetAfter) {
        onReset();
        return;
      }

      if (elapsedSeconds >= warnAfter) {
        setShowWarning(true);
        setSecondsLeft(Math.max(0, Math.ceil(resetAfter - elapsedSeconds)));
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [hasActiveCart, idleTimeoutSeconds, cartResetTimeoutSeconds, onReset]);

  return { registerActivity, showWarning, secondsLeft };
}
