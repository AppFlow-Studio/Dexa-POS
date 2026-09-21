import { colors } from "@/lib/theme";
import React from "react";
import { Text, View } from "react-native";
import { type } from "../lib/type";

/** The artifact's `.msg`: centred 24/600 title over a 16dp explanation. */
export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <View className="flex-1 items-center justify-center px-8 py-12">
      <Text className="text-center" style={[type.message, { color: colors.heading }]}>
        {title}
      </Text>
      {hint ? (
        <Text className="mt-3 text-center" style={[type.messageDesc, { color: colors.label }]}>
          {hint}
        </Text>
      ) : null}
    </View>
  );
}
