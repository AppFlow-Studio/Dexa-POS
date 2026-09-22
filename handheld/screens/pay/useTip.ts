import { round2 } from "@/utils/money";
import { useCallback, useMemo, useState } from "react";
import { chargeTotal, tipPresets, type TipPreset } from "../../lib/payments";

export type TipChoice =
  /** Nothing chosen yet — the state the screen opens in. */
  | { kind: "unset" }
  | { kind: "preset"; percent: number }
  | { kind: "custom"; amount: number }
  | { kind: "none" };

/**
 * Screen 7's state: which tip is chosen, what it is worth, and what the card
 * will be charged.
 *
 * **Nothing is preselected.** The artifact draws the middle preset already
 * highlighted, and this deliberately departs from it: a pre-selected tip on a
 * guest-facing screen decides for the guest. They arrive with no card lit and
 * choose.
 *
 * Continuing without choosing is allowed and means no tip, so a guest is
 * never trapped on this screen. "No tip" therefore does not change the total
 * — it makes the same outcome explicit, and lights up so the guest can see
 * their choice registered.
 *
 * `base` is the balance due. Presets round with `round2` rather than the
 * register's bare `toFixed(2)` display, so the tip that is charged is exactly
 * the tip the guest was shown (see `lib/payments.ts`).
 */
export function useTip(base: number) {
  const presets: TipPreset[] = useMemo(() => tipPresets(base), [base]);
  const [choice, setChoice] = useState<TipChoice>({ kind: "unset" });

  const tip = useMemo(() => {
    if (choice.kind === "unset" || choice.kind === "none") return 0;
    if (choice.kind === "custom") return round2(choice.amount);
    const hit = presets.find((p) => p.percent === choice.percent);
    return hit ? hit.amount : 0;
  }, [choice, presets]);

  const total = useMemo(() => chargeTotal(base, tip), [base, tip]);

  const selectPreset = useCallback(
    (percent: number) => setChoice({ kind: "preset", percent }),
    [],
  );
  const selectCustom = useCallback(
    (amount: number) => setChoice({ kind: "custom", amount }),
    [],
  );
  const selectNone = useCallback(() => setChoice({ kind: "none" }), []);

  return {
    presets,
    choice,
    tip,
    total,
    selectPreset,
    selectCustom,
    selectNone,
    isPreset: (percent: number) => choice.kind === "preset" && choice.percent === percent,
    isCustom: choice.kind === "custom",
    isNone: choice.kind === "none",
  };
}
