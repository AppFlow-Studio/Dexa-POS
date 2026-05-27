import type {
  KioskCartModifier,
  KioskModifierGroup,
} from "@/components/kiosk/types";
import { useKioskTheme } from "@/contexts/kiosk/KioskThemeProvider";
import React from "react";
import { Pressable, Text, View } from "react-native";

export function ModifierSelector({
  group,
  selected,
  onChange,
}: {
  group: KioskModifierGroup;
  selected: KioskCartModifier[];
  onChange: (modifiers: KioskCartModifier[]) => void;
}) {
  const theme = useKioskTheme();
  const selectedIds = new Set(selected.map((modifier) => modifier.optionId));

  const toggle = (optionId: string) => {
    const option = group.options.find((candidate) => candidate.id === optionId);
    if (!option) return;
    if (selectedIds.has(optionId)) {
      onChange(selected.filter((modifier) => modifier.optionId !== optionId));
      return;
    }
    const nextOption = {
      groupId: group.id,
      groupName: group.name,
      optionId: option.id,
      optionName: option.name,
      price: option.price,
    };
    if (group.maxAllowed <= 1) {
      onChange([nextOption]);
      return;
    }
    if (selected.length >= group.maxAllowed) return;
    onChange([...selected, nextOption]);
  };

  return (
    <View
      style={{
        gap: 12,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: `${theme.textColor}12`,
        backgroundColor: `${theme.textColor}05`,
        padding: 14,
      }}
    >
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <Text
          style={{ color: theme.textColor, fontSize: 18, fontWeight: "900" }}
        >
          {group.name}
        </Text>
        <Text
          style={{
            color: `${theme.textColor}AA`,
            fontSize: 12,
            fontWeight: "800",
          }}
        >
          Choose {group.minRequired}
          {group.maxAllowed !== group.minRequired ? `-${group.maxAllowed}` : ""}
        </Text>
      </View>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
        {group.options.map((option) => {
          const active = selectedIds.has(option.id);
          return (
            <Pressable
              key={option.id}
              disabled={!option.isAvailable}
              onPress={() => toggle(option.id)}
              style={{
                minHeight: 48,
                flexBasis: "47%",
                flexGrow: 1,
                borderRadius: 8,
                borderWidth: 1,
                borderColor: active
                  ? theme.primaryColor
                  : `${theme.textColor}14`,
                backgroundColor: active
                  ? `${theme.primaryColor}14`
                  : theme.backgroundColor,
                paddingHorizontal: 14,
                paddingVertical: 8,
                justifyContent: "center",
                opacity: option.isAvailable ? 1 : 0.45,
                elevation: active ? 2 : 0,
              }}
            >
              <Text style={{ color: theme.textColor, fontWeight: "900" }}>
                {option.name}
              </Text>
              {option.price > 0 ? (
                <Text style={{ color: `${theme.textColor}AA`, fontSize: 12 }}>
                  +${option.price.toFixed(2)}
                </Text>
              ) : null}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
