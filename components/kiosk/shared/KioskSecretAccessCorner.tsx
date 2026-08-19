import { useEffect, useRef, useState } from "react";
import { Pressable, View } from "react-native";

/**
 * Invisible "secret" admin-access target in the TOP-LEFT corner of the attract
 * screen. Tap it 5 times (each within 1.5s of the last) to open the manager-PIN
 * gate → Kiosk Settings / Diagnostics.
 *
 * Must be rendered as a TOP-LEVEL sibling that paints last (on top) — NOT nested
 * inside the "tap anywhere to start" Pressable — so it always captures its own
 * taps and a tap here can never start an order.
 *
 * After the 2nd tap it shows faint progress dots so a manager can SEE the taps
 * registering (a single accidental tap stays invisible). The 2s long-press it
 * replaces was unreliable — a slight finger move cancelled it.
 */
const REQUIRED_TAPS = 5;
const GAP_MS = 1500; // max gap between taps before the count resets
const HIT_SIZE = 120;

export function KioskSecretAccessCorner({
  onTrigger,
  tint = "#94a3b8",
}: {
  onTrigger: () => void;
  /** Hex color (no alpha) for the progress dots — pass a themed color. */
  tint?: string;
}) {
  const [count, setCount] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const handleTap = () => {
    if (timer.current) clearTimeout(timer.current);
    setCount((c) => {
      const next = c + 1;
      if (next >= REQUIRED_TAPS) {
        onTrigger();
        return 0;
      }
      return next;
    });
    timer.current = setTimeout(() => setCount(0), GAP_MS);
  };

  return (
    <Pressable
      onPress={handleTap}
      android_disableSound
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        width: HIT_SIZE,
        height: HIT_SIZE,
        zIndex: 50,
        padding: 14,
      }}
    >
      {count > 1 ? (
        <View style={{ flexDirection: "row", gap: 5 }}>
          {Array.from({ length: REQUIRED_TAPS }).map((_, i) => (
            <View
              key={i}
              style={{
                width: 8,
                height: 8,
                borderRadius: 999,
                backgroundColor: i < count ? tint : `${tint}40`,
              }}
            />
          ))}
        </View>
      ) : null}
    </Pressable>
  );
}
