import { colors } from "@/lib/theme";
import React from "react";
import { Text, View } from "react-native";
import { type } from "../lib/type";
import { Button, type ButtonProps } from "./Button";

export type StickyAction = ButtonProps;

/**
 * The artifact's `.bb`: buttons in a row (or stacked with `column`), 10dp
 * apart, 16dp side padding, with an optional centred hint under them. Sits
 * in the thumb zone; the bottom safe-area inset is the container's job.
 */
export function StickyActionBar({
  actions,
  column = false,
  hint,
}: {
  actions: StickyAction[];
  column?: boolean;
  hint?: string;
}) {
  return (
    <View className="px-4 pb-3 pt-3">
      <View className={column ? "gap-1.5" : "flex-row gap-2.5"}>
        {actions.map((a) => (
          <Button key={a.label} {...a} fit={column ? false : a.fit} />
        ))}
      </View>
      {hint ? (
        <Text
          className="mt-1.5 text-center"
          style={[type.hint, { color: colors.muted }]}
        >
          {hint}
        </Text>
      ) : null}
    </View>
  );
}
