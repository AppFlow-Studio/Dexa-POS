import { colors } from "@/lib/theme";
import type { ModifierCategory } from "@/lib/types";
import type { ModifierSelection } from "@/stores/useModifierSelectionStore";
import React from "react";
import { Text, View } from "react-native";
import { tint } from "../../lib/tokens";
import { type } from "../../lib/type";
import { OptionRow } from "./OptionRow";

/** "Choose 1" / "Choose any" / "Up to 3", the register's wording. */
function ruleLabel(group: ModifierCategory): string {
  if (group.selectionType === "single") return "Choose 1";
  return group.maxSelections ? `Up to ${group.maxSelections}` : "Choose any";
}

/** The artifact's `.grp` header (title, rule, Required pill) over its `.opt` rows. */
export function OptionGroup({
  group,
  selection,
  error,
  onToggle,
}: {
  group: ModifierCategory;
  selection: ModifierSelection[string] | undefined;
  /** Required and still empty after Add was tapped: title and pill turn red. */
  error: boolean;
  onToggle: (optionId: string) => void;
}) {
  const required = group.type === "required";
  const multiple = group.selectionType === "multiple";
  const accent = error ? colors.danger : colors.label;
  return (
    <View>
      <View className="flex-row items-center justify-between gap-3 px-5 pb-2 pt-6">
        <View className="min-w-0 flex-1">
          <Text style={[type.cardTitle, { fontSize: 18, color: error ? colors.danger : colors.heading }]}>
            {group.name}
          </Text>
          <Text className="mt-0.5" style={[type.detail, { color: colors.label }]}>
            {ruleLabel(group)}
          </Text>
        </View>
        {required ? (
          <View
            className="justify-center rounded-full px-3"
            style={{ minHeight: 28, backgroundColor: error ? tint.errSoft : colors.card }}
          >
            <Text style={[type.chip, { color: accent }]}>Required</Text>
          </View>
        ) : null}
      </View>
      {group.options.map((option, i) => (
        <OptionRow
          key={option.id}
          option={option}
          selected={selection?.[option.id] === true}
          multiple={multiple}
          divider={i > 0}
          onPress={() => onToggle(option.id)}
        />
      ))}
    </View>
  );
}
