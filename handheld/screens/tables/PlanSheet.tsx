import { colors } from "@/lib/theme";
import { Check } from "lucide-react-native";
import React from "react";
import { View } from "react-native";
import { BottomSheet, ListRow, type Chip } from "../../primitives";

/**
 * "Show tables from": the location's plans (named as the restaurant named
 * them, never "floors" on screen) plus All. Replaces a chip row that cost
 * 50dp under the segments on every Tables visit.
 */
export function PlanSheet({
  plans,
  active,
  onPick,
  onClose,
}: {
  plans: readonly Chip[];
  active: string;
  onPick: (key: string) => void;
  onClose: () => void;
}) {
  return (
    <BottomSheet visible onClose={onClose} title="Show tables from">
      <View className="pb-2">
        {plans.map((plan, i) => (
          <ListRow
            key={plan.key}
            title={plan.label}
            divider={i > 0}
            right={plan.key === active ? <Check size={22} color={colors.teal} strokeWidth={2.4} /> : undefined}
            onPress={() => {
              onPick(plan.key);
              onClose();
            }}
          />
        ))}
      </View>
    </BottomSheet>
  );
}
