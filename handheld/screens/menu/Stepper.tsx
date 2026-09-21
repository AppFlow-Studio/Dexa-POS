import { colors } from "@/lib/theme";
import { Minus, Plus } from "lucide-react-native";
import React from "react";
import { Pressable, Text, View } from "react-native";
import { type } from "../../lib/type";

function StepKey({ label, icon, onPress }: { label: string; icon: React.ReactNode; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      className="h-10 w-10 items-center justify-center rounded-full"
    >
      {icon}
    </Pressable>
  );
}

/** The artifact's `.stp`: a 48dp pill with 40dp minus / plus discs around the count. */
export function Stepper({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <View className="flex-row items-center rounded-full px-1" style={{ minHeight: 48, backgroundColor: colors.card }}>
      <StepKey label="Fewer" icon={<Minus size={20} color={colors.teal} strokeWidth={2.2} />} onPress={() => onChange(value - 1)} />
      <Text className="text-center" style={[type.tile, { minWidth: 28, color: colors.heading }]}>
        {value}
      </Text>
      <StepKey label="More" icon={<Plus size={20} color={colors.teal} strokeWidth={2.2} />} onPress={() => onChange(value + 1)} />
    </View>
  );
}

/** The "Quantity" line the options sheet and the item sheet share. */
export function QuantityRow({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <View className="flex-row items-center justify-between px-5">
      <Text style={[type.row, { fontWeight: "400", color: colors.heading }]}>Quantity</Text>
      <Stepper value={value} onChange={onChange} />
    </View>
  );
}
