import { useSupabaseClient } from "@/hooks/useSupabaseClient";
import { SNOOZE_INFINITY } from "@/lib/snoozeDurations";
import { colors } from "@/lib/theme";
import { useUiScale } from "@/lib/uiScale";
import { MenuService } from "@/services/menuService";
import { useMenuStore } from "@/stores/useMenuStore";
import { useStoreSettingsStore } from "@/stores/useStoreSettingsStore";
import { Ban, Check } from "lucide-react-native";
import { useState } from "react";
import { ActivityIndicator, Text, TouchableOpacity } from "react-native";

/**
 * What this toggle 86s: a single modifier option, or an entire group (all
 * options). Group snooze uses set_modifier_group_snooze_v1 with a per-option
 * loop fallback if that RPC isn't deployed yet.
 */
export type ModifierStockTarget =
  | { kind: "option"; optionId: string }
  | { kind: "group"; groupId: string; optionIds: string[] };

interface ModifierStockToggleProps {
  target: ModifierStockTarget;
  /** Current out-of-stock (86'd) state, derived by the parent from store data. */
  isOutOfStock: boolean;
  /** Show a text label ("In stock" / "Out of stock") beside the icon. */
  showLabel?: boolean;
  size?: number;
}

/**
 * Binary per-location 86 toggle for modifier options / groups (mirrors the
 * website's ModifierStockToggle — infinity only, no timed durations).
 */
export function ModifierStockToggle({
  target,
  isOutOfStock,
  showLabel = false,
  size = 15,
}: ModifierStockToggleProps) {
  const uiScale = useUiScale();
  const s = (n: number) => Math.round(n * uiScale);
  const supabase = useSupabaseClient();
  const selectedStore = useStoreSettingsStore((s) => s.selectedStore);
  const snoozeModifierOption = useMenuStore((s) => s.snoozeModifierOption);
  const unsnoozeModifierOption = useMenuStore((s) => s.unsnoozeModifierOption);
  const snoozeModifierGroup = useMenuStore((s) => s.snoozeModifierGroup);
  const unsnoozeModifierGroup = useMenuStore((s) => s.unsnoozeModifierGroup);
  const [isLoading, setIsLoading] = useState(false);

  const locationId = selectedStore?.id;

  const handleToggle = async () => {
    if (!locationId || isLoading) return;
    const makeOutOfStock = !isOutOfStock;
    const snoozedUntil = makeOutOfStock ? SNOOZE_INFINITY : null;

    setIsLoading(true);

    // Optimistic store update.
    if (target.kind === "option") {
      if (makeOutOfStock)
        snoozeModifierOption(target.optionId, SNOOZE_INFINITY);
      else unsnoozeModifierOption(target.optionId);
    } else {
      if (makeOutOfStock) snoozeModifierGroup(target.groupId, SNOOZE_INFINITY);
      else unsnoozeModifierGroup(target.groupId);
    }

    try {
      let error: any = null;
      if (target.kind === "option") {
        ({ error } = await MenuService.setModifierSnooze(supabase, {
          locationId,
          modifierGroupItemId: target.optionId,
          snoozedUntil,
        }));
      } else {
        const res = await MenuService.setModifierGroupSnooze(supabase, {
          locationId,
          modifierGroupId: target.groupId,
          snoozedUntil,
        });
        // Fallback: group RPC may not be deployed — snooze each option directly.
        if (res.error) {
          const results = await Promise.all(
            target.optionIds.map((id) =>
              MenuService.setModifierSnooze(supabase, {
                locationId,
                modifierGroupItemId: id,
                snoozedUntil,
              }),
            ),
          );
          error = results.find((r) => r.error)?.error ?? null;
        }
      }

      if (error) {
        // Roll back the optimistic update.
        if (target.kind === "option") {
          if (makeOutOfStock) unsnoozeModifierOption(target.optionId);
          else snoozeModifierOption(target.optionId, SNOOZE_INFINITY);
        } else {
          if (makeOutOfStock) unsnoozeModifierGroup(target.groupId);
          else snoozeModifierGroup(target.groupId, SNOOZE_INFINITY);
        }
      }
      // On success: no triggerPosSync. The optimistic store patch above is the
      // local source of truth; invalidating pos_sync rebuilds the whole menu
      // and races/clobbers the just-applied 86. OrderOut/online propagation is
      // handled server-side by the snooze DB trigger (trg_*_snooze_resync).
    } finally {
      setIsLoading(false);
    }
  };

  const Icon = isOutOfStock ? Ban : Check;
  const accent = isOutOfStock ? colors.danger : colors.success;

  return (
    <TouchableOpacity
      onPress={handleToggle}
      disabled={!locationId || isLoading}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: s(5),
        paddingHorizontal: showLabel ? s(8) : s(6),
        paddingVertical: s(5),
        borderRadius: s(6),
        backgroundColor: accent + "18",
        borderWidth: 1,
        borderColor: accent + "35",
        opacity: !locationId ? 0.4 : 1,
      }}
    >
      {isLoading ? (
        <ActivityIndicator size="small" color={accent} />
      ) : (
        <Icon size={size} color={accent} />
      )}
      {showLabel && (
        <Text style={{ fontSize: s(11), fontWeight: "600", color: accent }}>
          {isOutOfStock ? "Out of stock" : "In stock"}
        </Text>
      )}
    </TouchableOpacity>
  );
}

export default ModifierStockToggle;
