import { ModifierStockToggle } from "@/components/menu/ModifierStockToggle";
import { isActivelySnoozed } from "@/lib/snoozeDurations";
import { colors } from "@/lib/theme";
import { ModifierCategory } from "@/lib/types";
import { useUiScale } from "@/lib/uiScale";
import { useStoreSettingsStore } from "@/stores/useStoreSettingsStore";
import { Text, View } from "react-native";

/**
 * Per-location "86" (out of stock) controls for an item's modifier groups /
 * options, rendered inside the full item editor (ItemForm). Mirrors the modifier
 * section of PriceEditBottomSheet so single-location merchants — who are routed
 * to the full editor instead of the lightweight price sheet — can also mark
 * modifier options out of stock. Uses the self-contained ModifierStockToggle
 * (binary "infinity" toggle, same as edit-modifier.tsx).
 *
 * Renders nothing when there's no selected store (the 86 write is per-location)
 * or when the item has no modifier groups with options.
 */
export function ItemModifierStockSection({
  groups,
}: {
  groups: ModifierCategory[];
}) {
  const uiScale = useUiScale();
  const s = (n: number) => Math.round(n * uiScale);
  const selectedStore = useStoreSettingsStore((st) => st.selectedStore);

  const withOptions = groups.filter(
    (g) => Array.isArray(g.options) && g.options.length > 0,
  );

  if (!selectedStore?.id || withOptions.length === 0) return null;

  return (
    <View style={{ marginTop: s(14), gap: s(8) }}>
      <Text
        style={{
          fontSize: s(11),
          fontWeight: "600",
          color: colors.muted,
          textTransform: "uppercase",
          letterSpacing: 0.5,
        }}
      >
        Modifier Availability (86)
      </Text>
      {withOptions.map((group) => {
        const optionIds = group.options.map((o) => o.id);
        const snoozedCount = group.options.filter((o) =>
          isActivelySnoozed(o.snoozedUntil),
        ).length;
        const groupOutOfStock = snoozedCount === group.options.length;
        return (
          <View
            key={group.id}
            style={{
              backgroundColor: colors.screen,
              borderRadius: s(8),
              borderWidth: 1,
              borderColor: colors.border,
              padding: s(10),
            }}
          >
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: s(8),
                gap: s(8),
              }}
            >
              <Text
                style={{
                  fontSize: s(13),
                  fontWeight: "700",
                  color: colors.heading,
                  flex: 1,
                }}
                numberOfLines={1}
              >
                {group.name}
              </Text>
              <ModifierStockToggle
                target={{ kind: "group", groupId: group.id, optionIds }}
                isOutOfStock={groupOutOfStock}
                showLabel
              />
            </View>
            {group.options.map((o) => (
              <View
                key={o.id}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  paddingVertical: s(4),
                  gap: s(8),
                }}
              >
                <Text
                  style={{
                    fontSize: s(12),
                    color: colors.heading,
                    opacity: isActivelySnoozed(o.snoozedUntil) ? 0.6 : 1,
                    flex: 1,
                  }}
                  numberOfLines={1}
                >
                  {o.name}
                  {o.price > 0 && (
                    <Text style={{ color: colors.teal }}>
                      {"  +"}${o.price.toFixed(2)}
                    </Text>
                  )}
                </Text>
                <ModifierStockToggle
                  target={{ kind: "option", optionId: o.id }}
                  isOutOfStock={isActivelySnoozed(o.snoozedUntil)}
                  showLabel
                />
              </View>
            ))}
          </View>
        );
      })}
    </View>
  );
}

export default ItemModifierStockSection;
