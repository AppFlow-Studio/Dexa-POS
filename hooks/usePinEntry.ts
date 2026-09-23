import { useCallback, useEffect, useRef, useState } from "react";

import type { NumpadInput } from "@/components/auth/PinNumpad";

/**
 * PIN entry state for a PinNumpad — the one place digit handling lives.
 *
 * The entered digits are kept in a ref that every key press reads and writes
 * synchronously; `pin` state only mirrors it for rendering. Handlers that read
 * render-time state break under fast typing on a slow device, because several
 * taps land before the next render:
 * - `if (pin.length < 4) setPin(prev => prev + d)` checks a stale length but
 *   appends to the latest value, so the PIN grows past 4 digits (Sign In stays
 *   disabled until the user backspaces the invisible extra digit);
 * - `setPin(pin + d)` builds from a stale value, so digits are dropped.
 *
 * `onKeyPress` is stable, so a memoized PinNumpad doesn't re-render per digit.
 * `onComplete` fires once, with the full PIN, on the key that completes it.
 */
export function usePinEntry({
  length = 4,
  onComplete,
  disabled = false,
}: {
  length?: number;
  onComplete?: (pin: string) => void;
  /** Ignore key presses (e.g. while a submitted PIN is being verified). */
  disabled?: boolean;
} = {}) {
  const [pin, setPinState] = useState("");
  const pinRef = useRef("");
  const onCompleteRef = useRef(onComplete);
  const disabledRef = useRef(disabled);
  useEffect(() => {
    onCompleteRef.current = onComplete;
    disabledRef.current = disabled;
  });

  /** Replace the PIN (e.g. clear it after a failed attempt). */
  const setPin = useCallback((next: string) => {
    pinRef.current = next;
    setPinState(next);
  }, []);

  const onKeyPress = useCallback(
    (input: NumpadInput) => {
      if (disabledRef.current) return;
      const prev = pinRef.current;
      if (typeof input === "number") {
        if (prev.length >= length) return;
        const next = prev + String(input);
        setPin(next);
        if (next.length === length) onCompleteRef.current?.(next);
      } else if (input === "backspace") {
        if (prev.length > 0) setPin(prev.slice(0, -1));
      } else if (input === "clear") {
        if (prev.length > 0) setPin("");
      }
    },
    [length, setPin],
  );

  return { pin, setPin, onKeyPress };
}
