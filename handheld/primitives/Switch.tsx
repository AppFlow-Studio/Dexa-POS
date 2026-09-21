import { colors } from "@/lib/theme";
import React from "react";
import { Pressable, Text, View } from "react-native";
import { type } from "../lib/type";

/** The artifact's `.sw`: a 52x32 pill with a 24dp knob that slides right when on. */
export function Switch({
  value,
  onChange,
  label,
}: {
  value: boolean;
  onChange: (next: boolean) => void;
  label: string;
}) {
  return (
    <Pressable
      onPress={() => onChange(!value)}
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityState={{ checked: value }}
      hitSlop={8}
      className="justify-center rounded-full"
      style={{ width: 52, height: 32, backgroundColor: value ? colors.teal : colors.card }}
    >
      <View
        className="h-6 w-6 rounded-full"
        style={{
          marginLeft: value ? 24 : 4,
          backgroundColor: value ? colors.onSolid : colors.label,
        }}
      />
    </Pressable>
  );
}

/** The artifact's `.swrow`: a 64dp row with a label and the switch on the right. */
export function SwitchRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <View className="flex-row items-center gap-3.5 px-5" style={{ minHeight: 64 }}>
      <Text className="flex-1" style={[type.row, { fontWeight: "400", color: colors.heading }]}>
        {label}
      </Text>
      <Switch value={value} onChange={onChange} label={label} />
    </View>
  );
}
