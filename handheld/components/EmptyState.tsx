import { colors } from "@/lib/theme";
import React from "react";
import { Text, View } from "react-native";

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <View className="flex-1 items-center justify-center px-8 py-12">
      <Text
        className="text-center text-lg font-semibold"
        style={{ color: colors.heading }}
      >
        {title}
      </Text>
      {hint ? (
        <Text
          className="mt-1 text-center text-sm"
          style={{ color: colors.muted }}
        >
          {hint}
        </Text>
      ) : null}
    </View>
  );
}
