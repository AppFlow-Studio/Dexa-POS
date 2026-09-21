import { colors } from "@/lib/theme";
import { ArrowLeft } from "lucide-react-native";
import React from "react";
import { Text, View } from "react-native";
import { metrics } from "../lib/tokens";
import { type } from "../lib/type";
import { IconButton } from "./IconButton";

/**
 * The artifact's `.bar`, the header of a pushed page: 64dp, a 48dp back
 * button, a 20/500 title with a 13dp line under it, and an optional right
 * slot (the "more" button lands there in Wave 2).
 */
export function PageHeader({
  title,
  subtitle,
  onBack,
  right,
}: {
  title: string;
  subtitle?: string;
  onBack: () => void;
  right?: React.ReactNode;
}) {
  return (
    <View className="flex-row items-center px-1" style={{ minHeight: metrics.bar }}>
      <IconButton label="Back" onPress={onBack}>
        <ArrowLeft size={24} color={colors.heading} />
      </IconButton>
      <View className="min-w-0 flex-1 pl-1">
        <Text
          style={[type.pageTitle, { color: colors.heading }]}
          numberOfLines={1}
        >
          {title}
        </Text>
        {subtitle ? (
          <Text
            className="mt-0.5"
            style={[type.pageSubtitle, { color: colors.label }]}
            numberOfLines={1}
          >
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right}
    </View>
  );
}
