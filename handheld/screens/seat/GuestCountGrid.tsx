import { colors } from "@/lib/theme";
import React from "react";
import { Pressable, Text, View } from "react-native";
import { type } from "../../lib/type";

const ROWS = [
  [1, 2, 3, 4],
  [5, 6, 7, 8],
] as const;

/** The artifact's `.gg`: a 4 x 2 grid of 64dp keys, 1–7 and "8+", the pick solid. */
export function GuestCountGrid({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <View className="gap-2.5 px-4">
      {ROWS.map((row) => (
        <View key={row[0]} className="flex-row gap-2.5">
          {row.map((n) => {
            const on = n === 8 ? value >= 8 : value === n;
            return (
              <Pressable
                key={n}
                onPress={() => onChange(n === 8 && value >= 8 ? value + 1 : n)}
                accessibilityRole="button"
                accessibilityLabel={n === 8 ? "8 or more guests" : `${n} guests`}
                accessibilityState={{ selected: on }}
                className="flex-1 items-center justify-center rounded-[22px]"
                style={{ minHeight: 64, backgroundColor: on ? colors.teal : colors.panel }}
              >
                <Text style={[type.key, { fontWeight: on ? "600" : "500", color: on ? colors.onSolid : colors.heading }]}>
                  {n === 8 ? "8+" : n}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}
