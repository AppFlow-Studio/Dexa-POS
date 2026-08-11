import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Shared idle/inactivity timer for kiosk ordering flows.
 *
 * Two behaviors depending on whether the customer has anything to lose:
 *  - No active cart/order: after `idleTimeoutSeconds` of inactivity, reset
 *    straight to idle (nothing to confirm).
 *  - Active cart/order: after `cartResetTimeoutSeconds` of inactivity, show
 *    an "Are you still there?" warning with a countdown. If the customer
 *    doesn't respond within another `cartResetTimeoutSeconds`, reset.
 *
 * Call `registerActivity()` on any touch to keep the session alive.
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

      if (!hasActiveCart) {
        if (elapsedSeconds >= idleTimeoutSeconds) {
          onReset();
        }
        return;
      }

      if (elapsedSeconds >= cartResetTimeoutSeconds * 2) {
        onReset();
        return;
      }

      if (elapsedSeconds >= cartResetTimeoutSeconds) {
        setShowWarning(true);
        setSecondsLeft(
          Math.max(0, Math.ceil(cartResetTimeoutSeconds * 2 - elapsedSeconds)),
        );
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [hasActiveCart, idleTimeoutSeconds, cartResetTimeoutSeconds, onReset]);

  return { registerActivity, showWarning, secondsLeft };
}
